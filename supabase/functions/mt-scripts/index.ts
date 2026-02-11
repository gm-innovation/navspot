import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSION = "7.4.5"
const DEPLOYED_AT = new Date().toISOString()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ROSConfig { delayAfterFetch: number; delayAfterFileWrite: number; contentRetryCount: number; flashSyncDelay: number }
const ROS_CONFIGS: Record<string, ROSConfig> = {
  '6': { delayAfterFetch: 2500, delayAfterFileWrite: 1500, contentRetryCount: 3, flashSyncDelay: 700 },
  '7': { delayAfterFetch: 500, delayAfterFileWrite: 300, contentRetryCount: 1, flashSyncDelay: 200 },
}
function getROSConfig(v: string): ROSConfig { return ROS_CONFIGS[v] || ROS_CONFIGS['6'] }
function maskToken(t: string): string { if (!t || t.length < 10) return '***'; return `${t.slice(0,4)}...${t.slice(-4)}` }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const url = new URL(req.url)
    const scriptType = url.searchParams.get('type') || 'all'
    if (scriptType === 'health') {
      return new Response(JSON.stringify({ version: VERSION, status: "ok", deployed_at: DEPLOYED_AT }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const syncToken = url.searchParams.get('token')
    const rosVersion = url.searchParams.get('ros_version') || '6'
    if (!syncToken) return new Response('# Error: token required', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
    console.log(`[mt-scripts ${VERSION}] type=${scriptType}, token=${maskToken(syncToken)}, ros=${rosVersion}`)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: hotspot, error: hotspotError } = await supabase.from('hotspots').select(`id, nome, sync_token, sync_interval_minutes, ros_version, embarcacoes!inner(id, nome, empresa_id)`).eq('sync_token', syncToken).single()
    if (hotspotError || !hotspot) return new Response('# Error: Invalid sync token', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
    const effRos = hotspot.ros_version === 'auto' ? rosVersion : (hotspot.ros_version || rosVersion)
    const rosConfig = getROSConfig(effRos)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`
    const syncMin = hotspot.sync_interval_minutes || 5
    let script = ''
    switch (scriptType) {
      case 'sync-raw': script = generateSyncSource(syncUrl, syncToken); break
      case 'guardian-raw': script = generateGuardianSource(recoveryUrl, syncToken); break
      default: script = generateAllScripts(supabaseUrl, syncToken, syncMin, rosConfig, effRos); break
    }
    console.log(`[mt-scripts ${VERSION}] ${scriptType} (${script.length}b)`)
    return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(new TextEncoder().encode(script).length), 'Content-Disposition': `attachment; filename="navspot-${scriptType}-v${VERSION}.rsc"`, 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error(`[mt-scripts ${VERSION}] Error:`, error)
    return new Response(`# Error: ${error instanceof Error ? error.message : 'Internal server error'}`, { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
  }
})

function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ($navspotSyncLock="1") do={:log info "NAVSPOT-SYNC: locked";:return}
:set navspotSyncLock "1"
:local a ""
:local q "\\22"
:local lby "cookie,http-pap,http-chap"
:local ac 0
:do {:set ac [:len [/ip hotspot active find]]} on-error={}
:local rc 0
:do {:set rc [:len [/ip hotspot user find]]} on-error={}
:local tk "${syncToken}"
:local b ("{".$q."sync_token".$q.":".$q.$tk.$q.",".$q."active_count".$q.":".$ac.",".$q."registered_count".$q.":".$rc."}")
:log info "NAVSPOT-SYNC: fetch..."
:do {
:local res [/tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no as-value output=user]
:local body ($res->"data")
:local bl [:len $body]
:log info ("NAVSPOT-SYNC: resp=" . $bl . "b")
:local s [:find $body "[["]
:local e [:find $body "]]"]
:if (($s>=0)&&($e>$s)) do={
:set a [:pick $body ($s+2) $e]
}
} on-error={:log error "NAVSPOT-SYNC: fetch failed";:set navspotSyncLock "0"}
:if ([:len $a]>0) do={
:local pos 0
:local cnt 0
:while ([:find $a ";" $pos]>=0) do={
:local ep [:find $a ";" $pos]
:local ln [:pick $a $pos $ep]
:set pos ($ep+1)
:local p1 [:find $ln "|"]
:if ($p1>=0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c="configure_hotspot_profile") do={
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=[:pick $r 0 $p2] dns-name=[:pick $r ($p2+1) [:len $r]] login-by=$lby} on-error={}
:set cnt ($cnt+1)
}}
:if ($c="create_user") do={
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local rest [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $rest "|"]
:local pw $rest
:local pr "default"
:if ($p3>=0) do={
:set pw [:pick $rest 0 $p3]
:set pr [:pick $rest ($p3+1) [:len $rest]]
}
:do {/ip hotspot user remove [find name=$un]} on-error={}
:do {/ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"} on-error={}
:set cnt ($cnt+1)
}}
:if ($c="create_profile") do={
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:local rest [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $rest "|"]
:local rt $rest
:local su "1"
:if ($p3>=0) do={
:set rt [:pick $rest 0 $p3]
:set su [:pick $rest ($p3+1) [:len $rest]]
}
:do {/ip hotspot user profile remove [find name=$n]} on-error={}
:do {/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$su} on-error={}
:set cnt ($cnt+1)
}}
:if ($c="remove_user") do={
:do {/ip hotspot user remove [find name=$r]} on-error={}
:set cnt ($cnt+1)
}
:if ($c="disable_user") do={
:do {/ip hotspot user set [find name=$r] disabled=yes} on-error={}
:set cnt ($cnt+1)
}
:if ($c="enable_user") do={
:do {/ip hotspot user set [find name=$r] disabled=no} on-error={}
:set cnt ($cnt+1)
}
}}
:log info ("NAVSPOT-SYNC: processed " . $cnt . " actions")
:set a ""
} else={
:log info "NAVSPOT-SYNC: no actions"
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}

