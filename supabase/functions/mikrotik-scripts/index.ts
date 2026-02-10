import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.1.47
 * 
 * Serves individual RouterOS scripts as pure RSC files.
 * This endpoint is called by the bootstrap via /tool fetch to download
 * scripts AFTER the basic infrastructure is configured.
 * 
 * Parameters:
 *   - type: "sync" | "action-processor" | "guardian" | "all" | 
 *           "sync-source" | "action-source" | "guardian-source" |
 *           "sync-raw" | "action-raw" | "action-aux-raw" | "guardian-raw" (default: "all")
 *   - token: sync_token for authentication
 *   - ros_version: "6" | "7" | "auto" (default: "6") - RouterOS version for optimizations
 * 
 * v7.1.34: ROUTEROS 7.x SUPPORT (hAP ax² optimization)
 *   - New ros_version parameter for version-specific optimizations
 *   - RouterOS 7.x: Full action-processor (~4.5KB), reduced delays (500ms vs 2500ms)
 *   - RouterOS 6.x: Reduced action-processor (<2.9KB), conservative delays
 *   - Restored handlers for v7: add_firewall_block, add_firewall_allow
 * 
 * v7.1.33: CRITICAL SIZE REDUCTION - action-processor must be <3KB for RouterOS 6.x
 *   - RouterOS 6.x has ~3KB limit for /file get contents
 *   - sync (2931 bytes) and guardian (1993 bytes) work because they're under limit
 *   - action-processor was 4387 bytes = TOO BIG = content read returns empty
 *   - Removed: add_firewall_block, add_firewall_allow (moved to AUX)
 *   - Target: <2900 bytes for safety margin
 * 
 * Returns: text/plain RSC script or raw RouterOS source
 */

const VERSION = "7.1.62"
const DEPLOYED_AT = new Date().toISOString()

// RouterOS version-specific configuration
interface ROSConfig {
  delayAfterFetch: number      // ms after /tool fetch
  delayAfterFileWrite: number  // ms after /file set contents
  contentRetryCount: number    // max retries for content read
  flashSyncDelay: number       // ms for flash sync
  useFullActionProcessor: boolean // use full ~4.5KB vs reduced ~2.4KB
}

const ROS_CONFIGS: Record<string, ROSConfig> = {
  '6': {
    delayAfterFetch: 2500,
    delayAfterFileWrite: 1500,
    contentRetryCount: 3,
    flashSyncDelay: 700,
    useFullActionProcessor: false
  },
  '7': {
    delayAfterFetch: 500,
    delayAfterFileWrite: 300,
    contentRetryCount: 1,
    flashSyncDelay: 200,
    useFullActionProcessor: true
  }
}

function getROSConfig(rosVersion: string): ROSConfig {
  return ROS_CONFIGS[rosVersion] || ROS_CONFIGS['6']
}

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * v7.1.18: escapeForFileContents is now LEGACY
 * Kept for backwards compatibility but main flow uses fetch raw source
 */
