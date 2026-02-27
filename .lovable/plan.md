

# Templates v7.9.23 — WifiWave2 completo ✅

## Status: CONCLUÍDO

### Correções aplicadas

#### 1. Template `infra` v7.9.23
- **Datapath nomeado**: Objeto `dp-navspot` em `/interface wifi datapath` com bridge correta
- **Bridge port removido**: Remove bridge ports manuais de wifi1/wifi2 que causavam INACTIVE
- **Atribuição direta**: `/interface wifi set $w datapath=dp-navspot`
- **WiFi aberto**: Remove `security.authentication-types` e `security.passphrase` para permitir captive portal
- **SSID configurado**: Define `configuration.ssid={{EMBARCACAO_NOME}}`
- **Cookie eliminado**: `http-cookie-lifetime=0s`

#### 2. Template `sync` v7.9.23
- **CSV corrigido**: `registered_users_csv` envia apenas usernames separados por vírgula

#### 3. Template `sync-standalone` v7.9.23
- Mesma correção do CSV com escaping triplo

### Validação no router
- `dp-navspot` criado ✅
- wifi1/wifi2 com `datapath=dp-navspot` ✅
- Sem bridge ports manuais de wifi ✅
- Hotspot + DHCP na bridge correta ✅
- **Pendente**: Reimportar infra.rsc para aplicar remoção de WPA
