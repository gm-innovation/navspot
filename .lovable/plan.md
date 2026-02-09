

# Fix v7.1.59b-deploy: Bump VERSION do mikrotik-sync

## Problema

O `mikrotik-sync/index.ts` ainda tem `VERSION = "7.1.52"` (linha 9). As mudancas de tokenizacao e pos-stringify replace ja estao no codigo, mas sem o bump de versao e impossivel confirmar via logs que o deploy foi efetivo.

O `mikrotik-scripts/index.ts` ja esta em `VERSION = "7.1.59"` (confirmado no diff anterior).

## Mudanca

| Arquivo | Linha | De | Para |
|---------|-------|----|------|
| `supabase/functions/mikrotik-sync/index.ts` | 9 | `const VERSION = "7.1.52"` | `const VERSION = "7.1.59b"` |

Uma unica linha. Nenhuma outra alteracao necessaria — a tokenizacao e a telemetria granular ja foram aplicadas nos edits anteriores.

## Redeploy

Ambas as Edge Functions serao redeployadas para garantir invalidacao de cache:
- `mikrotik-sync`
- `mikrotik-scripts`

## Verificacao pos-deploy

1. Checar logs do backend: deve mostrar `v7.1.59b` nas requests de sync
2. Chamar `mikrotik-scripts?type=sync-raw` via curl para confirmar que o script contem telemetria granular (mensagens `tele-hs-find`, `tele-lb`, `tele-lu`)
3. No roteador, reimportar bootstrap e executar `/system script run navspot-sync`
4. Logs do roteador devem mostrar `NAVSPOT-SYNC v7.1.59` (vindo do mikrotik-scripts) e telemetria granular
5. `/ip hotspot profile print detail where name=hsprof-navspot` deve mostrar `login-url` com `$(mac)`
6. Testar login do tripulante

## Resultado esperado

- Backend: `[mikrotik-sync] v7.1.59b` nos logs
- Roteador: `NAVSPOT-SYNC v7.1.59` com sub-steps de telemetria
- Profile: `login-url` contendo `$(mac)` literal
- Loop de reparo cessado
- Login funcional

