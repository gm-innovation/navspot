

# Fix Firewall DHCP/DNS — v7.9.25

## Correção aplicada

Template `infra` atualizado para v7.9.25 com regras de firewall que permitem DHCP e DNS na `bridge-navspot`.

### Mudanças no template `infra`

1. **Cleanup**: adicionado `firewall filter remove [find comment="navspot"]`
2. **Regras accept** (seção 6, após NAT):
   - `chain=input protocol=udp dst-port=67 in-interface=bridge-navspot` (DHCP)
   - `chain=input protocol=udp dst-port=53 in-interface=bridge-navspot` (DNS UDP)
   - `chain=input protocol=tcp dst-port=53 in-interface=bridge-navspot` (DNS TCP)
3. Todas com `place-before=0` e `comment="navspot"`

### Arquivos modificados
- `script_templates.infra` — SQL UPDATE com firewall rules
- `gen7post/index.ts` — versão 7.9.25

### Rollout
- Regenerar scripts no painel (botão "Gerar Scripts")
- Reimportar `infra.rsc` no router
- Verificar com `/ip firewall filter print` que as 3 regras navspot estão no topo
- Testar conexão do celular: deve receber IP 10.10.10.x
