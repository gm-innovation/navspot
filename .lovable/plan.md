

# Corrigir 3 templates: Wi-Fi Inactive, Login direto, Consumo zerado

## Mudanças

### 1. Template `infra` — Fix WifiWave2 datapath
- Adicionar `/interface wifi datapath set [find name=$w] bridge=$bridgeHS` antes do fallback `set datapath.bridge`
- Adicionar `/interface wifi enable [find name=$w]` para garantir rádio ativo
- Adicionar `http-cookie-lifetime=0s` no hotspot profile

### 2. Template `sync` — Re-adicionar telemetria + 7 handlers

**Telemetria pré-fetch** (coleta antes do POST):
- Loop em `/ip hotspot active` → `active_users_csv` (user,mac,bytes-in,bytes-out,uptime)
- Loop em `/ip hotspot user` → `registered_users_csv`
- Loop em `/ip hotspot user profile` → `registered_profiles_csv`
- Leitura de `login-by` e `login-url` do profile `hsprof-navspot`
- Envio no JSON body do fetch

**Handlers flat pós-fetch** (adicionados aos 4 existentes):
- `create_user` — find+add/set idempotente com user, password, profile
- `configure_hotspot_profile` — set login-by, dns-name no profile
- `create_blacklist_domain` — walled garden deny

### 3. Template `sync-standalone` — Reconstruir com novo sync
- Escaping triplo (`\$` → `\\$`, `"` → `\"`, `\"` → `\\\"`)
- Cleanup + scheduler + delay 2s

### 4. `.lovable/plan.md` — atualizar status

### Arquivos modificados
- SQL UPDATE nos 3 templates no banco `script_templates`
- `.lovable/plan.md`
- Sem alteração em edge functions