function escapeForFileContents(script: string): string {
  const preserved = new Map<string, string>()
  let counter = 0
  const makePlaceholder = () => `__PRESERVED_${Date.now().toString(36)}_${counter++}__`
  
  let result = script.replace(/\\([0-9A-Fa-f]{2}|[nrt])/g, (m) => {
    const ph = makePlaceholder()
    preserved.set(ph, m)
    return ph
  })
  
  result = result.replace(/\\/g, '\\\\')
  result = result.replace(/"/g, '\\"')
  result = result.replace(/\$/g, '\\$')
  
  preserved.forEach((orig, ph) => {
    result = result.replace(ph, orig)
  })
  
  return result
}

/**
 * v7.1.18: LEGACY - generateScriptViaFile
 * Kept for backwards compatibility but main flow uses fetch raw source
 */
function generateScriptViaFile(
  scriptName: string,
  sourceText: string,
  policy: string = "read,write,test"
): string {
  const tempFile = `${scriptName}.txt`
  const escapedContents = escapeForFileContents(sourceText)
  
  return `# Create ${scriptName} via file (v${VERSION})
:do { /file remove "${tempFile}" } on-error={}
/file print file=${tempFile} where name="__never__"
:delay 500ms
/file set [find where name="${tempFile}"] contents="${escapedContents}"
:delay 500ms
:do { /system script remove [find where name="${scriptName}"] } on-error={}
:delay 200ms
/system script add name="${scriptName}" policy=${policy} source=[/file get [find where name="${tempFile}"] contents]
:delay 200ms
:do { /file remove "${tempFile}" } on-error={}
:log info "NAVSPOT: ${scriptName} v${VERSION} instalado"
`
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    // Validate token and get hotspot info (now includes ros_version)
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

    // Use ros_version from hotspot config if not explicitly provided, fallback to parameter
    const effectiveRosVersion = hotspot.ros_version === 'auto' 
      ? rosVersion 
      : (hotspot.ros_version || rosVersion)
    const rosConfig = getROSConfig(effectiveRosVersion)

    console.log(`[mikrotik-scripts ${VERSION}] Generating scripts for: ${hotspot.nome} (ROS=${effectiveRosVersion}, fullAP=${rosConfig.useFullActionProcessor})`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`
    const syncIntervalMinutes = hotspot.sync_interval_minutes || 5

    let script = ''
    const contentType = 'text/plain; charset=utf-8'

    switch (scriptType) {
      // v7.1.23: Raw source endpoints (pure RouterOS code, no wrapper)
      case 'sync-raw':
        script = generateSyncSource(syncUrl, syncToken)
        console.log(`[mikrotik-scripts ${VERSION}] sync-raw size: ${script.length} bytes`)
        if (script.length > 3200) {
          console.error(`[mikrotik-scripts] CRITICAL: sync-raw exceeds 3200 bytes: ${script.length}`)
        }
        break
      case 'action-raw':
        // v7.1.34: Use full or reduced action-processor based on ROS version
        script = rosConfig.useFullActionProcessor 
          ? generateActionProcessorFullSource()
          : generateActionProcessorCoreSource()
        console.log(`[mikrotik-scripts ${VERSION}] action-raw size: ${script.length} bytes (full=${rosConfig.useFullActionProcessor})`)
        break
      // v7.1.22: Auxiliary action handlers
      case 'action-aux-raw':
        script = generateActionAuxSource()
        break
      case 'guardian-raw':
        script = generateGuardianSource(recoveryUrl, syncToken)
        console.log(`[mikrotik-scripts ${VERSION}] guardian-raw size: ${script.length} bytes`)
        break
      
      // Legacy: RSC wrappers (kept for compatibility)
      case 'sync':
        script = generateSyncScript(syncUrl, syncToken)
        break
      case 'action-processor':
        script = generateActionProcessorScript(rosConfig)
        break
      case 'guardian':
        script = generateGuardianScript(recoveryUrl, syncToken)
        break
      case 'sync-source':
        script = generateSyncRSC(syncUrl, syncToken)
        break
      case 'action-source':
        script = generateActionProcessorRSC(rosConfig)
        break
      case 'guardian-source':
        script = generateGuardianRSC(recoveryUrl, syncToken)
        break
      
      // v7.1.34: Updated installer with ROS version-specific timings
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
 * v7.1.34: REWRITTEN - Generate installer with ROS VERSION-SPECIFIC TIMINGS
 * 
 * Key changes:
 *   - ROS 7.x: Reduced delays (500ms vs 2500ms), full action-processor
 *   - ROS 6.x: Conservative delays, reduced action-processor (<3KB)
 *   - Unique temp file names with timestamp for race-condition prevention
 *   - Header detection (# NAME) to catch failed file set operations
 *   - Smoke test with $error capture for better diagnostics
 *   - Multi-line fallback with minimal escaping (~1.2KB)
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number,
  rosConfig: ROSConfig,
  rosVersion: string
): string {
  const apiBase = `${supabaseUrl}/functions/v1`
  
  // Version-specific delays
  const fetchDelay = rosConfig.delayAfterFetch
  const writeDelay = rosConfig.delayAfterFileWrite
  const maxRetries = rosConfig.contentRetryCount
  const flashDelay = rosConfig.flashSyncDelay
  
  // v7.1.23: Multi-line fallback source (~1.2KB) - NO complex escaping
  // This fallback handles only create_profile and create_user
  const fallbackSource = `:log info "NAVSPOT-ACTION v${VERSION}F: Start"
:global navspotLock
:global navspotLockTime
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:if ([:len $navspotLock]=0) do={:set navspotLock "0"}
:if ($navspotLock = "1") do={
:local la 999
:if (($us>0)&&([:typeof $navspotLockTime]="num")&&($navspotLockTime>0)) do={:set la ($us - $navspotLockTime)}
:if ($la>120) do={:log warning ("NS-AP: lock expired (age=" . $la . "s)")} else={:return}
}
:set navspotLock "1"
:set navspotLockTime $us
:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ :set navspotLock "0"; :return }
:local raw [/file get $fid contents]
:do { /file remove $fid } on-error={}
:log info ("NS-AP: " . [:len $raw] . "b")
:local pos 0
:local cnt 0
:do {
:while ([:find $raw ";" $pos] >= 0) do={
:local ep [:find $raw ";" $pos]
:local ln [:pick $raw $pos $ep]
:set pos ($ep + 1)
:if ([:len $ln] > 0) do={
:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1 + 1) [:len $ln]]
:if ($c = "create_profile") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local pn [:pick $r 0 $p2]
:local sub [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $sub "|"]
:local ps "1"
:if ($p3 >= 0) do={
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={ :set ps [:pick $sub2 0 $p4] } else={ :set ps $sub2 }
}
:do { /ip hotspot user profile add name=$pn shared-users=$ps } on-error={}
:set cnt ($cnt + 1)
}}
:if ($c = "create_user") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local u [:pick $r 0 $p2]
:local sub [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3 >= 0) do={
:set pw [:pick $sub 0 $p3]
:set pf [:pick $sub ($p3 + 1) [:len $sub]]
}
:do { /ip hotspot user profile add name=$pf } on-error={}
:do { /ip hotspot user add name=$u password=$pw profile=$pf } on-error={}
:set cnt ($cnt + 1)
}}
}}}
} on-error={:log error ("NS-AP: CRASH=" . [:tostr $error])}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}F: OK - " . $cnt)`

  // Escape the fallback for embedding in RSC (minimal escaping for multi-line)
  const escapedFallback = fallbackSource
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')

  return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# ROS ${rosVersion} MODE - ${rosVersion === '7' ? 'OPTIMIZED' : 'COMPATIBLE'}
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT} | ros_version=${rosVersion}
:log info "NAVSPOT-INSTALL v${VERSION}: Iniciando (ROS ${rosVersion} mode)..."

