

# Migração automática de portas AP + dry-run — v7.9.26

## Problema resolvido

APs externos conectados em portas físicas (ether3+) permaneciam na bridge padrão do RouterOS. Clientes WiFi via AP recebiam IP do DHCP defconf (192.168.88.x) em vez do dhcp-navspot (10.10.10.x), impedindo o captive portal.

## Mudanças aplicadas

### Template `infra` (v7.9.26)

1. **Seção 1 (cleanup)**: firewall filter com comments específicos (`navspot-dhcp`, `navspot-dns-udp`, `navspot-dns-tcp`)
2. **Seção 3b (nova)**: migração automática de portas ether3+ para `bridge-navspot`
   - Pula ether1 (WAN), ether2 (gerência), SFP, master-port, disabled
   - Verifica se já está na bridge correta (idempotente)
   - Suporta `{{DRY_RUN}}` (`true` = só loga, `false` = aplica)
3. **Seção 6 (firewall)**: comments específicos por regra
4. **Limpeza de hosts**: condicional (só se `dryRun=false`)

### `gen7post/index.ts`

- Versão `7.9.26`
- Variável `{{DRY_RUN}}` adicionada (default `false`)

## Rollback

```routeros
:foreach p in=[/interface bridge port find comment="navspot-managed"] do={
  :local ifname [/interface bridge port get $p interface]
  :do { /interface bridge port remove $p } on-error={}
  :do { /interface bridge port add interface=$ifname bridge=bridge comment="restored" } on-error={}
}
```

## Checklist pós-deploy

1. `/interface bridge port print` — verificar portas com comment `navspot-managed`
2. `/ip dhcp-server lease print where address~"10.10.10."` — verificar leases
3. `/interface bridge host print where bridge=bridge-navspot` — verificar hosts
4. `/ip hotspot active print` — verificar sessões
5. `/log print where message~"NAVSPOT"` — verificar logs de migração
