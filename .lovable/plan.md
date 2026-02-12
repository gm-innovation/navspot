

# v7.6.3: Unificar Entrega de Scripts em um Unico Endpoint

## Problema

Ambas as Edge Functions `mt-scripts` e `mikrotik-script-generator` estao retornando **404** no gateway. O `mt-scripts` nunca conseguiu ser deployado com sucesso (problema persistente de registro). Enquanto isso, o bootstrap gerado aponta para `mt-scripts` para baixar os scripts sync/guardian, criando um deadlock: sem scripts no roteador, sem sync, sem heartbeat, hotspot permanentemente offline.

## Estrategia

Eliminar a dependencia do `mt-scripts` completamente, movendo sua logica para dentro do `mikrotik-script-generator`. Isso reduz de 2 funcoes para 1, eliminando o ponto de falha.

### Como funciona

O `mikrotik-script-generator` passa a ter dois modos de operacao:

1. **Modo bootstrap** (POST com body `{hotspot_id}`) - comportamento atual, gera o .rsc de provisionamento. Requer autenticacao JWT.
2. **Modo serve** (GET com `?mode=serve&type=sync-raw&token=xxx`) - entrega scripts sync/guardian/installer a partir dos templates do banco. SEM autenticacao (chamado pelo roteador).
3. **Modo health** (GET com `?mode=health`) - retorna versao e status para diagnostico.

## Alteracoes Tecnicas

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

Adicionar no inicio do handler (antes do check de auth) um bloco que intercepta requests GET com `mode=serve` ou `mode=health`:

```text
GET ?mode=health → JSON {version, status, deployed_at}
GET ?mode=serve&type=sync-raw&token=XXX → text/plain com script sync
GET ?mode=serve&type=guardian-raw&token=XXX → text/plain com script guardian
GET ?mode=serve&type=all&token=XXX → text/plain com script installer
POST (sem mode) → fluxo atual de bootstrap (com auth JWT)
```

A logica de serve e identica ao que ja existe no `mt-scripts/index.ts`:
- Valida token contra tabela `hotspots`
- Busca template na tabela `script_templates`
- Substitui placeholders (VERSION, SYNC_TOKEN, SYNC_URL, etc)
- Retorna text/plain com Cache-Control no-cache

### 2. URL do bootstrap

Na funcao `generateBootstrapScript` (linha 281), alterar:

```text
Antes: const scriptsUrl = `${supabaseUrl}/functions/v1/mt-scripts`
Depois: const scriptsUrl = `${supabaseUrl}/functions/v1/mikrotik-script-generator?mode=serve`
```

E no template RouterOS (linha 534), a URL construida pelo roteador fica:

```text
Antes: apiBase?type=all&token=XXX&ros_version=7
Depois: apiBase&type=all&token=XXX&ros_version=7
```

Note que como `mode=serve` ja esta no apiBase, os parametros adicionais usam `&` em vez de `?`.

### 3. Remover `mt-scripts`

- Deletar o diretorio `supabase/functions/mt-scripts/`
- Remover `[functions.mt-scripts]` do `supabase/config.toml`
- Executar `delete_edge_functions` para limpar do servidor

### 4. Bump de versao para 7.6.3

- `mikrotik-script-generator/index.ts`: VERSION "7.6.2" -> "7.6.3"

### 5. Deploy e verificacao

1. Editar `mikrotik-script-generator/index.ts` com a logica de serve
2. Deletar `mt-scripts`
3. Deploy `mikrotik-script-generator`
4. Testar: `curl mikrotik-script-generator?mode=health` → deve retornar 200
5. Testar: `curl mikrotik-script-generator?mode=serve&type=sync-raw&token=XXX` → deve retornar script
6. No MikroTik: `/import navspot-bootstrap-v7.6.3.rsc`
7. Verificar: `/system script print` → navspot-sync e navspot-guardian presentes
8. Verificar: `/log print where message~"NAVSPOT-SYNC"` → sync rodando

## Resumo

| Item | Mudanca |
|------|---------|
| `mikrotik-script-generator/index.ts` | VERSION 7.6.3, adicionar modo serve + health no GET, atualizar URL do bootstrap |
| `mt-scripts/` | Deletar completamente |
| `config.toml` | Remover secao mt-scripts (automatico) |

## Risco

Zero risco de regressao: toda a logica de `mt-scripts` e copiada integralmente para `mikrotik-script-generator`. O bootstrap gerado aponta para o novo endpoint unificado. O `mikrotik-sync` (heartbeat) nao e afetado.