# URLs construidas incrementalmente (limite 160 chars)
:local apiBase "${apiBase}"
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"
:local rosV "${rosVersion}"

# v7.1.24: Unique temp file names with timestamp (RouterOS 6.x compatible)
# Note: :rndnum removed - only exists in RouterOS 7.x
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

# DNS check
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

# ===== 1. SYNC SCRIPT (fetch raw source ~2.8KB) =====
:log info "NAVSPOT-INSTALL: Baixando sync-raw..."
:local syncRawUrl ($apiBase . $ep . "?type=sync-raw&token=" . $tk . "&ros_version=" . $rosV)
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local syncOk false
:local syncRetry 0
:while (($syncRetry < ${maxRetries}) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:log info ("NAVSPOT-INSTALL: sync tentativa " . $syncRetry . "/3")
:do {
/tool fetch url=$syncRawUrl check-certificate=no dst-path=$syncTempFile
:set syncOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: sync fetch tentativa " . $syncRetry . " falhou")
:delay 5s
}
}
:if ($syncOk = true) do={
# v7.1.34: ROS version-specific delay (${fetchDelay}ms for ROS ${rosVersion})
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
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $syncTempFile } on-error={}
} else={
# v7.1.34: Read FULL content with ROS-specific delays
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set scriptContent [/file get $syncTempFile contents] } on-error={}
:if ([:len $scriptContent] < 50) do={
:log info ("NAVSPOT-INSTALL: sync content retry " . $prefixRetry . "/${maxRetries} (" . [:len $scriptContent] . " bytes)")
:delay ${writeDelay}ms
}
}
:local prefix [:pick $scriptContent 0 100]
# v7.1.23: Enhanced validation - detect header pattern OR missing :log
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: sync content INVALIDO - header ou sem :log")
:log error ("NAVSPOT-INSTALL: prefix=" . $prefix)
:do { /file remove $syncTempFile } on-error={}
} else={
:log info ("NAVSPOT-INSTALL: sync content valido (" . [:len $scriptContent] . " bytes)")
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
# v7.1.32: Create from variable (not direct file read) - eliminates race condition
:do { /system script add name="navspot-sync" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: sync fetch falhou apos 3 tentativas"
}

# ===== 2. ACTION PROCESSOR ${rosConfig.useFullActionProcessor ? 'FULL' : 'CORE'} (ROS ${rosVersion}) =====
:log info "NAVSPOT-INSTALL: Baixando action-raw (${rosConfig.useFullActionProcessor ? 'full ~4.5KB' : 'core ~2.4KB'})..."
:local actionRawUrl ($apiBase . $ep . "?type=action-raw&token=" . $tk . "&ros_version=" . $rosV)
:local actionTempFile ("ns-action-" . $tsStr . ".src")
:local actionOk false
:local actionRetry 0
:while (($actionRetry < ${maxRetries}) && ($actionOk = false)) do={
:set actionRetry ($actionRetry + 1)
:log info ("NAVSPOT-INSTALL: action tentativa " . $actionRetry . "/${maxRetries}")
:do {
/tool fetch url=$actionRawUrl check-certificate=no dst-path=$actionTempFile
:set actionOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: action fetch tentativa " . $actionRetry . " falhou")
:delay 5s
}
}
:if ($actionOk = true) do={
# v7.1.34: ROS version-specific delay (${fetchDelay}ms for ROS ${rosVersion})
:delay ${fetchDelay}ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $actionTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: action size retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: action baixado (" . $fsize . " bytes)")
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: action arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $actionTempFile } on-error={}
} else={
# v7.1.34: Read FULL content with ROS-specific delays
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set scriptContent [/file get $actionTempFile contents] } on-error={}
:if ([:len $scriptContent] < 50) do={
:log info ("NAVSPOT-INSTALL: action content retry " . $prefixRetry . "/${maxRetries} (" . [:len $scriptContent] . " bytes)")
:delay ${writeDelay}ms
}
}
:local prefix [:pick $scriptContent 0 100]
# v7.1.23: Enhanced validation - detect header pattern OR missing :log
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: action content INVALIDO - header ou sem :log")
:log error ("NAVSPOT-INSTALL: prefix=" . $prefix)
:do { /file remove $actionTempFile } on-error={}
} else={
:log info ("NAVSPOT-INSTALL: action content valido (" . [:len $scriptContent] . " bytes)")
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
# v7.1.32: Create from variable (not direct file read) - eliminates race condition
:do { /system script add name="navspot-action-processor" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar action" }
:delay 300ms
:do { /file remove $actionTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-action-processor v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: action fetch falhou apos 3 tentativas"
}

# ===== 2.1 SMOKE TEST + FALLBACK (v7.1.23 enhanced) =====
:delay 1s
:local apTestSrc ""
:do { :set apTestSrc [/system script get navspot-action-processor source] } on-error={}
:local apSrcLen [:len $apTestSrc]
:local apValid false
:if (($apSrcLen >= 100) && ([:find $apTestSrc ":log info"] >= 0)) do={ :set apValid true }

:if ($apValid = true) do={
:log info ("NAVSPOT-INSTALL: action-processor source validado (" . $apSrcLen . " bytes)")
# v7.1.23: SMOKE TEST with $error capture
:log info "NAVSPOT-INSTALL: Executando smoke test..."
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 500ms
/file set [find name="navspot-actions.txt"] contents="create_profile|navspot-smoke|1M|1;"
:delay 500ms
:local smokeErr ""
:do {
/system script run navspot-action-processor
} on-error={
:set smokeErr [:tostr $error]
:log error ("NAVSPOT-INSTALL: smoke test ERRO=" . $smokeErr)
}
:if ([:len $smokeErr] > 0) do={
:log error "NAVSPOT-INSTALL: smoke test falhou - aplicando FALLBACK INLINE"
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
/system script add name="navspot-action-processor" policy=read,write,test source="${escapedFallback}"
:delay 300ms
:log info "NAVSPOT-INSTALL: Fallback inline v${VERSION}F instalado"
} else={
:log info "NAVSPOT-INSTALL: smoke test PASSOU - action-processor OK"
}
# v7.1.23: Cleanup smoke test profile
:do { /ip hotspot user profile remove [find name="navspot-smoke"] } on-error={}
} else={
:log error ("NAVSPOT-INSTALL: action-processor INVALIDO (" . $apSrcLen . " bytes) - aplicando FALLBACK INLINE")
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
/system script add name="navspot-action-processor" policy=read,write,test source="${escapedFallback}"
:delay 300ms
:log info "NAVSPOT-INSTALL: Fallback inline v${VERSION}F instalado"
}

# ===== 3. GUARDIAN (fetch raw source ~2.5KB) =====
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
# v7.1.34: ROS version-specific delay (${fetchDelay}ms for ROS ${rosVersion})
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
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: guardian arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $guardTempFile } on-error={}
} else={
# v7.1.34: Read FULL content with ROS-specific delays
:local scriptContent ""
:local prefixRetry 0
:while (([:len $scriptContent] < 50) && ($prefixRetry < ${maxRetries})) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set scriptContent [/file get $guardTempFile contents] } on-error={}
:if ([:len $scriptContent] < 50) do={
:log info ("NAVSPOT-INSTALL: guardian content retry " . $prefixRetry . "/${maxRetries} (" . [:len $scriptContent] . " bytes)")
:delay ${writeDelay}ms
}
}
:local prefix [:pick $scriptContent 0 100]
# v7.1.23: Enhanced validation
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: guardian content INVALIDO - header ou sem :log")
:do { /file remove $guardTempFile } on-error={}
} else={
:log info ("NAVSPOT-INSTALL: guardian content valido (" . [:len $scriptContent] . " bytes)")
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
# v7.1.32: Create from variable (not direct file read) - eliminates race condition
:do { /system script add name="navspot-guardian" policy=read,write,test source=$scriptContent } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar guardian" }
:delay 300ms
:do { /file remove $guardTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-guardian v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: guardian fetch falhou apos 3 tentativas"
}

# ===== 4. SCHEDULERS (idempotent remove-then-add) =====
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-INSTALL: Scheduler sync criado"

:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-INSTALL: Scheduler guardian criado"

# ===== 5. NETWATCH =====
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT-INSTALL: Netwatch configurado"

:log info "=========================================="
:log info "NAVSPOT-INSTALL v${VERSION}: INSTALACAO CONCLUIDA!"
:log info "Mode: ROS ${rosVersion} (${rosConfig.useFullActionProcessor ? 'full action-processor' : 'reduced action-processor'})"
:log info "Scripts: navspot-sync, navspot-action-processor, navspot-guardian"
:log info "Schedulers: sync a cada ${syncIntervalMinutes}m, guardian a cada 10m"
:log info "=========================================="

# ===== 6. PRIMEIRO SYNC =====
:log info "NAVSPOT-INSTALL: Executando primeiro sync..."
:delay 2s
:do {/system script run navspot-sync} on-error={:log warning "NAVSPOT-INSTALL: sync inicial falhou (nao-fatal)"}
`
}

/**
 * v7.1.18: LEGACY - Generate sync script using file-based approach
 * Kept for backwards compatibility
 */
function generateSyncScript(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  return generateScriptViaFile("navspot-sync", source)
}

/**
 * v7.1.34: Generate action-processor script using file-based approach
 * Uses full or reduced version based on ROS config
 */
function generateActionProcessorScript(rosConfig: ROSConfig): string {
  const source = rosConfig.useFullActionProcessor 
    ? generateActionProcessorFullSource()
    : generateActionProcessorCoreSource()
  return generateScriptViaFile("navspot-action-processor", source)
}

/**
 * v7.1.18: LEGACY - Generate guardian script using file-based approach
 * Kept for backwards compatibility
 */
function generateGuardianScript(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  return generateScriptViaFile("navspot-guardian", source)
}

// ==========================================
// v7.1.18: LEGACY RSC wrappers (backwards compatibility)
// ==========================================

function generateSyncRSC(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  return generateScriptViaFile("navspot-sync", source)
}

function generateActionProcessorRSC(rosConfig: ROSConfig): string {
  const source = rosConfig.useFullActionProcessor 
    ? generateActionProcessorFullSource()
    : generateActionProcessorCoreSource()
  return generateScriptViaFile("navspot-action-processor", source)
}

function generateGuardianRSC(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  return generateScriptViaFile("navspot-guardian", source)
}

// ==========================================
// SCRIPT SOURCES (RouterOS code - pure, no wrapper)
// v7.1.23: AGGRESSIVELY COMPACTED for <3.2KB target
// ==========================================

/**
 * v7.1.23: COMPACTED Sync source (~2.8KB)
 * - Minified variable names (token->tk, users->u, etc)
 * - Removed verbose logs
 * - Simplified retry logic
 */
function generateSyncSource(syncUrl: string, syncToken: string): string {
  // v7.1.49: Lock timeout using native uptime-as-secs (RouterOS 7.x)
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:global navspotSyncLockTime
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ([:len $navspotSyncLockTime]=0) do={:set navspotSyncLockTime 0}
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:log warning "NAVSPOT-SYNC: uptime-as-secs indisponivel";:set us 0}
:do {
:if ($navspotSyncLock="1") do={
:local shouldSkip true
:if ($us=0) do={
:log warning "NAVSPOT-SYNC: uptime unavailable, forcing lock reset"
:set shouldSkip false
} else={
:local la 999
:if (([:typeof $navspotSyncLockTime]="num")&&($navspotSyncLockTime>0)) do={:set la ($us - $navspotSyncLockTime)}
:if ($la>300) do={
:log warning ("NAVSPOT-SYNC: lock expirado (age=" . $la . "s), resetando")
:set shouldSkip false
} else={:log info ("NAVSPOT-SYNC: locked (age=" . $la . "s)")}
}
:if ($shouldSkip) do={:return}}
:local step "0-init"
:set navspotSyncLock "1"
:set navspotSyncLockTime $us
:set step "1-lock"
:log info "NAVSPOT-SYNC: step=1-lock"
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "${syncToken}"}
:set step "2-token"
:log info "NAVSPOT-SYNC: step=2-token"
:local u ""
:local r ""
:local p ""
:local q "\\22"
:log info "NAVSPOT-SYNC: step=2a-active"
:do {:foreach a in=[/ip hotspot active find] do={
:local au [/ip hotspot active get $a user]
:local am [/ip hotspot active get $a mac-address]
:local abi [/ip hotspot active get $a bytes-in]
:local abo [/ip hotspot active get $a bytes-out]
:set u ($u.$au.",".$am.",".$abi.",".$abo.";")
}} on-error={:log warning "NAVSPOT-SYNC: active collect failed"}
:log info "NAVSPOT-SYNC: step=2b-users"
:do {:foreach i in=[/ip hotspot user find where dynamic=no] do={:set r ($r.[/ip hotspot user get $i name].",")
}} on-error={:log warning "NAVSPOT-SYNC: user collect failed"}
:log info "NAVSPOT-SYNC: step=2c-profiles"
:do {:foreach x in=[/ip hotspot user profile find] do={:set p ($p.[/ip hotspot user profile get $x name].",")
}} on-error={:log warning "NAVSPOT-SYNC: profile collect failed"}
# v7.1.57: Telemetry with error isolation + broken chaining
:set step "2d-telemetry"
:log info "NAVSPOT-SYNC: step=2d-telemetry"
:local hp ""
:local hlb ""
:local hlu ""
:do {
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={
:do {:local pN [:tostr [/ip hotspot get $hs profile]];:set hp [/ip hotspot profile find name=$pN]} on-error={:log warning "NAVSPOT-SYNC: tele-profile-find failed"}
}
} on-error={:log warning "NAVSPOT-SYNC: tele-hs-find failed"}
:if ([:len $hp]=0) do={:do {:set hp [/ip hotspot profile find name="hsprof-navspot"]} on-error={}}
:if ([:len $hp]>0) do={
:do {:set hlb [/ip hotspot profile get $hp login-by]} on-error={:set hlb "";:log warning "NAVSPOT-SYNC: tele-lb failed"}
:do {:set hlu [/ip hotspot profile get $hp login-url]} on-error={:set hlu "";:log warning "NAVSPOT-SYNC: tele-lu failed"}
}
:set step "3-collect"
:log info "NAVSPOT-SYNC: step=3-collect"
:local b ("{".$q."sync_token".$q.":".$q.$tk.$q.",".$q."active_users_csv".$q.":".$q.$u.$q.",".$q."registered_users_csv".$q.":".$q.$r.$q.",".$q."registered_profiles_csv".$q.":".$q.$p.$q.",".$q."hotspot_login_by".$q.":".$q.$hlb.$q.",".$q."hotspot_login_url".$q.":".$q.$hlu.$q."}")
:set step "4-json"
:log info "NAVSPOT-SYNC: step=4-json"
:local ok false
# v7.1.62b: Fixed filename + proper delays for RouterOS 7
:local respFile "navspot-resp.txt"
# Cleanup legacy timestamped files (one-time)
:do {:foreach oldF in=[/file find where name~"^navspot-resp-"] do={/file remove $oldF}} on-error={}
# Remove previous response file and wait for filesystem flush
:do {/file remove $respFile} on-error={}
:delay 1s
:set step "5-fetch"
:log info "NAVSPOT-SYNC: step=5-fetch"
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
:do {/file remove "navspot-actions.txt"} on-error={}
:delay 200ms
:local wok false
:local wt 0
:while (($wt<3)&&($wok=false)) do={
:set wt ($wt+1)
:do {:local ef [/file find name="navspot-actions.txt"];:if ([:len $ef]=0) do={/file add name="navspot-actions.txt" contents=$a} else={/file set $ef contents=$a}} on-error={}
:delay 500ms
:local sv ""
:do {:set sv [/file get "navspot-actions.txt" contents]} on-error={}
:local fc ""
:if ([:len $sv]>0) do={:set fc [:pick $sv 0 1]}
:if (([:len $sv]>=12)&&($fc!="#")&&([:find $sv "|"]>=0)) do={:set wok true} else={
:log warning ("NAVSPOT-SYNC: write try=".$wt." len=".[:len $sv]." fc=[".$fc."] pf=[".[:pick $sv 0 80]."]")
}}
:if ($wok) do={
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
:log error "NAVSPOT-SYNC: AP NAO ENCONTRADO!"
} else={
:local apSrc ""
:do {:set apSrc [/system script get [find name="navspot-action-processor"] source]} on-error={}
:local apLen [:len $apSrc]
:log info ("NAVSPOT-SYNC: AP src=" . $apLen . "b")
:local apHead $apSrc
:if ($apLen>80) do={:set apHead [:pick $apSrc 0 80]}
:log info ("NAVSPOT-SYNC: AP head=" . $apHead)
:if ($apLen<100) do={
:log error ("NAVSPOT-SYNC: AP corrompido (" . $apLen . "b)")
} else={
# v7.1.62c: Safe conditional lock reset
:global navspotLock
:global navspotLockTime
:local apUs 0
:do {:set apUs [/system resource get uptime-as-secs]} on-error={:set apUs 0}
:if ([:typeof $navspotLock]="nothing") do={:set navspotLock "0"}
:if ($navspotLock="1") do={
:local lockAge 99999
:if (($apUs>0)&&([:typeof $navspotLockTime]!="nothing")&&($navspotLockTime>0)) do={:set lockAge ($apUs - $navspotLockTime)}
:log info ("NAVSPOT-SYNC: AP lock=1 age=" . $lockAge . "s lockTime=" . $navspotLockTime . " uptime=" . $apUs)
:if ($lockAge>120) do={
:log warning "NAVSPOT-SYNC: AP lock stale -> resetting"
:set navspotLock "0"
} else={
:log warning "NAVSPOT-SYNC: AP lock active -> skipping AP run"
}
}
:if ($navspotLock="0") do={
:local apRan false
:do {/system script run navspot-action-processor;:set apRan true} on-error={:log error "NAVSPOT-SYNC: AP THREW error"}
:if ($apRan) do={
:log info "NAVSPOT-SYNC: AP ran"
:delay 200ms
:local actLeft [/file find name="navspot-actions.txt"]
:if ([:len $actLeft]>0) do={
:local leftSize 0
:do {:set leftSize [:len [/file get "navspot-actions.txt" contents]]} on-error={}
:if ($leftSize>0) do={
:log warning ("NAVSPOT-SYNC: AP did NOT consume actions (" . $leftSize . "b remain)")
} else={
:log info "NAVSPOT-SYNC: AP consumed actions (file empty)"
}
} else={
:log info "NAVSPOT-SYNC: AP consumed actions (file removed)"
}
} else={
:log error "NAVSPOT-SYNC: AP FAILED (did not complete)"
:delay 200ms
:local fallD ""
:do {:set fallD [/file get "navspot-actions.txt" contents]} on-error={}
:if ([:len $fallD]>0) do={
:log info ("NAVSPOT-SYNC: inline fallback, data=" . [:len $fallD] . "b")
:do {/file remove "navspot-actions.txt"} on-error={}
:local fp 0
:do {
:while ([:find $fallD ";" $fp]>=0) do={
:local fe [:find $fallD ";" $fp]
:local fl [:pick $fallD $fp $fe]
:set fp ($fe+1)
:if ([:find $fl "configure_hotspot_profile|"]>=0) do={
:local pp ([:find $fl "|"]+1)
:local rest [:pick $fl $pp [:len $fl]]
:local pp2 [:find $rest "|"]
:if ($pp2>=0) do={
:local lu [:pick $rest 0 $pp2]
:local dn [:pick $rest ($pp2+1) [:len $rest]]
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={}}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url="$lu" dns-name="$dn"
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info ("NAVSPOT-SYNC: FALLBACK applied login-url + login-by on " . [/ip hotspot profile get $hp name])
}
}
}
}} on-error={:log error "NAVSPOT-SYNC: fallback parse error"}
}
}
} else={
:log warning "NAVSPOT-SYNC: AP skipped (lock held)"
}
}}
} else={
:log error "NAVSPOT-SYNC: write failed after 3 tries"
}
}
} else={
:if ($rl>0) do={
:local rHead $resp
:if ($rl>120) do={:set rHead [:pick $resp 0 120]}
:log warning ("NAVSPOT-SYNC: no actions, head=" . $rHead)
}}
}
} on-error={:log error ("NAVSPOT-SYNC: CRASH step=" . $step);:set navspotSyncLock "0"}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}

/**
 * v7.1.33: ULTRA-COMPACT Action Processor CORE (<2.9KB)
 * 
 * CRITICAL: RouterOS 6.x has ~3KB limit for /file get contents
 * The 4387-byte version was too big, causing empty content reads.
 * 
 * Contains ONLY essential handlers:
 * - configure_hotspot_profile (critical for login-url)
 * - create_profile (minimal 3-param: name|rate|shared)
 * - create_user (minimal: name|password|profile)
 * - add_whitelist_domain (walled garden)
 * 
 * REMOVED (now in AUX):
 * - add_firewall_block, add_firewall_allow
 */
function generateActionProcessorCoreSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}"
:global navspotLock
:global navspotLockTime
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:if ([:len $navspotLock]=0) do={:set navspotLock "0"}
:if ($navspotLock="1") do={
:local la 999
:if (($us>0)&&([:typeof $navspotLockTime]="num")&&($navspotLockTime>0)) do={:set la ($us - $navspotLockTime)}
:if ($la>120) do={:log warning ("NS-AP: lock expired (age=" . $la . "s)")} else={:log info ("NS-AP: locked (age=" . $la . "s)");:return}
}
:set navspotLock "1"
:set navspotLockTime $us
:local f [/file find name="navspot-actions.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={:set navspotLock "0";:return}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:log info ("NS-AP: " . [:len $d] . "b")
:local pos 0
:local cnt 0
:do {
:while ([:find $d ";" $pos]>=0) do={
:local ep [:find $d ";" $pos]
:local ln [:pick $d $pos $ep]
:set pos ($ep+1)
:if ([:len $ln]>0) do={
:local p1 [:find $ln "|"]
:if ($p1>=0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c="configure_hotspot_profile") do={
:log info "NS-AP: cfg-hp"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:if (([:len $lu]>0)&&([:len $dn]>0)) do={
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={:set hp ""}}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info ("NAVSPOT: login-by=cookie,http-pap aplicado em ".[/ip hotspot profile get $hp name])
:set cnt ($cnt+1)
}}}} on-error={}}
:if ($c="create_profile") do={
:log info "NS-AP: c-prof"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:local sub2 [:pick $sub ($p3+1) [:len $sub]];:local p4 [:find $sub2 "|"];:if ($p4>=0) do={:set sh [:pick $sub2 0 $p4]} else={:set sh $sub2}} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]>0) do={
:if ([:len $rt]>0) do={/ip hotspot user profile set $ex rate-limit=$rt}
/ip hotspot user profile set $ex shared-users=$sh
} else={
:if ([:len $rt]>0) do={/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} else={/ip hotspot user profile add name=$n shared-users=$sh}
}
:set cnt ($cnt+1)
}} on-error={}}
:if ($c="create_user") do={
:log info "NS-AP: c-user"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
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
}} on-error={}}
:if (($c="create_whitelist_domain")||($c="add_whitelist_domain")) do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local wg [/ip hotspot walled-garden find dst-host~$dom]
:if ([:len $wg]=0) do={/ip hotspot walled-garden add dst-host=("*".$dom."*") action=allow comment="navspot";:set cnt ($cnt+1)}
}} on-error={}}
}}}
} on-error={:log error ("NS-AP: CRASH=" . [:tostr $error])}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - ".$cnt)`
}

