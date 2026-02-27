

# Templates v7.9.22 — Wi-Fi Inactive + Login direto + Consumo zerado ✅

## Status: CONCLUÍDO

### Correções aplicadas

#### 1. Template `infra` v7.9.22
- **WifiWave2 datapath**: Adicionado `/interface wifi datapath set [find name=$w] bridge=$bridgeHS` antes do fallback `set datapath.bridge`
- **Rádio enable**: Adicionado `/interface wifi enable [find name=$w]` para garantir rádio ativo
- **Cookie eliminado**: `http-cookie-lifetime=0s` no hotspot profile para forçar tela de login

#### 2. Template `sync` v7.9.22
- **Telemetria completa**: `active_users_csv` (user,mac,bytes-in,bytes-out,uptime), `registered_users_csv`, `registered_profiles_csv`, `hotspot_login_by`, `hotspot_login_url`
- **7 handlers flat**: create_whitelist_domain, create_blacklist_domain, create_profile, create_user (idempotente), configure_hotspot_profile, block_quota, unblock_quota

#### 3. Template `sync-standalone` v7.9.22
- Reconstruído com escaping triplo para novo sync
- Cleanup + scheduler + delay 2s + run imediato

### Próximos passos
- Regenerar scripts via gen7post para o hotspot
- Importar infra.rsc no router (reset + cole)
- Importar sync.rsc ou sync-standalone via Winbox
- Validar: login deve exigir autenticação, consumo deve aparecer após sync
