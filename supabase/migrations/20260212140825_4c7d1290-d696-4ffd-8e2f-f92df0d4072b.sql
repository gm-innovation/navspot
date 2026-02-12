
-- =================================================================
-- v7.7.0: Fix installer template URL + Create modular templates
-- =================================================================

-- PART 1: Fix installer template (change /mt-scripts to /mikrotik-script-generator with mode=serve)
UPDATE public.script_templates
SET content = $ts$# =========================================
# NAVSPOT Scripts Installer v{{VERSION}}
# ROS {{ROS_VERSION}} MODE - 2 SCRIPTS (sync + guardian)
# =========================================
# _build: {{VERSION}} | deployed_at={{DEPLOYED_AT}} | ros_version={{ROS_VERSION}}
:log info "NAVSPOT-INSTALL v{{VERSION}}: Iniciando (ROS {{ROS_VERSION}} mode)..."
:local apiBase "{{API_BASE}}"
:local ep "/mikrotik-script-generator"
:local tk "{{SYNC_TOKEN}}"
:local rosV "{{ROS_VERSION}}"
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local hasRoute false
:do {
:local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
:if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = true) do={:log info "NAVSPOT-INSTALL: Rota default OK"} else={:log warning "NAVSPOT-INSTALL: Rota default NAO encontrada"}
:local dnsOk false
:do {:resolve "google.com";:set dnsOk true} on-error={}
:if ($dnsOk = true) do={:log info "NAVSPOT-INSTALL: DNS OK"} else={:log warning "NAVSPOT-INSTALL: DNS pode estar com problemas"}
# ===== 1. SYNC SCRIPT =====
:log info "NAVSPOT-INSTALL: Baixando sync-raw..."
:local syncRawUrl ($apiBase . $ep . "?mode=serve&type=sync-raw&token=" . $tk . "&ros_version=" . $rosV)
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local syncOk false
:local syncRetry 0
:while (($syncRetry < {{MAX_RETRIES}}) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:do {/tool fetch url=$syncRawUrl check-certificate=no dst-path=$syncTempFile;:set syncOk true} on-error={:log warning ("NAVSPOT-INSTALL: sync fetch " . $syncRetry . " falhou");:delay 5s}
}
:if ($syncOk = true) do={
:delay {{FETCH_DELAY}}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={:set readRetry ($readRetry + 1);:do { :set fsize [/file get $syncTempFile size] } on-error={};:if ($fsize = 0) do={:delay 1000ms}}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync muito pequeno");:do { /file remove $syncTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < {{MAX_RETRIES}})) do={:set prefixRetry ($prefixRetry + 1);:do { :set scriptContent [/file get $syncTempFile contents] } on-error={};:if ([:len $scriptContent] < 50) do={:delay {{WRITE_DELAY}}ms}}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: sync INVALIDO";:do { /file remove $syncTempFile } on-error={}
} else={
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-sync" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v{{VERSION}} instalado"
}}
} else={:log error "NAVSPOT-INSTALL: sync fetch falhou"}
# ===== 2. GUARDIAN =====
:log info "NAVSPOT-INSTALL: Baixando guardian-raw..."
:local guardRawUrl ($apiBase . $ep . "?mode=serve&type=guardian-raw&token=" . $tk . "&ros_version=" . $rosV)
:local guardTempFile ("ns-guard-" . $tsStr . ".src")
:local guardOk false
:local guardRetry 0
:while (($guardRetry < {{MAX_RETRIES}}) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:do {/tool fetch url=$guardRawUrl check-certificate=no dst-path=$guardTempFile;:set guardOk true} on-error={:log warning ("NAVSPOT-INSTALL: guardian fetch " . $guardRetry . " falhou");:delay 5s}
}
:if ($guardOk = true) do={
:delay {{FETCH_DELAY}}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={:set readRetry ($readRetry + 1);:do { :set fsize [/file get $guardTempFile size] } on-error={};:if ($fsize = 0) do={:delay 1000ms}}
:log info ("NAVSPOT-INSTALL: guardian baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: guardian muito pequeno");:do { /file remove $guardTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < {{MAX_RETRIES}})) do={:set prefixRetry ($prefixRetry + 1);:do { :set scriptContent [/file get $guardTempFile contents] } on-error={};:if ([:len $scriptContent] < 50) do={:delay {{WRITE_DELAY}}ms}}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: guardian INVALIDO";:do { /file remove $guardTempFile } on-error={}
} else={
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-guardian" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha criar guardian" }
:delay 300ms
:do { /file remove $guardTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-guardian v{{VERSION}} instalado"
}}
} else={:log error "NAVSPOT-INSTALL: guardian fetch falhou"}
# ===== 3. SCHEDULERS =====
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval={{SYNC_INTERVAL}}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
# ===== 4. NETWATCH =====
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "=========================================="
:log info "NAVSPOT-INSTALL v{{VERSION}}: CONCLUIDA! ROS {{ROS_VERSION}}"
:log info "=========================================="
:delay 5s
:do {/system script run navspot-sync} on-error={:log warning "NAVSPOT-INSTALL: sync inicial falhou (nao-fatal)"}$ts$,
    version = '7.7.0',
    updated_at = now()