/**
 * v7.1.34: FULL Action Processor for RouterOS 7.x (~4.5KB)
 * 
 * RouterOS 7.x has NO buffer limit for /file get contents, so we can include
 * ALL handlers including firewall rules that were removed from CORE.
 * 
 * Contains ALL handlers:
 * - configure_hotspot_profile (critical for login-url)
 * - create_profile (full: name|rate|shared)
 * - create_user (full: name|password|profile)
 * - add_whitelist_domain (walled garden)
 * - add_firewall_block (restored from v7.1.32)
 * - add_firewall_allow (restored from v7.1.32)
 * - remove_user
 * - disable_user / enable_user
 * - kick_session
 */
function generateActionProcessorFullSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}"
:global navspotLock
:global navspotLockTime
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:if ([:len $navspotLock]=0) do={:set navspotLock "0"}
:if ($navspotLock="1") do={
:local la 999
:if (($us>0)&&([:typeof $navspotLockTime]="num")&&($navspotLockTime>0)) do={:set la ($us - $navspotLockTime)}
:if ($la>120) do={:log warning ("NS-AP: lock expired (age=" . $la . "s)")} else={:log info ("NS-AP: locked (age=" . $la . "s)");:return}
}
:set navspotLock "1"
:set navspotLockTime $us
:local f [/file find name="navspot-actions.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={:set navspotLock "0";:return}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:local dHead $d
:if ([:len $d]>80) do={:set dHead [:pick $d 0 80]}
:log info ("NS-AP: data=" . [:len $d] . "b head=" . $dHead)
:local pos 0
:local cnt 0
:do {
:while ([:find $d ";" $pos]>=0) do={
:local ep [:find $d ";" $pos]
:local ln [:pick $d $pos $ep]
:set pos ($ep+1)
:if ([:len $ln]>0) do={
:local p1 [:find $ln "|"]
:if ($p1>=0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c="configure_hotspot_profile") do={
:log info "NS-AP: cfg-hp"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:if (([:len $lu]>0)&&([:len $dn]>0)) do={
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={:set hp ""}}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info ("NAVSPOT: login-by=cookie,http-pap aplicado em ".[/ip hotspot profile get $hp name])
:set cnt ($cnt+1)
}}}} on-error={}}
:if ($c="create_profile") do={
:log info "NS-AP: c-prof"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:local sub2 [:pick $sub ($p3+1) [:len $sub]];:local p4 [:find $sub2 "|"];:if ($p4>=0) do={:set sh [:pick $sub2 0 $p4]} else={:set sh $sub2}} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]>0) do={
:if ([:len $rt]>0) do={/ip hotspot user profile set $ex rate-limit=$rt}
/ip hotspot user profile set $ex shared-users=$sh
} else={
:if ([:len $rt]>0) do={/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} else={/ip hotspot user profile add name=$n shared-users=$sh}
}
:set cnt ($cnt+1)
}} on-error={}}
:if ($c="create_user") do={
:log info "NS-AP: c-user"
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
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
}} on-error={}}
:if (($c="create_whitelist_domain")||($c="add_whitelist_domain")) do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local wg [/ip hotspot walled-garden find dst-host~$dom]
:if ([:len $wg]=0) do={/ip hotspot walled-garden add dst-host=("*".$dom."*") action=allow comment="navspot";:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="add_firewall_block") do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-BLOCK-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={
/ip firewall filter add chain=forward content=$dom action=drop comment=$cm place-before=0
:set cnt ($cnt+1)
}}} on-error={}}
:if ($c="add_firewall_allow") do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-ALLOW-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={
/ip firewall filter add chain=forward content=$dom action=accept comment=$cm place-before=0
:set cnt ($cnt+1)
}}} on-error={}}
:if ($c="remove_user") do={
:do {
:if ([:len $r]>0) do={
:local ex [/ip hotspot user find name=$r]
:if ([:len $ex]>0) do={/ip hotspot user remove $ex;:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="disable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=yes;:set cnt ($cnt+1)}} on-error={}}
:if ($c="enable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=no;:set cnt ($cnt+1)}} on-error={}}
:if ($c="kick_session") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local mac [:pick $r ($p2+1) [:len $r]]
:if ([:len $mac]>0) do={/ip hotspot active remove [find mac-address=$mac];:set cnt ($cnt+1)}
}} on-error={}}
}}}
} on-error={:log error ("NS-AP: CRASH=" . [:tostr $error])}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - ".$cnt)`
}

