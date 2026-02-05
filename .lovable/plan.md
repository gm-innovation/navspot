
# Correção v7.1.15: Resposta JSON Otimizada para RouterOS ✅

## Status: IMPLEMENTADO

## Diagnóstico Confirmado

O RouterOS estava recebendo a resposta JSON, mas o log mostrava `prefix=` **vazio**, indicando que:

1. A resposta JSON era muito grande (~3KB+ com todos os campos)
2. O campo `pending_actions_pipe` estava no **final** da resposta 
3. Se o RouterOS truncar ou falhar ao ler o arquivo, os marcadores `[[...]]` não são encontrados

## Solução Implementada: Pipe First + File Size Logging

### Mudanças Técnicas

1. **mikrotik-sync/index.ts**: Reordenado JSON com `pending_actions_pipe` como primeiro campo
2. **mikrotik-scripts/index.ts**: Adicionado log de tamanho do arquivo após fetch (`Resp recebida (XXX bytes)`)
3. **Todas as versões**: Bump para 7.1.15

### Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | JSON reordenado: `pending_actions_pipe` primeiro, bump v7.1.15 |
| `supabase/functions/mikrotik-scripts/index.ts` | Log de tamanho de resposta, bump v7.1.15 |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump v7.1.15 |
| `src/components/modals/ScriptModal.tsx` | Bump scriptVersion v7.1.15 |
| `src/pages/Embarcacoes.tsx` | Bump currentScriptVersion v7.1.15 |

## Validação no MikroTik

```routeros
# 1. Importar bootstrap v7.1.15
/import navspot-bootstrap-v7.1.15.rsc

# 2. Rodar sync
/system script run navspot-sync

# 3. Verificar logs (deve mostrar tamanho e processar)
/log print where message~"NAVSPOT-SYNC"
# Esperado: "Resp recebida (XXX bytes)" e "pending_actions_pipe (N chars)"
```

## Resultado Esperado

Antes (v7.1.14):
```
fetch: file "navspot-resp.txt" downloaded
NAVSPOT-SYNC: Resposta invalida (prefix=)
```

Depois (v7.1.15):
```
fetch: file "navspot-resp.txt" downloaded
NAVSPOT-SYNC: Resp recebida (512 bytes)
NAVSPOT-SYNC: pending_actions_pipe (95 chars)
NAVSPOT-SYNC: Arquivo salvo (size=95)...
```