function generateGuardianSource(recoveryUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-GUARDIAN v${VERSION}"
:local needsRepair 0
:local missing ""
:local syncScript [/system script find name="navspot-sync"]
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $syncScript]=0) do={:set needsRepair 1;:set missing ($missing."sync ")}
:if ([:len $syncSched]=0) do={:set needsRepair 1;:set missing ($missing."sched ")}
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
:if ($needsRepair=1) do={
:log warning ("NAVSPOT-GUARDIAN: Faltando: ".$missing)
:log info "NAVSPOT-GUARDIAN: Iniciando reparo..."
:do {
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "${syncToken}"}
:local body ("{\\"sync_token\\":\\"".$tk."\\"}")
/tool fetch url="${recoveryUrl}" http-method=post http-data=$body http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-recovery.rsc"
:delay 3s
:local rf [/file find name~"navspot-recovery.rsc"]
:if ([:len $rf]>0) do={
/import navspot-recovery.rsc
:log info "NAVSPOT-GUARDIAN: Reparo OK!"
:do {/file remove "navspot-recovery.rsc"} on-error={}
} else={:log warning "NAVSPOT-GUARDIAN: Falha download recovery"}
} on-error={:log error "NAVSPOT-GUARDIAN: Erro no reparo"}
} else={:log info "NAVSPOT-GUARDIAN v${VERSION}: Sistema OK"}`
}

function generateAllScripts(supabaseUrl: string, syncToken: string, syncIntervalMinutes: number, rosConfig: ROSConfig, rosVersion: string): string {
  const apiBase = `${supabaseUrl}/functions/v1`
  const fetchDelay = rosConfig.delayAfterFetch
  const writeDelay = rosConfig.delayAfterFileWrite
  const maxRetries = rosConfig.contentRetryCount
  return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# ROS ${rosVersion} MODE - 2 SCRIPTS (sync + guardian)
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT} | ros_version=${rosVersion}
:log info "NAVSPOT-INSTALL v${VERSION}: Iniciando (ROS ${rosVersion} mode)..."

:local apiBase "${apiBase}"
:local ep "/mt-scripts"
:local tk "${syncToken}"
:local rosV "${rosVersion}"

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
:local syncRawUrl ($apiBase . $ep . "?type=sync-raw&token=" . $tk . "&ros_version=" . $rosV)
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local syncOk false
:local syncRetry 0
:while (($syncRetry < ${maxRetries}) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:do {/tool fetch url=$syncRawUrl check-certificate=no dst-path=$syncTempFile;:set syncOk true} on-error={:log warning ("NAVSPOT-INSTALL: sync fetch " . $syncRetry . " falhou");:delay 5s}
}
:if ($syncOk = true) do={
:delay ${fetchDelay}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={:set readRetry ($readRetry + 1);:do { :set fsize [/file get $syncTempFile size] } on-error={};:if ($fsize = 0) do={:delay 1000ms}}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync muito pequeno");:do { /file remove $syncTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={:set prefixRetry ($prefixRetry + 1);:do { :set scriptContent [/file get $syncTempFile contents] } on-error={};:if ([:len $scriptContent] < 50) do={:delay ${writeDelay}ms}}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: sync INVALIDO";:do { /file remove $syncTempFile } on-error={}
} else={
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-sync" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v${VERSION} instalado"
}}
} else={:log error "NAVSPOT-INSTALL: sync fetch falhou"}

# ===== 2. GUARDIAN =====
:log info "NAVSPOT-INSTALL: Baixando guardian-raw..."
:local guardRawUrl ($apiBase . $ep . "?type=guardian-raw&token=" . $tk . "&ros_version=" . $rosV)
:local guardTempFile ("ns-guard-" . $tsStr . ".src")
:local guardOk false
:local guardRetry 0
:while (($guardRetry < ${maxRetries}) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:do {/tool fetch url=$guardRawUrl check-certificate=no dst-path=$guardTempFile;:set guardOk true} on-error={:log warning ("NAVSPOT-INSTALL: guardian fetch " . $guardRetry . " falhou");:delay 5s}
}
:if ($guardOk = true) do={
:delay ${fetchDelay}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={:set readRetry ($readRetry + 1);:do { :set fsize [/file get $guardTempFile size] } on-error={};:if ($fsize = 0) do={:delay 1000ms}}
:log info ("NAVSPOT-INSTALL: guardian baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: guardian muito pequeno");:do { /file remove $guardTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={:set prefixRetry ($prefixRetry + 1);:do { :set scriptContent [/file get $guardTempFile contents] } on-error={};:if ([:len $scriptContent] < 50) do={:delay ${writeDelay}ms}}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: guardian INVALIDO";:do { /file remove $guardTempFile } on-error={}
} else={
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-guardian" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha criar guardian" }
:delay 300ms
:do { /file remove $guardTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-guardian v${VERSION} instalado"
}}
} else={:log error "NAVSPOT-INSTALL: guardian fetch falhou"}

# ===== 3. SCHEDULERS =====
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970

# ===== 4. NETWATCH =====
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"

:log info "=========================================="
:log info "NAVSPOT-INSTALL v${VERSION}: CONCLUIDA! ROS ${rosVersion}"
:log info "=========================================="

:delay 5s
:do {/system script run navspot-sync} on-error={:log warning "NAVSPOT-INSTALL: sync inicial falhou (nao-fatal)"}
`
}
