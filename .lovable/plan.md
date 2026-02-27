

# Substituir templates sync + sync-standalone pelo modelo simplificado validado

## Diagnóstico
Os templates atuais (v7.9.21) usam `:toarray` e parsing complexo com muitos níveis de aninhamento que causam "expected end of command" no hAP ax². O modelo validado pelo usuário em hardware real usa:
- **Early exit** via `:error` em vez de `if` gigante aninhado
- **Handlers flat** com blocos `{ }` inline
- **Sem `:toarray`** — busca direta por `|`
- **4 handlers**: `create_whitelist_domain`, `create_profile`, `block_quota`, `unblock_quota`

## Mudanças

### 1. UPDATE template `sync` (source puro)
Substituir conteúdo inteiro pelo modelo validado com placeholders:

```text
:local scriptName "NAVSPOT-SYNC"
:global navspotSyncLock
:if ([:typeof $navspotSyncLock] = "nothing") do={ :set navspotSyncLock 0 }
:if ($navspotSyncLock = 1) do={ :error "lock" }
:set navspotSyncLock 1

:local tk "{{SYNC_TOKEN}}"
:local identity ([/system identity get name] . "-" . [/system routerboard get serial-number])

:do {
    :local res [/tool fetch url="{{SYNC_URL}}" ...]
    :if ($res->"status" != "finished" ...) do={ :error "fail" }  ← early exit
    :local body ($res->"data")
    :if ($s < 0 || $e <= $s) do={ :error "none" }               ← early exit
    # handlers flat: create_whitelist_domain, create_profile, block_quota, unblock_quota
} on-error={ :log error "Erro critico" }
:set navspotSyncLock 0
```

### 2. UPDATE template `sync-standalone` (installer .rsc)
Reconstruir com o novo source usando escaping correto (`\$`, `\"`, `\\\"`) + cleanup idempotente + scheduler + `:delay 2s`.

### 3. Arquivos
- **SQL data update** — UPDATE `script_templates` para `sync` e `sync-standalone`
- **`.lovable/plan.md`** — atualizar status
- Sem alteração no `gen7post/index.ts` (já está em 7.9.21)

