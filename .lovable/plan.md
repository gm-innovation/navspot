

# Atualizar template infra para v7.9.27

## Mudanças no template `infra` (SQL UPDATE)

O template atual (v7.9.26) será substituído com estas correções:

1. **Seção 0 (nova)**: Desabilitar FastTrack antes de tudo
2. **Seção 1 cleanup**: Usar `comment~"navspot"` (wildcard) para NAT e filter — cobre `navspot-nat`, `navspot-nat-masq`, `navspot-nat-redirect`, etc.
3. **Seção 3 WiFi**: Consolidar set commands numa linha única
4. **Seção 3b**: Remover dry-run — migração sempre aplica
5. **Seção 5 NAT**: Adicionar regra `dstnat` redirect HTTP→64872 + mover regras para topo
6. **Seção 6 firewall**: Mover regras para topo após criação
7. **Seção 7 profile**: Adicionar `dns-name="portal.navspot.com.br"`
8. **Host cleanup**: Sempre executar (sem condicional dry-run)

## Mudanças em `gen7post/index.ts`

- Bump `V` de `"7.9.26"` para `"7.9.27"`
- Remover `{{DRY_RUN}}` do mapa de variáveis (não mais usado)

## Mudanças em `.lovable/plan.md`

- Documentar v7.9.27: FastTrack, NAT redirect, dns-name, remoção dry-run

## Template infra completo v7.9.27

```routeros
# NAVSPOT INFRA {{VERSION}} - ULTRA-STABLE ISOLATION
# ether1 = WAN (NUNCA TOCAR), ether2 = gerencia (NUNCA TOCAR)
:log info "NAVSPOT-INFRA {{VERSION}}: Iniciando configuracao ISOLADA e FORCADA..."

:local bridgeHS "bridge-navspot"
:local lanIp "{{GATEWAY}}"
:local lanNet "{{NETWORK_CIDR}}"
:local hspName "hsprof-navspot"
:local hsName "hs-navspot"

# 0. Desabilitar FastTrack (Obrigatorio para Hotspot funcionar)
/ip firewall filter disable [find action=fasttrack-connection]
:log info "NAVSPOT: FastTrack desabilitado para garantir interceptacao"

# 1. Cleanup Seguro (wildcard navspot)
:do { /ip hotspot remove [find name=$hsName] } on-error={}
:do { /ip hotspot profile remove [find name=$hspName] } on-error={}
:do { /ip address remove [find comment="navspot-gw"] } on-error={}
:do { /ip pool remove [find name="pool-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip firewall nat remove [find comment~"navspot"] } on-error={}
:do { /ip firewall filter remove [find comment~"navspot"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment="navspot"] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment="navspot"] } on-error={}

# 2. Criar Bridge Isolada
:if ([:len [/interface bridge find name=$bridgeHS]] = 0) do={
  /interface bridge add name=$bridgeHS comment="navspot-isolated"
}

# 3. DATAPATH NOMEADO para WifiWave2 (hAP ax2)
/interface wifi datapath
:if ([:len [find name="dp-navspot"]] = 0) do={
  add name="dp-navspot" bridge=$bridgeHS
} else={
  set [find name="dp-navspot"] bridge=$bridgeHS
}

:do { /interface bridge port remove [find interface=wifi1] } on-error={}
:do { /interface bridge port remove [find interface=wifi2] } on-error={}

:foreach w in={"wifi1";"wifi2"} do={
  :if ([:len [/interface wifi find name=$w]] > 0) do={
    :do { /interface wifi disable $w } on-error={}
    :delay 1s
    :do { /interface wifi set $w datapath=dp-navspot security.authentication-types="" security.passphrase="" configuration.ssid="{{EMBARCACAO_NOME}}" } on-error={}
    :do { /interface wifi enable $w } on-error={}
  }
}

# 3b. Migrar portas fisicas (ether3+)
:local ethList [/interface ethernet find]
:foreach idx in=$ethList do={
  :local ifname [/interface ethernet get $idx name]
  :if (($ifname != "ether1") && ($ifname != "ether2")) do={
    :local isDisabled [/interface ethernet get $idx disabled]
    :if ($isDisabled = false) do={
      :do { /interface bridge port remove [find interface=$ifname] } on-error={}
      /interface bridge port add interface=$ifname bridge=$bridgeHS comment="navspot-managed"
      :log info ("NAVSPOT: Porta " . $ifname . " movida para " . $bridgeHS)
    }
  }
}

# 4. IP e DHCP na Bridge Isolada
/ip address add address=($lanIp . "/24") interface=$bridgeHS comment="navspot-gw"
/ip pool add name="pool-navspot" ranges="{{POOL_START}}-{{POOL_END}}"
/ip dhcp-server add name="dhcp-navspot" interface=$bridgeHS address-pool="pool-navspot" disabled=no lease-time=30m
/ip dhcp-server network add address=$lanNet gateway=$lanIp dns-server=8.8.8.8,1.1.1.1 comment="navspot"

:do { /ip dhcp-server disable [find name="defconf"] } on-error={}

# 5. NAT e REDIRECT (captive portal)
/ip firewall nat add chain=srcnat src-address=$lanNet out-interface={{WAN_INTERFACE}} action=masquerade comment="navspot-nat-masq"
/ip firewall nat add chain=dstnat in-interface=$bridgeHS protocol=tcp dst-port=80 action=redirect to-ports=64872 comment="navspot-nat-redirect"

# 6. Firewall: permitir DHCP e DNS no TOPO
/ip firewall filter
add chain=input protocol=udp dst-port=67 in-interface=$bridgeHS action=accept comment="navspot-dhcp" place-before=0
add chain=input protocol=udp dst-port=53 in-interface=$bridgeHS action=accept comment="navspot-dns-udp" place-before=0
add chain=input protocol=tcp dst-port=53 in-interface=$bridgeHS action=accept comment="navspot-dns-tcp" place-before=0

# 7. Hotspot Profile (SEM COOKIE)
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"

# 8. Hotspot Server
/ip hotspot add name=$hsName interface=$bridgeHS profile=$hspName address-pool="pool-navspot" disabled=no

# 9. Walled Garden
:foreach d in={"{{SUPABASE_HOST}}";"cdn.jsdelivr.net";"*.gstatic.com";"*.googleapis.com";"connectivitycheck.gstatic.com";"*.navspot.com.br"} do={
  /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot"
}
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot"

# Limpeza final
/interface bridge host remove [find]
:log info "NAVSPOT-INFRA {{VERSION}}: CONCLUIDO. Teste agora o acesso via Wi-Fi ou ether3."
```

## Arquivos modificados

1. **SQL UPDATE `script_templates` (id='infra')** — template completo acima
2. **`gen7post/index.ts`** — bump versão para `7.9.27`, remover `{{DRY_RUN}}`
3. **`.lovable/plan.md`** — documentar v7.9.27
