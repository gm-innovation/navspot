
INSERT INTO public.script_templates (id, version, content) VALUES ('bootstrap', '7.7.1', $bs$# =========================================
# NAVSPOT Bootstrap Script v{{VERSION}} - ULTRA-THIN
# Scripts baixados via API (sem source={} embutido)
# =========================================
# _build: {{VERSION}} | deployed_at={{DEPLOYED_AT}}
:log info "NAVSPOT v{{VERSION}}: Iniciando bootstrap ULTRA-THIN..."
# 0. CLEANUP
:log info "NAVSPOT v{{VERSION}}: Limpando instalacoes anteriores..."
:local fn1 "navspot-token.txt"
:local fn2 "navspot-resp.txt"
:local fn3 "navspot-recovery.rsc"
:local fn5 "navspot-actions.txt"
:do { /file remove [find where name=$fn1] } on-error={}
:do { /file remove [find where name=$fn2] } on-error={}
:do { /file remove [find where name=$fn3] } on-error={}
:do { /file remove [find where name=$fn5] } on-error={}
:foreach f in=[/file find where name~"^ns-install"] do={
:do { /file remove $f } on-error={}
}
:global navspotSyncLock; :set navspotSyncLock "0"
:global navspotSyncLockTime; :set navspotSyncLockTime 0
:do { /system script remove [find where name=navspot-sync] } on-error={}
# v7.3.0: action-processor removido (tudo inline no sync)
:do { /system script remove [find where name=navspot-guardian] } on-error={}
:do { /system scheduler remove [find where name=navspot-sync-scheduler] } on-error={}
:do { /system scheduler remove [find where name=navspot-guardian-scheduler] } on-error={}
:do { /tool netwatch remove [find where comment=navspot-netwatch] } on-error={}
:do { /ip hotspot remove [find name=hs-navspot] } on-error={}
:do { /ip hotspot profile remove [find name=hsprof-navspot] } on-error={}
:do { /ip dhcp-server remove [find name=dhcp-navspot] } on-error={}
:do { /ip dhcp-server network remove [find comment=navspot] } on-error={}
:do { /ip pool remove [find name=hs-pool-navspot] } on-error={}
:do { /ip address remove [find comment=navspot] } on-error={}
:do { /ip firewall nat remove [find comment=navspot-nat] } on-error={}
:do { /ip hotspot walled-garden remove [find comment=navspot-initial] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment=navspot-initial] } on-error={}
:do { /interface bridge port remove [find comment=navspot-lan] } on-error={}
:do { /interface bridge remove [find name=bridge1] } on-error={}
:do { /ip dhcp-client remove [find comment=navspot-wan] } on-error={}
:delay 2s
:log info "NAVSPOT v{{VERSION}}: Cleanup concluido"
# 1. VALIDACAO WAN
:local wanIf [/interface find name="{{WAN_INTERFACE}}"]
:if ([:len $wanIf] = 0) do={
:log error "NAVSPOT: ERRO CRITICO - Interface {{WAN_INTERFACE}} nao existe!"
:error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN ({{WAN_INTERFACE}}) validada"
# 2. CONFIGURAR DNS (ANTES de tudo - necessario para fetch)
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1
:log info "NAVSPOT: DNS configurado (8.8.8.8, 1.1.1.1)"
# 3. CONFIGURAR WAN
# v7.1.40: Garantir que WAN nao esta em nenhuma bridge (alguns firmwares incluem ether1 na bridge padrao)
:do { /interface bridge port remove [find interface={{WAN_INTERFACE}}] } on-error={}
{{WAN_CONFIG}}
# 4. IDENTIDADE
/system identity set name="{{EMBARCACAO_NOME}}"
# 4.5. GUARDRAIL: Verificar conflito de rede ANTES de criar bridge1 (v7.1.40)
:local networkBase "{{NETWORK_BASE}}"
:local conflict false
:foreach addr in=[/ip address find] do={
:local addrStr [/ip address get $addr address]
# v7.1.40: Usar operador regex para match robusto em ROS 7
:if ($addrStr ~ ("^" . $networkBase . "\\.")) do={
:set conflict true
:log error ("NAVSPOT v{{VERSION}}: CONFLITO - IP " . $addrStr . " ja existe na faixa " . $networkBase . ".x!")
}
}
:if ($conflict = true) do={
:log error "NAVSPOT v{{VERSION}}: ABORTANDO - Rede em uso"
:log error "NAVSPOT v{{VERSION}}: Altere a rede do hotspot no painel para outra faixa"
:error "NAVSPOT_ABORT_NETWORK_CONFLICT"
}
:log info "NAVSPOT v{{VERSION}}: Guardrail OK - nenhum conflito de rede"
# 5. CRIAR BRIDGE1
:do { /interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot" } on-error={}
:delay 1s
:log info "NAVSPOT: Bridge1 criada"
# 6. CONFIGURAR REDE
:do { /ip address add address={{GATEWAY}}/24 interface=bridge1 comment="navspot" } on-error={}
:do { /ip pool add name="hs-pool-navspot" ranges={{POOL_START}}-{{POOL_END}} } on-error={}
:do { /ip dhcp-server network add address={{NETWORK_CIDR}} gateway={{GATEWAY}} dns-server={{GATEWAY}} comment="navspot" } on-error={}
:do { /ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no } on-error={}
:log info "NAVSPOT: Rede IP configurada"
# 7. NAT
:do { /ip firewall nat add chain=srcnat out-interface={{WAN_INTERFACE}} action=masquerade comment="navspot-nat" } on-error={}
:log info "NAVSPOT: NAT configurado"
# 8. GERENCIA WINBOX
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
:do { /interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery" } on-error={}
/ip neighbor discovery-settings set discover-interface-list=mgmt
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
# v7.1.2: regras de gerencia sem place-before (evita erro em roteadores limpos)
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt"
:do { /ip firewall filter remove [find comment="navspot-allow-mndp-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt"
:log info "NAVSPOT: Gerencia configurada"
# 9. MIGRAR PORTAS LAN
:log info "NAVSPOT: Migrando portas LAN..."
{{MIGRATION_COMMANDS}}
:log info "NAVSPOT: Portas LAN migradas"
# 9.5. MIGRAR INTERFACES WIFI (v7.1.40 - hAP ax2 / WifiWave2)
:log info "NAVSPOT v{{VERSION}}: Verificando interfaces WiFi..."
:local wifiCount 0
# Tentar WifiWave2 (ROS 7.x - hAP ax2)
:do {
:foreach i in=[/interface wifi find] do={
:local wName [/interface wifi get $i name]
:log info ("NAVSPOT: Detectada interface WifiWave2: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
# v7.1.40: Delay para kernel processar mudanca de estado do radio
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
# Fallback: Tentar wireless legacy (ROS 6.x)
:if ($wifiCount = 0) do={
:do {
:foreach i in=[/interface wireless find] do={
:local wName [/interface wireless get $i name]
:log info ("NAVSPOT: Detectada interface wireless legacy: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
}
:if ($wifiCount > 0) do={
:log info ("NAVSPOT: " . $wifiCount . " interface(s) WiFi migrada(s) para bridge1")
} else={
:log info "NAVSPOT: Nenhuma interface WiFi detectada"
}
# 10. HOTSPOT MINIMO v7.1.46 (SEM login-url - sera configurada via sync)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address={{GATEWAY}} } on-error={}
# v7.1.47: Garantir login-by correto desde o inicio (sem aspas!)
/ip hotspot profile set [find name="hsprof-navspot"] login-by=cookie,http-pap,http-chap
/ip hotspot profile set [find name="hsprof-navspot"] http-cookie-lifetime=30m
:log info "NAVSPOT v{{VERSION}}: login-by=cookie,http-pap,http-chap aplicado"
:do { /ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no } on-error={}
:log info "NAVSPOT v{{VERSION}}: Hotspot criado (aguardando config via sync)"
# 10.1 WALLED GARDEN INICIAL (infraestrutura + Android CNA)
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.navspot.com.br" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.googleapis.com" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-initial"
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-initial"
:log info "NAVSPOT v{{VERSION}}: Walled Garden inicial configurado (5 regras)"
# 11. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="{{SYNC_TOKEN}}"
:log info "NAVSPOT: Token salvo"
# 12. AGUARDAR ESTABILIZACAO DA REDE (15s v7.1.1)
:log info "NAVSPOT v{{VERSION}}: Aguardando 15s para rede estabilizar..."
:delay 15s
# 12.1. VERIFICAR ROTA DEFAULT
:local hasRoute false
:do {
:local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
:if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = false) do={
:log warning "NAVSPOT v{{VERSION}}: Rota default NAO encontrada - fetch pode falhar"
} else={
:log info "NAVSPOT v{{VERSION}}: Rota default OK"
}
# 12.2. VERIFICAR DNS
:local dnsOk false
:do {
:local resolved [:resolve "{{SUPABASE_HOST}}"]
:if ([:len $resolved] > 0) do={ :set dnsOk true }
} on-error={}
:if ($dnsOk = false) do={
:log warning "NAVSPOT v{{VERSION}}: DNS NAO resolvido - tentando fetch mesmo assim"
} else={
:log info "NAVSPOT v{{VERSION}}: DNS OK"
}
# 13. DETECTAR VERSAO DO ROUTEROS DE FORMA ROBUSTA (v7.1.36)
:local rosVer [/system resource get version]
:local dotIndex [:find $rosVer "."]
:local rosMajor $rosVer
:if ($dotIndex != 0) do={ :set rosMajor [:pick $rosVer 0 $dotIndex] }
:local rosV "6"
:if ($rosMajor = "7") do={
:set rosV "7"
:log info ("NAVSPOT v{{VERSION}}: RouterOS " . $rosVer . " detectado - modo otimizado")
} else={
:log info ("NAVSPOT v{{VERSION}}: RouterOS " . $rosVer . " detectado - modo compatibilidade")
}
# 14. BAIXAR E INSTALAR SCRIPTS VIA API COM RETRY
:local apiBase "{{SCRIPTS_URL}}"
:local tk "{{SYNC_TOKEN}}"
# v7.1.36: Arquivo temporario unico para evitar conteudo residual
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local tmpFile ("ns-install-" . $tsStr . ".rsc")
# Construir URL com ros_version detectado em runtime
:local scriptsUrl ($apiBase . "&type=all&token=" . $tk . "&ros_version=" . $rosV)
# v7.1.36: Backoff variavel baseado na versao
:local retryDelay 5s
:if ($rosV = "7") do={ :set retryDelay 2s }
:local maxRetries 3
:local retryCount 0
:local fetchSuccess false
:log info ("NAVSPOT v{{VERSION}}: Iniciando download (tmpFile=" . $tmpFile . ")...")
:while (($retryCount < $maxRetries) && ($fetchSuccess = false)) do={
:set retryCount ($retryCount + 1)
:log info ("NAVSPOT v{{VERSION}}: Tentativa " . $retryCount . "/" . $maxRetries)
:do {
/tool fetch url=$scriptsUrl check-certificate=no dst-path=$tmpFile
:set fetchSuccess true
} on-error={
:log warning ("NAVSPOT v{{VERSION}}: Fetch falhou na tentativa " . $retryCount)
:if ($retryCount < $maxRetries) do={
:delay $retryDelay
}
}
}
:if ($fetchSuccess = true) do={
# v7.1.36: Delay pos-fetch baseado na versao (ROS 7 = 500ms, ROS 6 = 4s)
:if ($rosV = "7") do={ :delay 500ms } else={ :delay 4s }
:log info ("NAVSPOT v{{VERSION}}: Importando " . $tmpFile . "...")
/import $tmpFile
:delay 1s
:do { /file remove $tmpFile } on-error={ :log warning "NAVSPOT: nao foi possivel remover arquivo temporario" }
:log info "NAVSPOT v{{VERSION}}: Scripts instalados com sucesso!"
# 15. PRIMEIRO SYNC (delay baseado na versao)
:if ($rosV = "7") do={
:log info "NAVSPOT v{{VERSION}}: Aguardando 20s para primeiro sync (ROS 7)..."
:delay 20s
} else={
:log info "NAVSPOT v{{VERSION}}: Aguardando 35s para primeiro sync (ROS 6)..."
:delay 35s
}
:do {/system script run navspot-sync} on-error={:log warning ("NAVSPOT v{{VERSION}}: sync inicial falhou (nao-fatal)")}
:log info "NAVSPOT v{{VERSION}}: Primeiro sync executado (ou fallback aplicado)!"
:log info "=========================================="
:log info "NAVSPOT v{{VERSION}}: BOOTSTRAP ULTRA-THIN CONCLUIDO!"
:log info ("Arquitetura: Fetch + Import (ros_version=" . $rosV . ")")
:log info "Rede: {{NETWORK_CIDR}} | Gateway: {{GATEWAY}}"
:log info "WAN: {{WAN_INTERFACE}} ({{WAN_TYPE}})"
:log info "Hotspot: hs-navspot (aguardando login-url via sync)"
:log info "Gerencia: ether2 (Winbox/MNDP)"
:log info "=========================================="
} else={
:log error "NAVSPOT v{{VERSION}}: FALHA CRITICA - Fetch falhou apos 3 tentativas"
:log error "NAVSPOT v{{VERSION}}: Verifique conectividade e execute manualmente:"
:log error ("NAVSPOT v{{VERSION}}: /tool fetch url=<API_URL>&ros_version=" . $rosV)
:log error "NAVSPOT v{{VERSION}}: /import ns-install-<timestamp>.rsc"
}
$bs$)
ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, version = EXCLUDED.version, updated_at = now();
