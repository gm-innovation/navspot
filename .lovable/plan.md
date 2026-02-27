

# Templates v7.9.23 — WifiWave2 datapath nomeado + CSV fix ✅

## Status: CONCLUÍDO

### Correções aplicadas

#### 1. Template `infra` v7.9.23
- **Datapath nomeado**: Criado objeto `dp-navspot` em `/interface wifi datapath` com bridge correta
- **Bridge port removido**: Remove bridge ports manuais de wifi1/wifi2 que causavam INACTIVE
- **Atribuição direta**: `/interface wifi set $w datapath=dp-navspot` em vez de bridge port
- **Cookie eliminado**: `http-cookie-lifetime=0s` mantido

#### 2. Template `sync` v7.9.23
- **CSV corrigido**: `registered_users_csv` agora envia apenas usernames separados por vírgula
- **Antes**: `$u . "," . $p . ";"` → `user,profile;user,profile;`
- **Depois**: `$u . ","` → `user1,user2,`

#### 3. Template `sync-standalone` v7.9.23
- Mesma correção do CSV com escaping triplo

### Próximos passos
- Regenerar scripts via gen7post para o hotspot
- Importar `infra.rsc` no router (corrige Wi-Fi INACTIVE)
- Importar `sync-standalone.rsc` (corrige telemetria CSV)
- Validar: Wi-Fi sem flag I, login obrigatório, consumo visível
