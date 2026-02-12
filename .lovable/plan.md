

# v7.7.0: Arquitetura Modular + Hardening do Serve Mode

## Resumo

Implementar a abordagem modular com 3 scripts independentes (.rsc), corrigir o template `installer` que ainda aponta para `/mt-scripts`, fortalecer o serve mode com headers corretos e observabilidade, e adicionar aba "Modular" no frontend.

## Parte 1: Fix Imediato - Template Installer (SQL)

O template `installer` na tabela `script_templates` (linha 9) ainda usa `:local ep "/mt-scripts"`. Isso causa o 404 atual.

**Correcao via SQL migration:**
- Trocar `:local ep "/mt-scripts"` para `:local ep "/mikrotik-script-generator"`
- Ajustar URLs de fetch para incluir `?mode=serve&` antes de `type=`
- Linha 29: `($apiBase . $ep . "?mode=serve&type=sync-raw&token="...)`
- Linha 64: `($apiBase . $ep . "?mode=serve&type=guardian-raw&token="...)`

## Parte 2: Novos Templates Modulares (SQL)

Criar 3 novos registros na tabela `script_templates`:

### Template `infra` (roda 1 vez)
Extraido do bootstrap atual (linhas 418-582 do gerador). Contem:
- Cleanup de instalacoes anteriores
- Validacao WAN + DNS
- Bridge, IP, DHCP, NAT
- Hotspot profile (cookie=30m)
- WiFi migration (WifiWave2 + legacy)
- Walled Garden inicial
- Token file
- Placeholders: `{{VERSION}}`, `{{SYNC_TOKEN}}`, variaveis de rede injetadas pelo serve handler

### Template `sync-standalone`
Wrapper que cria o script + scheduler sem depender de fetch:
```text
# Remove sync antigo
# Cria /system script add name="navspot-sync" source={...conteudo do template sync...}
# Cria scheduler interval={{SYNC_INTERVAL}}m
# Executa primeiro sync
```
O serve handler buscara o template `sync` existente e o encapsulara no wrapper standalone automaticamente.

### Template `guardian-standalone`
Mesmo padrao: wrapper que cria script + scheduler do guardian.

## Parte 3: Edge Function - Hardening do Serve Mode

Alteracoes em `mikrotik-script-generator/index.ts`:

### 3.1 Headers melhorados
```text
Content-Type: text/plain; charset=utf-8  (ja existe)
Cache-Control: no-store, max-age=0       (atualizar de no-cache para no-store)
X-Navspot-Version: 7.7.0                 (adicionar)
```

### 3.2 Health endpoint expandido
```text
GET ?mode=health retorna:
{
  version: "7.7.0",
  status: "ok",
  deployed_at: "...",
  templates: ["sync","guardian","installer","infra","sync-standalone","guardian-standalone"]
}
```
Inclui verificacao de templates disponiveis no banco.

### 3.3 Novos tipos no serve mode
Adicionar suporte a:
- `type=infra` - retorna template de infraestrutura
- `type=sync-standalone` - busca template `sync`, encapsula em wrapper standalone
- `type=guardian-standalone` - busca template `guardian`, encapsula em wrapper standalone

### 3.4 Observabilidade
- Logar token truncado (primeiros 4 + ultimos 4 caracteres) em vez do token completo
- Registrar `last_used_at` no campo do hotspot apos cada request serve (via update no hotspot)
- Incluir latencia no log

### 3.5 Version bump
VERSION "7.6.3" para "7.7.0"

## Parte 4: Frontend - Aba Modular no ScriptModal

### 4.1 Hook `useDownloadModularScript`
Novo hook em `useHotspots.ts` que faz fetch no endpoint `?mode=serve&type=XXX&token=YYY` e dispara download do .rsc.

### 4.2 ScriptModal.tsx - Aba Modular
Adicionar Tabs com duas abas:
- **Bootstrap** (conteudo atual - modo automatico)
- **Modular** (novo - 3 botoes de download)

Na aba Modular:
- Botao "1. Infraestrutura" - baixa infra.rsc
- Botao "2. Sync" - baixa sync-standalone.rsc
- Botao "3. Guardian" - baixa guardian-standalone.rsc
- Instrucoes passo-a-passo inline
- Cada botao mostra tamanho do arquivo apos download

### 4.3 Corrigir URL de atualizacao
O bloco "Atualizar Scripts" no ScriptModal ainda usa `/mt-scripts`. Atualizar para `/mikrotik-script-generator?mode=serve`.

## Parte 5: Seguranca

- Token no query param e tratado como credencial (ja validado contra DB)
- Logs usam hash parcial do token (4+4 chars)
- Templates retornados como text/plain sem JSON wrapping

## Ordem de Implementacao

1. SQL migration: corrigir template `installer` + criar 3 novos templates
2. Edge Function: adicionar novos tipos serve + health expandido + headers + v7.7.0
3. Deploy edge function
4. Testar: `curl ?mode=health` e `curl ?mode=serve&type=infra&token=...`
5. Frontend: aba Modular no ScriptModal + hook de download
6. Corrigir URL no bloco "Atualizar Scripts"

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| SQL migration | Fix installer template + 3 novos templates |
| `mikrotik-script-generator/index.ts` | v7.7.0, novos tipos serve, health expandido, headers, observabilidade |
| `src/components/modals/ScriptModal.tsx` | Aba Modular com Tabs + 3 botoes download + instrucoes |
| `src/hooks/useHotspots.ts` | Hook `useDownloadModularScript` |

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Funcao exceder limite do bundler | Handler serve e minimal: lookup DB + replace placeholders |
| Token exposto em logs | Apenas 4+4 chars logados |
| Encoding quebra RouterOS | Templates testados com LF, UTF-8 sem BOM |
| Bootstrap antigo para de funcionar | Template installer corrigido na mesma migration |

