
-- =============================================
-- Hotspot Auto-Start Protection v7.8.26
-- Layer 1: Guardian self-healing (re-enable disabled hotspot)
-- Layer 2: Startup scheduler (enable hotspot 15s after boot)
-- Updates: guardian, installer, bootstrap
-- =============================================

-- 1. GUARDIAN: Add hotspot-enabled check before the needsRepair decision
UPDATE script_templates
SET content = ':log info "NAVSPOT-GUARDIAN v{{VERSION}}"
:local needsRepair 0
:local missing ""
:global navspotSyncLock
:if ([:typeof $navspotSyncLock] != "nothing") do={
:if ($navspotSyncLock = "1") do={
:log warning "NAVSPOT-GUARDIAN: Lock de sync travado detectado, resetando..."
:set navspotSyncLock "0"
}}
:local syncScript [/system script find name="navspot-sync"]
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $syncScript]=0) do={:set needsRepair 1;:set missing ($missing."sync ")}
:if ([:len $syncSched]=0) do={:set needsRepair 1;:set missing ($missing."sched ")}
# --- HOTSPOT AUTO-START CHECK (v7.8.26) ---
:local hsId [/ip hotspot find name="hs-navspot"]
:if ([:len $hsId] > 0) do={
:local hsDisabled [/ip hotspot get $hsId disabled]
:if ($hsDisabled = true) do={
/ip hotspot enable $hsId
:log warning "NAVSPOT-GUARDIAN: Hotspot estava desligado - reativado!"
:set needsRepair 1
:set missing ($missing . "hs-disabled ")
}
} else={
:set needsRepair 1
:set missing ($missing . "hs-missing ")
}
# --- END HOTSPOT CHECK ---
:local hsprof ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hsprof [/ip hotspot profile find name=$pN]} on-error={:set hsprof ""}}
:if ([:len $hsprof]=0) do={:set hsprof [/ip hotspot profile find name="hsprof-navspot"]}
:local loginUrl ""
:if ([:len $hsprof]>0) do={:set loginUrl [/ip hotspot profile get $hsprof login-url]}
:if ([:len $loginUrl]<10) do={:set needsRepair 1;:set missing ($missing."login-url ")}
:if ([:len $hsprof]>0) do={
:local loginBy [/ip hotspot profile get $hsprof login-by]
:if ([:find $loginBy "http-pap"]<0) do={:set needsRepair 1;:set missing ($missing."login-pap ")}}
:do {
:local hresp [/tool fetch url="{{API_BASE}}/mt-gen?mode=health" as-value output=user]
:local hbody ($hresp->"data")
:log info ("NAVSPOT-GUARDIAN: health=" . $hbody)
:if ([:find $hbody "{{VERSION}}"] < 0) do={
:log warning "NAVSPOT-GUARDIAN: Versao diferente detectada"
:set needsRepair 1
:set missing ($missing . "version ")
}
} on-error={:log warning "NAVSPOT-GUARDIAN: Health check falhou"}
:if ($needsRepair=1) do={
:log warning ("NAVSPOT-GUARDIAN: Faltando: ".$missing)
:log info "NAVSPOT-GUARDIAN: Iniciando reparo..."
:do {
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "{{SYNC_TOKEN}}"}
:local body ("{\"sync_token\":\"".$tk."\"}")
/tool fetch url="{{RECOVERY_URL}}" http-method=post http-data=$body http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-recovery.rsc"
:delay 3s
:local rf [/file find name~"navspot-recovery.rsc"]
:if ([:len $rf]>0) do={
/import navspot-recovery.rsc
:log info "NAVSPOT-GUARDIAN: Reparo OK!"
:do {/file remove "navspot-recovery.rsc"} on-error={}
} else={:log warning "NAVSPOT-GUARDIAN: Falha download recovery"}
} on-error={:log error "NAVSPOT-GUARDIAN: Erro no reparo"}
} else={:log info "NAVSPOT-GUARDIAN v{{VERSION}}: Sistema OK"}',
    version = '7.8.26',
    updated_at = now()
WHERE id = 'guardian';

-- 2. INSTALLER: Add navspot-startup scheduler after existing schedulers (section 3)
-- We append the startup scheduler right after the guardian-scheduler and before netwatch
UPDATE script_templates
SET content = regexp_replace(
  content,
  -- Match the guardian-scheduler add line followed by the netwatch section
  '(/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970)\n(# ===== 4\. NETWATCH =====)',
  E'\\1\n# ===== 3.1 STARTUP HOTSPOT ENABLER (v7.8.26) =====\n:do { /system scheduler remove [find where name="navspot-startup"] } on-error={}\n/system scheduler add name="navspot-startup" interval=0 start-time=startup start-date=jan/01/1970 on-event=":delay 15s; :do { /ip hotspot enable [find name=hs-navspot] } on-error={}; :log info \\"NAVSPOT-STARTUP: Hotspot habilitado\\""\n\\2'
),
    version = '7.8.26',
    updated_at = now()
WHERE id = 'installer';

-- 3. BOOTSTRAP: Add startup scheduler after the existing schedulers block
-- In bootstrap, schedulers are created in section 14 (after import). We add the startup scheduler
-- right after the guardian-scheduler line in the installer template that bootstrap fetches.
-- BUT bootstrap itself also needs the startup scheduler for first-time installs.
-- The bootstrap creates hotspot in section 10. We add the startup scheduler after the token save (section 11).
UPDATE script_templates
SET content = regexp_replace(
  content,
  '(:log info "NAVSPOT: Token salvo")\n(# 12\. AGUARDAR ESTABILIZACAO)',
  E'\\1\n# 11.1 STARTUP HOTSPOT ENABLER (v7.8.26)\n:do { /system scheduler remove [find where name="navspot-startup"] } on-error={}\n/system scheduler add name="navspot-startup" interval=0 start-time=startup start-date=jan/01/1970 on-event=":delay 15s; :do { /ip hotspot enable [find name=hs-navspot] } on-error={}; :log info \\"NAVSPOT-STARTUP: Hotspot habilitado\\""\n:log info "NAVSPOT v{{VERSION}}: Startup scheduler criado"\n\\2'
),
    version = '7.8.26',
    updated_at = now()
WHERE id = 'bootstrap';
