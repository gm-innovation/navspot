
# Correção v7.1.15: Resposta JSON Otimizada para RouterOS

## Diagnóstico Confirmado

O RouterOS está recebendo a resposta JSON, mas o log mostra `prefix=` **vazio**, indicando que:

1. A resposta JSON é muito grande (~3KB+ com todos os campos)
2. O campo `pending_actions_pipe` está no **final** da resposta 
3. Se o RouterOS truncar ou falhar ao ler o arquivo, os marcadores `[[...]]` não são encontrados

**Evidência**: A resposta contém muitos campos desnecessários para o RouterOS:
- `firewall_rules` (7 regras complexas com arrays aninhados)
- `pending_actions` (array completo de objetos)
- `device_violations`, `blocked_devices`, `server_time`

O RouterOS só precisa do `pending_actions_pipe`!

## Solução: Resposta Minimal para RouterOS

Reestruturar a resposta para colocar os marcadores `[[...]]` no **início** do JSON ou retornar uma resposta muito mais enxuta.

### Opção Escolhida: Pipe First

Colocar `pending_actions_pipe` como **primeiro campo** do JSON e simplificar a resposta:

```json
{
  "pending_actions_pipe": "[[...]]",
  "success": true,
  "server_time": "..."
}
```

Em vez de:

```json
{
  "blocked_devices": [],
  "device_violations": [],
  "firewall_rules": [...],
  "pending_actions": [...],
  "pending_actions_pipe": "[[...]]",
  "success": true
}
```

## Mudanças Técnicas

### Arquivo: `supabase/functions/mikrotik-sync/index.ts`

**1) Reordenar campos JSON na resposta (linha ~1495)**

Alterar de:
```typescript
return new Response(
  JSON.stringify({
    success: true,
    pending_actions: expandedActions,
    pending_actions_pipe: formattedPipe,
    firewall_rules: firewallRules,
    device_violations: deviceViolations,
    blocked_devices: blockedDevices,
    server_time: new Date().toISOString()
  }),
```

Para:
```typescript
return new Response(
  JSON.stringify({
    pending_actions_pipe: formattedPipe,  // FIRST - RouterOS scans for [[
    success: true,
    server_time: new Date().toISOString(),
    // Keep other fields for debugging but move to end
    pending_actions: expandedActions,
    firewall_rules: firewallRules,
    device_violations: deviceViolations,
    blocked_devices: blockedDevices
  }),
```

**2) Bump VERSION para 7.1.15**

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

**3) Adicionar log de tamanho da resposta no sync source (diagnóstico adicional)**

No `generateSyncSource()`, adicionar log do tamanho do arquivo:
```routeros
:local fsize 0
:do { :set fsize [/file get "navspot-resp.txt" size] } on-error={}
:log info ("NAVSPOT-SYNC: Resp recebida (" . $fsize . " bytes)")
```

**4) Bump VERSION para 7.1.15**

### Frontend (version sync)

- `src/components/modals/ScriptModal.tsx`: Bump scriptVersion para 7.1.15
- `src/pages/Embarcacoes.tsx`: Bump currentScriptVersion para 7.1.15

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

## Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Reordenar JSON com `pending_actions_pipe` primeiro, bump v7.1.15 |
| `supabase/functions/mikrotik-scripts/index.ts` | Adicionar log de tamanho da resposta, bump v7.1.15 |
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