WHERE id = 'installer';

-- PART 2: Create sync-standalone template (wrapper that embeds sync + creates scheduler)
INSERT INTO public.script_templates (id, version, content) VALUES ('sync-standalone', '7.7.0', $ts$# =========================================
# NAVSPOT Sync Standalone Installer v{{VERSION}}
# Upload via Winbox (Files) e rode: /import sync.rsc
# =========================================
:log info "NAVSPOT-SYNC-INSTALL v{{VERSION}}: Iniciando..."
# Remove sync antigo
:do { /system script remove [find name="navspot-sync"] } on-error={}
:do { /system scheduler remove [find name="navspot-sync-scheduler"] } on-error={}
:delay 300ms
# Criar script navspot-sync
/system script add name="navspot-sync" policy=read,write,test source="{{SYNC_SOURCE}}"
:delay 300ms
# Criar scheduler
/system scheduler add name="navspot-sync-scheduler" interval={{SYNC_INTERVAL}}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-SYNC-INSTALL: Script e scheduler criados"
# Netwatch (bonus)
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
# Executar primeiro sync
:log info "NAVSPOT-SYNC-INSTALL: Executando primeiro sync..."
:delay 5s
:do { /system script run navspot-sync } on-error={ :log warning "NAVSPOT-SYNC-INSTALL: Primeiro sync falhou (nao-fatal)" }
:log info "=========================================="
:log info "NAVSPOT-SYNC-INSTALL v{{VERSION}}: CONCLUIDO!"
:log info "=========================================="$ts$)
ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, version = EXCLUDED.version, updated_at = now();

-- PART 3: Create guardian-standalone template
INSERT INTO public.script_templates (id, version, content) VALUES ('guardian-standalone', '7.7.0', $ts$# =========================================
# NAVSPOT Guardian Standalone Installer v{{VERSION}}
# Upload via Winbox (Files) e rode: /import guardian.rsc
# =========================================
:log info "NAVSPOT-GUARDIAN-INSTALL v{{VERSION}}: Iniciando..."
# Remove guardian antigo
:do { /system script remove [find name="navspot-guardian"] } on-error={}
:do { /system scheduler remove [find name="navspot-guardian-scheduler"] } on-error={}
:delay 300ms
# Criar script navspot-guardian
/system script add name="navspot-guardian" policy=read,write,test source="{{GUARDIAN_SOURCE}}"
:delay 300ms
# Criar scheduler
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "=========================================="
:log info "NAVSPOT-GUARDIAN-INSTALL v{{VERSION}}: CONCLUIDO!"
:log info "=========================================="$ts$)
ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, version = EXCLUDED.version, updated_at = now();

-- PART 4: Update sync and guardian templates version
UPDATE public.script_templates SET version = '7.7.0', updated_at = now() WHERE id IN ('sync', 'guardian');
