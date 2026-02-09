

# Fix: Alinhar VERSION do bootstrap (mikrotik-script-generator) para 7.1.54

## Situacao atual

- `mikrotik-scripts/index.ts` (sync): **v7.1.54** - ja deployado e funcionando
- `mikrotik-script-generator/index.ts` (bootstrap): **v7.1.53** - desatualizado

O frontend gera o bootstrap via `mikrotik-script-generator`, que ainda esta em 7.1.53. Por isso o modal mostra "Script MikroTik v7.1.53".

O sync-raw ja esta em v7.1.54 (confirmado via curl).

## Mudanca (1 linha)

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts` (linha 8)

```
// ANTES
const VERSION = "7.1.53"

// DEPOIS
const VERSION = "7.1.54"
```

## Deploy

Redeployar `mikrotik-script-generator`. O frontend passara a mostrar v7.1.54 ao clicar em "Regenerar Script".

