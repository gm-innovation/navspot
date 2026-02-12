

# v7.8.0: Storage-First Script Delivery

## Contexto

A proposta do usuario e migrar de renderizacao em runtime (Edge Functions) para scripts pre-renderizados armazenados em Storage, servidos via URLs assinadas. Isso elimina a dependencia das Edge Functions instaveis para operacoes criticas de entrega de scripts.

## Decisao: Opcao A (Pre-render por hotspot)

A Opcao A e a mais adequada para a stack atual: pre-renderizar os 3 scripts (infra, sync, guardian) quando o hotspot e criado ou quando ha bump de versao, fazer upload para Storage, e servir via URLs assinadas de curta duracao.

## Arquitetura Proposta

```text
+------------------+     +------------------+     +------------------+
| Frontend (UI)    | --> | Edge Fn (minimal) | --> | Storage (bucket) |
| ScriptModal      |     | render + upload   |     | scripts/{id}/... |
| "Gerar Scripts"  |     | return signed URL |     | infra.rsc        |
+------------------+     +------------------+     | sync.rsc         |
                                                   | guardian.rsc     |
                                                   +------------------+
                                                          |
                                                   URLs assinadas
                                                          |
                                                   +------------------+
                                                   | MikroTik Router  |
                                                   | /tool fetch URL  |
                                                   | /import file.rsc |
                                                   +------------------+
```

## Plano Tecnico

### 1. Criar bucket de Storage (SQL migration)

Criar bucket privado `hotspot-scripts` para armazenar os .rsc renderizados.

- Bucket privado (nao publico) - acesso somente via URLs assinadas
- Path convention: `{hotspot_id}/{version}/infra.rsc`, `{hotspot_id}/{version}/sync.rsc`, `{hotspot_id}/{version}/guardian.rsc`
- RLS: service_role pode ler/escrever; usuarios autenticados podem ler arquivos do seu hotspot

### 2. Adicionar colunas na tabela hotspots (SQL migration)

Novas colunas para rastrear scripts gerados:

- `scripts_version` (text) - versao dos scripts gerados (ex: "7.8.0")
- `scripts_generated_at` (timestamptz) - quando foram gerados
- `scripts_storage_path` (text) - path base no storage (ex: "{hotspot_id}/7.8.0")

### 3. Nova Edge Function: `generate-scripts` (minimal)

Funcao unica e leve (~100 linhas) que:

1. Recebe `hotspot_id` via POST (autenticado)
2. Busca hotspot + embarcacao do banco
3. Busca os 3 templates (infra, sync-standalone, guardian-standalone) do banco
4. Renderiza substituindo placeholders (reutiliza logica de `deriveBootstrapVars` e `applyPlaceholders`)
5. Faz upload dos 3 arquivos para o bucket `hotspot-scripts`
6. Gera URLs assinadas (TTL 15 min) para cada arquivo
7. Atualiza `hotspots` com metadata (version, generated_at, storage_path)
8. Retorna as 3 URLs assinadas ao frontend

Estrategia de tokens: o `infra.rsc` salva o token em `navspot-token.txt` no router. O `sync.rsc` ja tem o token embutido (aceitavel porque servido via URL assinada de curta duracao).

### 4. Atualizar Edge Function existente: `mikrotik-script-generator`

Simplificar drasticamente:

- Manter apenas o handler POST que agora chama a logica de render+upload+signed-URL
- Manter o health check (`?mode=health`)
- Remover toda a logica de `mode=serve` (nao mais necessaria - Storage serve os arquivos)
- Resultado: ~80 linhas no total

Alternativa: manter `mode=serve` como fallback para routers que ja usam esse endpoint, mas retornando redirect para a URL assinada do Storage.

### 5. Atualizar frontend

**ScriptModal.tsx:**
- Botao "Gerar Scripts" agora recebe 3 URLs assinadas do backend
- Download direto das URLs (sem precisar do hook `useModularScripts`)
- Mostrar TTL restante das URLs (ex: "Valido por 15 minutos")

**useHotspots.ts:**
- `useGenerateHotspotScript` retorna objeto com `infra_url`, `sync_url`, `guardian_url` em vez de script text

**useModularScripts.ts:**
- Simplificar ou remover - nao precisa mais fazer fetch para Edge Function serve mode

### 6. Seguranca

- Bucket privado: sem acesso publico
- URLs assinadas com TTL de 15 minutos (suficiente para download + import)
- Token do sync embutido no script mas protegido pela URL assinada
- Rotacao de token: ao rotacionar sync_token, regenerar scripts automaticamente
- Auditoria: `scripts_generated_at` no DB para rastreamento

### 7. Bootstrap automatico (routers autonomos)

Para routers que precisam buscar scripts autonomamente (sem interacao do usuario):

- Manter o endpoint `mode=serve` como fallback fino que gera URL assinada on-the-fly e retorna redirect 302
- Ou: pre-gerar URLs de longa duracao (1h) e armazenar no DB para o bootstrap usar

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| SQL migration | Criar bucket `hotspot-scripts`, adicionar colunas `scripts_version`, `scripts_generated_at`, `scripts_storage_path` na tabela hotspots |
| `supabase/functions/mikrotik-script-generator/index.ts` | Simplificar: render + upload para Storage + retornar URLs assinadas |
| `src/hooks/useHotspots.ts` | `useGenerateHotspotScript` retorna URLs assinadas |
| `src/hooks/useModularScripts.ts` | Simplificar para usar URLs diretas do Storage |
| `src/components/modals/ScriptModal.tsx` | Atualizar UI para download via URLs assinadas com indicador de TTL |

## Ordem de Execucao

1. Criar bucket Storage + colunas no DB (migration)
2. Atualizar Edge Function para render + upload + signed URLs
3. Deploy da Edge Function
4. Atualizar frontend (hooks + ScriptModal)
5. Testar fluxo completo: Gerar -> Download -> Import no MikroTik
6. Validar TTL das URLs (expiram apos 15 min)
7. Remover codigo morto (serve mode antigo, se nao mais necessario)

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| URLs expiram antes do usuario importar | TTL de 15 min e generoso; botao "Regenerar URLs" no frontend |
| Bucket storage nao acessivel pelo router | URLs assinadas sao HTTPS publicos temporarios - acessiveis de qualquer rede |
| Encoding do arquivo no Storage | Upload com Content-Type text/plain; charset=utf-8 explicito |
| Routers antigos que usam mode=serve | Manter fallback no endpoint por 1-2 versoes |
| Token exposto se URL vazar | TTL curto (15 min) limita janela de exposicao |

## Beneficios Esperados

- Elimina problemas de deploy/propagacao do bundler Deno
- Edge Function reduzida para ~80 linhas (zero risco de timeout)
- Scripts prontos no Storage: download instantaneo sem processamento
- URLs assinadas: seguranca sem complexidade
- Rollback facil: versoes anteriores permanecem no Storage

