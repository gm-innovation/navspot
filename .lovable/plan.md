

# Template `infra` v7.9.21 — Isolamento seguro ✅

## Status: CONCLUÍDO

Template `infra` atualizado com modelo de isolamento seguro validado em hardware.

### Regras de segurança aplicadas
- **ether1** (WAN): NUNCA tocada — não referenciada como bridge port
- **ether2** (gerência): NUNCA tocada — não referenciada como bridge port
- Apenas Wi-Fi (wifi1/wifi2) migrados para `bridge-navspot`

### Estrutura aplicada
- **Bridge isolada** `bridge-navspot` (não usa `bridge1` genérica)
- **Cleanup idempotente** por comment `navspot-*`
- **Migração Wi-Fi**: move wifi1/wifi2 + configura `datapath.bridge` (WifiWave2/hAP ax²)
- **NAT restrito**: `src-address={{NETWORK_CIDR}} out-interface={{WAN_INTERFACE}}`
- **Sem cookie** no hotspot profile (força tela de login)
- **Walled garden**: Supabase, Google CNA, CDN, navspot.com.br + DNS UDP/TCP

### Consistência com bootstrap
O `bootstrap` já protege ether1/ether2 corretamente. Nenhuma alteração necessária.

### Próximos passos
- Testar com `gen7post` mode=serve type=infra
- Validar em hardware real (reset + cole no terminal)
- Re-adicionar handlers removidos do sync (create_user, configure_hotspot_profile)
