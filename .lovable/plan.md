

# Split: Dividir mikrotik-script-generator em funcoes menores

## Problema

A Edge Function `mikrotik-script-generator` (294 linhas) excede o limite de 60s do bundler Deno, causando falha silenciosa no deploy (404 permanente). Uma versao minima (16 linhas) deploya sem problemas.

## Estrategia

Criar uma funcao orquestradora leve (`mikrotik-script-generator`) que delega a renderizacao para uma funcao auxiliar (`mikrotik-render-template`). A orquestradora cuida de autenticacao, validacao e upload para Storage. A auxiliar cuida apenas de buscar template + substituir placeholders.

**Por que nao 3 funcoes separadas?** O frontend atual chama uma unica funcao POST que gera os 4 scripts de uma vez e retorna URLs assinadas. Manter esse contrato evita mudancas no frontend. O problema do bundler e resolvido simplesmente reduzindo o tamanho de cada funcao individual.

## Arquitetura

```text
Frontend (POST /mikrotik-script-generator)
    |
    v
mikrotik-script-generator (orquestrador ~80 linhas)
    |-- Valida auth + hotspot_id
    |-- Busca dados do hotspot
    |-- Chama mikrotik-render-template 4x (via fetch interno)
    |-- Upload 4 .rsc para Storage
    |-- Retorna signed URLs
    |
    v
mikrotik-render-template (renderizador ~120 linhas)
    |-- Recebe: template_id + vars (JSON POST)
    |-- Busca template do banco
    |-- Substitui placeholders
    |-- Retorna texto puro
```

## Arquivos

| Arquivo | Acao | Tamanho |
|---------|------|---------|
| `supabase/functions/mikrotik-render-template/index.ts` | **CRIAR** | ~120 linhas |
| `supabase/functions/mikrotik-script-generator/index.ts` | **REESCREVER** | ~80 linhas |
| `supabase/config.toml` | Adicionar `[functions.mikrotik-render-template]` | 2 linhas |

**Nenhuma mudanca no frontend** — o contrato da API (POST com hotspot_id, resposta JSON com signed URLs) permanece identico.

## Detalhes Tecnicos

### 1. mikrotik-render-template (NOVA)

Funcao interna (service_role only) que recebe via POST:

```json
{
  "template_id": "sync-standalone",
  "vars": {
    "{{VERSION}}": "7.8.1",
    "{{SYNC_TOKEN}}": "abc123...",
    ...
  }
}
```

Retorna o script renderizado como `text/plain`. Contem:
- `normalizeNewlines()`
- `applyPlaceholders()`
- `renderTemplate()` (busca do banco + substituicao)

Validacao: aceita apenas requests com header `Authorization: Bearer <SERVICE_ROLE_KEY>` para evitar uso externo.

### 2. mikrotik-script-generator (REESCRITA)

Mantem o mesmo endpoint e contrato. Contem:
- `isBlockedNetwork()`
- `deriveVars()` (sem `buildMigrationCommands` e `buildWanConfig` que sao movidos para o render)
- Rota GET `?mode=health`
- Rota GET `?mode=serve` (legacy)
- Rota POST (gerar + upload + signed URLs)

Para renderizar cada template, faz fetch interno:

```typescript
async function renderViaFunction(templateId, vars) {
  const url = Deno.env.get('SUPABASE_URL') + '/functions/v1/mikrotik-render-template'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    },
    body: JSON.stringify({ template_id: templateId, vars })
  })
  if (!res.ok) throw new Error('Render failed: ' + templateId)
  return await res.text()
}
```

### 3. deriveVars simplificado

As funcoes `buildMigrationCommands()` e `buildWanConfig()` sao movidas para `mikrotik-render-template` pois geram strings RouterOS que so sao necessarias durante a renderizacao. O orquestrador passa apenas os parametros basicos (wanInterface, wanType, allLanPorts) como variaveis, e o renderizador constroi os comandos.

**Alternativa mais simples:** manter `deriveVars` completo no orquestrador (incluindo buildMigrationCommands e buildWanConfig) e passar o mapa de vars pronto para o renderizador. Isso evita duplicacao de logica e mantem o renderizador 100% generico.

Vou seguir a alternativa mais simples: `deriveVars` completo no orquestrador, renderizador so faz template + placeholders.

### 4. config.toml

```toml
[functions.mikrotik-render-template]
verify_jwt = false
```

## Ordem de Execucao

1. Criar `mikrotik-render-template/index.ts`
2. Atualizar `config.toml`
3. Deploy de `mikrotik-render-template`
4. Testar via curl (POST com template_id + vars)
5. Reescrever `mikrotik-script-generator/index.ts` (versao leve)
6. Deploy de `mikrotik-script-generator`
7. Testar health check
8. Testar geracao completa via frontend

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Latencia extra (4 fetches internos) | Chamadas em paralelo via Promise.all — overhead minimo (~50ms cada) |
| mikrotik-render-template tambem excede bundler | Funcao e muito pequena (~120 linhas, sem dependencias pesadas) |
| mode=serve legacy quebra | Mantido no orquestrador, delegando para render-template via fetch |
| Renderizador exposto publicamente | Validacao de service_role_key no header |

