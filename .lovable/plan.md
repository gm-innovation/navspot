

# Atualizar template `infra` para isolamento seguro (v7.9.21)

## Problema
O template `infra` atual (v7.7.1) usa `bridge1` genérica, não move interfaces Wi-Fi, e não protege explicitamente ether1 (WAN) e ether2 (gerência). Resultado: Hotspot numa bridge vazia, sem captive portal no Wi-Fi, risco de lockout.

## Regras de segurança (confirmadas pelo usuário)
- **ether1**: entrada de internet (WAN) — NUNCA tocar
- **ether2**: acesso de gerência ao router — NUNCA tocar
- Apenas Wi-Fi (wifi1/wifi2) e portas ether3+ são migradas para a bridge do hotspot

## Mudanças

### 1. UPDATE template `infra` no banco (`script_templates`)
Substituir conteúdo inteiro pelo modelo validado:

- **Bridge isolada** `bridge-navspot` em vez de `bridge1`
- **Cleanup por comment** `navspot-*` (idempotente, só remove o que o Navspot criou)
- **Migração Wi-Fi**: move `wifi1`/`wifi2` para `bridge-navspot` + configura `datapath.bridge` (WifiWave2)
- **Proteção explícita**: ether1 e ether2 nunca são referenciadas como slave/bridge port
- **NAT com src-address** restrito à rede do hotspot + `out-interface={{WAN_INTERFACE}}`
- **Sem cookie** no hotspot profile (força tela de login)
- **Walled garden** com domínios essenciais (Supabase, Google CNA, CDN)
- Placeholders: `{{VERSION}}`, `{{GATEWAY}}`, `{{NETWORK_CIDR}}`, `{{POOL_START}}`, `{{POOL_END}}`, `{{WAN_INTERFACE}}`, `{{SUPABASE_HOST}}`, `{{SYNC_TOKEN}}`
- Version bump para `7.9.21`

### 2. Atualizar `.lovable/plan.md`

### 3. Nota sobre consistência com bootstrap
O `bootstrap` já protege ether1/ether2 corretamente (remove WAN de bridges, firewall rules para gerência na ether2, `{{MIGRATION_COMMANDS}}` exclui ether1/ether2). Nenhuma alteração necessária no bootstrap.