/**
 * v7.1.23: Action Processor AUX (~2.5KB)
 * Contains secondary handlers for optional functionality:
 * - remove_user (moved from core to reduce size)
 * - create_whitelist_domain (walled garden allow)
 * - create_blacklist_domain (walled garden deny)
 * - disable_user / enable_user
 * - kick_session
 * - update_password
 */
function generateActionAuxSource(): string {
  return `:log info "NAVSPOT-ACTION-AUX v${VERSION}"
:global navspotLock
:global navspotLockTime
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:if ([:len $navspotLock]=0) do={:set navspotLock "0"}
:if ($navspotLock="1") do={
:local la 999
:if (($us>0)&&([:typeof $navspotLockTime]="num")&&($navspotLockTime>0)) do={:set la ($us - $navspotLockTime)}
:if ($la>120) do={:log warning ("NS-AP-AUX: lock expired (age=" . $la . "s)")} else={:log info ("NS-AP-AUX: locked (age=" . $la . "s)");:return}
}
:set navspotLock "1"
:set navspotLockTime $us
:local f [/file find name="navspot-actions-aux.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:local pos 0
:local cnt 0
:do {
:while ([:find $d ";" $pos]>=0) do={
:local ep [:find $d ";" $pos]
:local ln [:pick $d $pos $ep]
:set pos ($ep+1)
:if ([:len $ln]>0) do={
:local p1 [:find $ln "|"]
:if ($p1>=0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c="remove_user") do={
:do {
:if ([:len $r]>0) do={
:local ex [/ip hotspot user find name=$r]
:if ([:len $ex]>0) do={
:do {/ip hotspot user remove $ex} on-error={}
:set cnt ($cnt+1)
}}
} on-error={}
}
:if ($c="create_whitelist_domain") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local dom [:pick $r ($p2+1) [:len $r]]
:if ([:len $dom]>0) do={
:local dh ("*".$dom."*")
:do {/ip hotspot walled-garden add dst-host=$dh action=allow comment="navspot-whitelist"} on-error={}
:set cnt ($cnt+1)
}}
} on-error={}
}
:if ($c="create_blacklist_domain") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local dom [:pick $r ($p2+1) [:len $r]]
:if ([:len $dom]>0) do={
:local dh ("*".$dom."*")
:do {/ip hotspot walled-garden add dst-host=$dh action=deny comment="navspot-blacklist"} on-error={}
:set cnt ($cnt+1)
}}
} on-error={}
}
:if ($c="disable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=yes;:set cnt ($cnt+1)}} on-error={}
}
:if ($c="enable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=no;:set cnt ($cnt+1)}} on-error={}
}
:if ($c="kick_session") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local mac [:pick $r ($p2+1) [:len $r]]
:if ([:len $mac]>0) do={
:do {/ip hotspot active remove [find mac-address=$mac]} on-error={}
:set cnt ($cnt+1)
}}
} on-error={}
}
:if ($c="update_password") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local pw [:pick $r ($p2+1) [:len $r]]
:if (([:len $un]>0)&&([:len $pw]>0)) do={
:do {/ip hotspot user set [find name=$un] password=$pw} on-error={}
:set cnt ($cnt+1)
}}
} on-error={}
}
}}}
} on-error={:log error ("NS-AP-AUX: CRASH=" . [:tostr $error])}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION-AUX v${VERSION}: OK - ".$cnt)`
}

function generateGuardianSource(recoveryUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-GUARDIAN v${VERSION}"
:local needsRepair 0
:local missing ""
:local syncScript [/system script find name="navspot-sync"]
:local apScript [/system script find name="navspot-action-processor"]
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $syncScript]=0) do={:set needsRepair 1;:set missing ($missing."sync ")}
:if ([:len $apScript]=0) do={:set needsRepair 1;:set missing ($missing."action ")}
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
:if ([:find $loginBy "http-chap"]>=0) do={:set needsRepair 1;:set missing ($missing."login-chap ")}}
:if (($needsRepair=0)&&([:len $apScript]>0)) do={
:local apSrc [/system script get $apScript source]
:if ([:find $apSrc "configure_hotspot_profile"]<0) do={
:set needsRepair 1
:set missing ($missing."action-outdated ")
}}
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
