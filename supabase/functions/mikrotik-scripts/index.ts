import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.3.0
 * 
 * RADICAL SIMPLIFICATION: Action Processor eliminated.
 * All action processing is now INLINE in the sync script.
 * Router runs only 2 scripts: navspot-sync + navspot-guardian.
 * 
 * Parameters:
 *   - type: "sync-raw" | "guardian-raw" | "all" (default: "all")
 *   - token: sync_token for authentication
 *   - ros_version: "6" | "7" | "auto" (default: "6")
 */

const VERSION = "7.3.0"
const DEPLOYED_AT = new Date().toISOString()

// RouterOS version-specific configuration (simplified - no more AP)
interface ROSConfig {
  delayAfterFetch: number
  delayAfterFileWrite: number
  contentRetryCount: number
  flashSyncDelay: number
}

const ROS_CONFIGS: Record<string, ROSConfig> = {
  '6': {
    delayAfterFetch: 2500,
    delayAfterFileWrite: 1500,
    contentRetryCount: 3,
    flashSyncDelay: 700,
  },
  '7': {
    delayAfterFetch: 500,
    delayAfterFileWrite: 300,
    contentRetryCount: 1,
    flashSyncDelay: 200,
  }
}

function getROSConfig(rosVersion: string): ROSConfig {
  return ROS_CONFIGS[rosVersion] || ROS_CONFIGS['6']
}

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const syncToken = url.searchParams.get('token')
    const scriptType = url.searchParams.get('type') || 'all'
    const rosVersion = url.searchParams.get('ros_version') || '6'

    if (!syncToken) {
      console.error(`[mikrotik-scripts ${VERSION}] Missing token parameter`)
      return new Response(
        '# Error: token parameter is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }

    console.log(`[mikrotik-scripts ${VERSION}] Request: type=${scriptType}, token=${maskToken(syncToken)}, ros=${rosVersion}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, sync_token, sync_interval_minutes, ros_version,
        embarcacoes!inner(id, nome, empresa_id)
      `)
      .eq('sync_token', syncToken)
      .single()

    if (hotspotError || !hotspot) {
      console.error(`[mikrotik-scripts ${VERSION}] Invalid token:`, hotspotError)
      return new Response(
        '# Error: Invalid sync token',
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }

    const effectiveRosVersion = hotspot.ros_version === 'auto' 
      ? rosVersion 
      : (hotspot.ros_version || rosVersion)
    const rosConfig = getROSConfig(effectiveRosVersion)

    console.log(`[mikrotik-scripts ${VERSION}] Generating scripts for: ${hotspot.nome} (ROS=${effectiveRosVersion})`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`
    const syncIntervalMinutes = hotspot.sync_interval_minutes || 5

    let script = ''
    const contentType = 'text/plain; charset=utf-8'

    switch (scriptType) {
      case 'sync-raw':
        script = generateSyncSource(syncUrl, syncToken)
        console.log(`[mikrotik-scripts ${VERSION}] sync-raw size: ${script.length} bytes`)
        break
      case 'guardian-raw':
        script = generateGuardianSource(recoveryUrl, syncToken)
        console.log(`[mikrotik-scripts ${VERSION}] guardian-raw size: ${script.length} bytes`)
        break
      case 'all':
      default:
        script = generateAllScripts(supabaseUrl, syncToken, syncIntervalMinutes, rosConfig, effectiveRosVersion)
        break
    }

    console.log(`[mikrotik-scripts ${VERSION}] Generated ${scriptType} script (${script.length} bytes)`)

    return new Response(script, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="navspot-${scriptType}-v${VERSION}.rsc"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })

  } catch (error) {
    console.error(`[mikrotik-scripts ${VERSION}] Error:`, error)
    return new Response(
      `# Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }
})

/**
 * v7.3.0: SIMPLIFIED Installer - Only sync + guardian (NO action-processor)
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number,
  rosConfig: ROSConfig,
  rosVersion: string
): string {
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
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"
:local rosV "${rosVersion}"

:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])

# Pre-flight checks
:local hasRoute false
:do {
:local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
:if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = true) do={
:log info "NAVSPOT-INSTALL: Rota default OK"
} else={
:log warning "NAVSPOT-INSTALL: Rota default NAO encontrada"
}

:local dnsOk false
:do {
:resolve "google.com"
:set dnsOk true
} on-error={}
:if ($dnsOk = true) do={
:log info "NAVSPOT-INSTALL: DNS OK"
} else={
:log warning "NAVSPOT-INSTALL: DNS pode estar com problemas"
}

# ===== 1. SYNC SCRIPT (fetch raw source) =====
:log info "NAVSPOT-INSTALL: Baixando sync-raw..."
:local syncRawUrl ($apiBase . $ep . "?type=sync-raw&token=" . $tk . "&ros_version=" . $rosV)
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local syncOk false
:local syncRetry 0
:while (($syncRetry < ${maxRetries}) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:log info ("NAVSPOT-INSTALL: sync tentativa " . $syncRetry . "/${maxRetries}")
:do {
/tool fetch url=$syncRawUrl check-certificate=no dst-path=$syncTempFile
:set syncOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: sync fetch tentativa " . $syncRetry . " falhou")
:delay 5s
}
}
:if ($syncOk = true) do={
:delay ${fetchDelay}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $syncTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: sync size retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync arquivo muito pequeno - " . $fsize . " bytes")
:do { /file remove $syncTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set scriptContent [/file get $syncTempFile contents] } on-error={}
:if ([:len $scriptContent] < 50) do={
:log info ("NAVSPOT-INSTALL: sync content retry " . $prefixRetry . "/${maxRetries}")
:delay ${writeDelay}ms
}
}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: sync content INVALIDO"
:do { /file remove $syncTempFile } on-error={}
} else={
:log info ("NAVSPOT-INSTALL: sync content valido (" . [:len $scriptContent] . " bytes)")
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-sync" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: sync fetch falhou"
}

# ===== 2. GUARDIAN (fetch raw source) =====
:log info "NAVSPOT-INSTALL: Baixando guardian-raw..."
:local guardRawUrl ($apiBase . $ep . "?type=guardian-raw&token=" . $tk . "&ros_version=" . $rosV)
:local guardTempFile ("ns-guard-" . $tsStr . ".src")
:local guardOk false
:local guardRetry 0
:while (($guardRetry < ${maxRetries}) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:log info ("NAVSPOT-INSTALL: guardian tentativa " . $guardRetry . "/${maxRetries}")
:do {
/tool fetch url=$guardRawUrl check-certificate=no dst-path=$guardTempFile
:set guardOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: guardian fetch tentativa " . $guardRetry . " falhou")
:delay 5s
}
}
:if ($guardOk = true) do={
:delay ${fetchDelay}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $guardTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: guardian size retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: guardian baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: guardian arquivo muito pequeno - " . $fsize . " bytes")
:do { /file remove $guardTempFile } on-error={}
} else={
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set scriptContent [/file get $guardTempFile contents] } on-error={}
:if ([:len $scriptContent] < 50) do={
:log info ("NAVSPOT-INSTALL: guardian content retry " . $prefixRetry . "/${maxRetries}")
:delay ${writeDelay}ms
}
}
:local prefix [:pick $scriptContent 0 100]
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error "NAVSPOT-INSTALL: guardian content INVALIDO"
:do { /file remove $guardTempFile } on-error={}
} else={
:log info ("NAVSPOT-INSTALL: guardian content valido (" . [:len $scriptContent] . " bytes)")
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-guardian" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar guardian" }
:delay 300ms
:do { /file remove $guardTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-guardian v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: guardian fetch falhou"
}

# ===== 3. SCHEDULERS =====
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-INSTALL: Scheduler sync criado"

:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-INSTALL: Scheduler guardian criado"

# ===== 4. NETWATCH =====
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT-INSTALL: Netwatch configurado"

:log info "=========================================="
:log info "NAVSPOT-INSTALL v${VERSION}: INSTALACAO CONCLUIDA!"
:log info "Mode: ROS ${rosVersion}"
:log info "Scripts: navspot-sync, navspot-guardian"
:log info "Schedulers: sync a cada ${syncIntervalMinutes}m, guardian a cada 10m"
:log info "=========================================="

# ===== 5. PRIMEIRO SYNC =====
:log info "NAVSPOT-INSTALL: Executando primeiro sync..."
:delay 2s
:do {/system script run navspot-sync} on-error={:log warning "NAVSPOT-INSTALL: sync inicial falhou (nao-fatal)"}
`
}

// ==========================================
// SCRIPT SOURCES - v7.3.0: INLINE ACTION PROCESSING
// ==========================================

/**
 * v7.3.0: Sync with INLINE action processing (NO separate action-processor)
 * All actions are processed directly from the API response variable.
 */
function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:global navspotSyncLockTime
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ([:len $navspotSyncLockTime]=0) do={:set navspotSyncLockTime 0}
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:local lby "cookie,http-pap,http-chap"
:do {
:if ($navspotSyncLock="1") do={
:local shouldSkip true
:if ($us=0) do={:set shouldSkip false} else={
:local la 999
:if (([:typeof $navspotSyncLockTime]="num")&&($navspotSyncLockTime>0)) do={:set la ($us - $navspotSyncLockTime)}
:if ($la>300) do={:set shouldSkip false} else={:log info ("NAVSPOT-SYNC: locked (age=" . $la . "s)")}
}
:if ($shouldSkip) do={:return}}
:set navspotSyncLock "1"
:set navspotSyncLockTime $us
:log info "NAVSPOT-SYNC: step=1-lock"
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "${syncToken}"}
:log info "NAVSPOT-SYNC: step=2-collect"
:local u ""
:local r ""
:local p ""
:local q "\\22"
:do {:foreach a in=[/ip hotspot active find] do={
:local au [/ip hotspot active get $a user]
:local am [/ip hotspot active get $a mac-address]
:local abi [/ip hotspot active get $a bytes-in]
:local abo [/ip hotspot active get $a bytes-out]
:set u ($u.$au.",".$am.",".$abi.",".$abo.";")
}} on-error={}
:do {:foreach i in=[/ip hotspot user find where dynamic=no] do={:set r ($r.[/ip hotspot user get $i name].",")
}} on-error={}
:do {:foreach x in=[/ip hotspot user profile find] do={:set p ($p.[/ip hotspot user profile get $x name].",")
}} on-error={}
:local hp ""
:local hlb ""
:local hlu ""
:do {
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={
:do {:local pN [:tostr [/ip hotspot get $hs profile]];:set hp [/ip hotspot profile find name=$pN]} on-error={}
}
} on-error={}
:if ([:len $hp]=0) do={:do {:set hp [/ip hotspot profile find name="hsprof-navspot"]} on-error={}}
:if ([:len $hp]>0) do={
:do {:set hlb [/ip hotspot profile get $hp login-by]} on-error={:set hlb ""}
:do {:set hlu [/ip hotspot profile get $hp login-url]} on-error={:set hlu ""}
}
:log info "NAVSPOT-SYNC: step=3-json"
:local b ("{".$q."sync_token".$q.":".$q.$tk.$q.",".$q."active_users_csv".$q.":".$q.$u.$q.",".$q."registered_users_csv".$q.":".$q.$r.$q.",".$q."registered_profiles_csv".$q.":".$q.$p.$q.",".$q."hotspot_login_by".$q.":".$q.$hlb.$q.",".$q."hotspot_login_url".$q.":".$q.$hlu.$q."}")
:local ok false
:local respFile "navspot-resp.txt"
:do {:foreach oldF in=[/file find where name~"^navspot-resp-"] do={/file remove $oldF}} on-error={}
:do {/file remove $respFile} on-error={}
:delay 1s
:log info "NAVSPOT-SYNC: step=4-fetch"
:do {
/tool fetch url="${syncUrl}" http-method=post http-data=($b) http-header-field="Content-Type: application/json" check-certificate=no dst-path=$respFile
:set ok true
} on-error={:log warning "NAVSPOT-SYNC: fetch FALHOU";:set navspotSyncLock "0"}
:if ($ok) do={
:delay 2s
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={:log error "NAVSPOT-SYNC: file read FAILED"}
:do {/file remove $respFile} on-error={}
:local rl [:len $resp]
:log info ("NAVSPOT-SYNC: resp=" . $rl . "b")
:if ($rl=0) do={:log error "NAVSPOT-SYNC: response EMPTY"}
:local s [:find $resp "[["]
:local e [:find $resp "]]"]
:if ([:typeof $s]="nil") do={:log warning ("NAVSPOT-SYNC: no [[ marker in " . $rl . "b resp")}
:if (($s>=0)&&($e>$s)) do={
:local raw [:pick $resp ($s+2) $e]
:local i 0
:local j ([:len $raw]-1)
:while (($i<=$j)&&([:pick $raw $i ($i+1)]=" ")) do={:set i ($i+1)}
:while (($j>=$i)&&([:pick $raw $j ($j+1)]=" ")) do={:set j ($j-1)}
:local a ""
:if ($j>=$i) do={:set a [:pick $raw $i ($j+1)]}
:if ([:len $a]>0) do={
:log info ("NAVSPOT-SYNC: actions len=" . [:len $a])
# === v7.3.0: INLINE ACTION PROCESSING (no separate script) ===
:local pos 0
:local cnt 0
:while ([:find $a ";" $pos] >= 0) do={
:local ep [:find $a ";" $pos]
:local ln [:pick $a $pos $ep]
:set pos ($ep + 1)
:if ([:len $ln] > 0) do={
:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local rv [:pick $ln ($p1+1) [:len $ln]]
:if ($c = "configure_hotspot_profile") do={
:local p2 [:find $rv "|"]
:if ($p2 >= 0) do={
:local lu [:pick $rv 0 $p2]
:local dn [:pick $rv ($p2 + 1) [:len $rv]]
/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu dns-name=$dn login-by=$lby
:log info "NAVSPOT-SYNC: cfg-hp applied"
:set cnt ($cnt+1)
}}
:if ($c = "create_profile") do={
:do {
:local p2 [:find $rv "|"]
:if ($p2>=0) do={
:local n [:pick $rv 0 $p2]
:local sub [:pick $rv ($p2+1) [:len $rv]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:set sh [:pick $sub ($p3+1) [:len $sub]]} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]>0) do={
:if ([:len $rt]>0) do={/ip hotspot user profile set $ex rate-limit=$rt}
/ip hotspot user profile set $ex shared-users=$sh
} else={
:if ([:len $rt]>0) do={/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} else={/ip hotspot user profile add name=$n shared-users=$sh}
}
:set cnt ($cnt+1)
}
} on-error={}}
:if ($c = "create_user") do={
:do {
:local p2 [:find $rv "|"]
:if ($p2>=0) do={
:local un [:pick $rv 0 $p2]
:local sub [:pick $rv ($p2+1) [:len $rv]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3>=0) do={:set pw [:pick $sub 0 $p3];:set pf [:pick $sub ($p3+1) [:len $sub]]} else={:set pw $sub}
:if ([:len $pf]=0) do={:set pf "default"}
:do {/ip hotspot user profile add name=$pf} on-error={}
:local ex [/ip hotspot user find name=$un]
:if ([:len $ex]>0) do={
:if ([:len $pw]>0) do={/ip hotspot user set $ex password=$pw}
:if ($pf!="default") do={/ip hotspot user set $ex profile=$pf}
} else={
:if ([:len $pw]>0) do={/ip hotspot user add name=$un password=$pw profile=$pf comment="navspot"}
}
:set cnt ($cnt+1)
}
} on-error={}}
:if (($c="create_whitelist_domain")||($c="add_whitelist_domain")) do={
:do {
:local dom $rv
:local p2 [:find $rv "|"]
:if ($p2>=0) do={:set dom [:pick $rv ($p2+1) [:len $rv]]}
:if ([:len $dom]>0) do={
:local wg [/ip hotspot walled-garden find dst-host~$dom]
:if ([:len $wg]=0) do={/ip hotspot walled-garden add dst-host=("*".$dom."*") action=allow comment="navspot";:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="add_firewall_block") do={
:do {
:local dom $rv
:local p2 [:find $rv "|"]
:if ($p2>=0) do={:set dom [:pick $rv ($p2+1) [:len $rv]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-BLOCK-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={/ip firewall filter add chain=forward content=$dom action=drop comment=$cm place-before=0;:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="add_firewall_allow") do={
:do {
:local dom $rv
:local p2 [:find $rv "|"]
:if ($p2>=0) do={:set dom [:pick $rv ($p2+1) [:len $rv]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-ALLOW-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={/ip firewall filter add chain=forward content=$dom action=accept comment=$cm place-before=0;:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="remove_user") do={
:do {:if ([:len $rv]>0) do={:local ex [/ip hotspot user find name=$rv];:if ([:len $ex]>0) do={/ip hotspot user remove $ex;:set cnt ($cnt+1)}}} on-error={}}
:if ($c="disable_user") do={
:do {:if ([:len $rv]>0) do={/ip hotspot user set [find name=$rv] disabled=yes;:set cnt ($cnt+1)}} on-error={}}
:if ($c="enable_user") do={
:do {:if ([:len $rv]>0) do={/ip hotspot user set [find name=$rv] disabled=no;:set cnt ($cnt+1)}} on-error={}}
:if ($c="kick_session") do={
:do {:local p2 [:find $rv "|"];:if ($p2>=0) do={:local mac [:pick $rv ($p2+1) [:len $rv]];:if ([:len $mac]>0) do={/ip hotspot active remove [find mac-address=$mac];:set cnt ($cnt+1)}}} on-error={}}
}}}
:log info ("NAVSPOT-SYNC: processed " . $cnt . " actions")
:set a ""
:set raw ""
} else={
:log info "NAVSPOT-SYNC: no actions in response"
}
} else={
:if ($rl>0) do={
:local rHead $resp
:if ($rl>120) do={:set rHead [:pick $resp 0 120]}
:log warning ("NAVSPOT-SYNC: no actions, head=" . $rHead)
}}
}
} on-error={:log error "NAVSPOT-SYNC: CRASH in main block";:set navspotSyncLock "0"}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}

/**
 * v7.3.0: Simplified Guardian - no more action-processor checks
 */
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
