import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.1.25
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
 * 
 * v7.1.25: FILE READ TIMING FIX for RouterOS 6.x
 *   - Increased post-fetch delay from 700ms to 1500ms
 *   - Added retry loop (3 attempts) for file size validation
 *   - Added minimum size check (50 bytes) before content validation
 *   - Fixes 0-byte file reads on slow flash storage
 * 
 * v7.1.24: RouterOS 6.x COMPATIBILITY FIX
 *   - Removed :rndnum (only exists in RouterOS 7.x)
 *   - Using timestamp only for unique temp file names
 * 
 * v7.1.23: AGGRESSIVE COMPACTION + ENHANCED SAFEGUARDS
 *   - sync-raw reduced to ~2.8KB (minified variables/logs)
 *   - action-raw reduced to ~3.1KB (move remove_user to AUX)
 *   - Header detection (# NAME) in content validation
 *   - Smoke test with $error capture and cleanup
 *   - Multi-line fallback with minimal escaping (~1.2KB)
 * 
 * Returns: text/plain RSC script or raw RouterOS source
 */

const VERSION = "7.1.25"
const DEPLOYED_AT = new Date().toISOString()

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

    if (!syncToken) {
      console.error(`[mikrotik-scripts ${VERSION}] Missing token parameter`)
      return new Response(
        '# Error: token parameter is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }

    console.log(`[mikrotik-scripts ${VERSION}] Request: type=${scriptType}, token=${maskToken(syncToken)}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Validate token and get hotspot info
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, sync_token, sync_interval_minutes,
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

    console.log(`[mikrotik-scripts ${VERSION}] Generating scripts for: ${hotspot.nome}`)

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
        break
      case 'action-raw':
        script = generateActionProcessorCoreSource()
        console.log(`[mikrotik-scripts ${VERSION}] action-raw size: ${script.length} bytes`)
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
        script = generateActionProcessorScript()
        break
      case 'guardian':
        script = generateGuardianScript(recoveryUrl, syncToken)
        break
      case 'sync-source':
        script = generateSyncRSC(syncUrl, syncToken)
        break
      case 'action-source':
        script = generateActionProcessorRSC()
        break
      case 'guardian-source':
        script = generateGuardianRSC(recoveryUrl, syncToken)
        break
      
      // v7.1.23: Updated installer with modularization + smoke test + safeguards
      case 'all':
      default:
        script = generateAllScripts(supabaseUrl, syncToken, syncIntervalMinutes)
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
 * v7.1.23: REWRITTEN - Generate installer with COMPACTION + ENHANCED SAFEGUARDS
 * 
 * Key changes:
 *   - Unique temp file names with [:rndnum] for race-condition prevention
 *   - Header detection (# NAME) to catch failed file set operations
 *   - Smoke test with $error capture for better diagnostics
 *   - Multi-line fallback with minimal escaping (~1.2KB)
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number
): string {
  const apiBase = `${supabaseUrl}/functions/v1`
  
  // v7.1.23: Multi-line fallback source (~1.2KB) - NO complex escaping
  // This fallback handles only create_profile and create_user
  const fallbackSource = `:log info "NAVSPOT-ACTION v${VERSION}F: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :return }
:set navspotLock "1"
:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ :set navspotLock "0"; :return }
:local raw [/file get $fid contents]
:do { /file remove $fid } on-error={}
:local pos 0
:local cnt 0
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
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}F: OK - " . $cnt)`

  // Escape the fallback for embedding in RSC (minimal escaping for multi-line)
  const escapedFallback = fallbackSource
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')

  return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# AGGRESSIVE COMPACTION + ENHANCED SAFEGUARDS
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-INSTALL v${VERSION}: Iniciando instalacao..."

# URLs construidas incrementalmente (limite 160 chars)
:local apiBase "${apiBase}"
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"

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
:local syncRawUrl ($apiBase . $ep . "?type=sync-raw&token=" . $tk)
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local syncOk false
:local syncRetry 0
:while (($syncRetry < 3) && ($syncOk = false)) do={
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
# v7.1.25: Increased delay + retry loop for file read timing issues
:delay 1500ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $syncTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: sync read retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $syncTempFile } on-error={}
} else={
:local prefix ""
:do { :set prefix [:pick [/file get $syncTempFile contents] 0 100] } on-error={}
# v7.1.23: Enhanced validation - detect header pattern OR missing :log
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: sync content INVALIDO - header ou sem :log")
:log error ("NAVSPOT-INSTALL: prefix=" . $prefix)
:do { /file remove $syncTempFile } on-error={}
} else={
:log info "NAVSPOT-INSTALL: sync content valido"
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-sync" policy=read,write,test source=[/file get $syncTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v${VERSION} instalado"
}
}
} else={
:log error "NAVSPOT-INSTALL: sync fetch falhou apos 3 tentativas"
}

# ===== 2. ACTION PROCESSOR CORE (fetch raw source ~3.1KB) =====
:log info "NAVSPOT-INSTALL: Baixando action-raw (core)..."
:local actionRawUrl ($apiBase . $ep . "?type=action-raw&token=" . $tk)
:local actionTempFile ("ns-action-" . $tsStr . ".src")
:local actionOk false
:local actionRetry 0
:while (($actionRetry < 3) && ($actionOk = false)) do={
:set actionRetry ($actionRetry + 1)
:log info ("NAVSPOT-INSTALL: action tentativa " . $actionRetry . "/3")
:do {
/tool fetch url=$actionRawUrl check-certificate=no dst-path=$actionTempFile
:set actionOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: action fetch tentativa " . $actionRetry . " falhou")
:delay 5s
}
}
:if ($actionOk = true) do={
# v7.1.25: Increased delay + retry loop for file read timing issues
:delay 1500ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $actionTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: action read retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: action baixado (" . $fsize . " bytes)")
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: action arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $actionTempFile } on-error={}
} else={
:local prefix ""
:do { :set prefix [:pick [/file get $actionTempFile contents] 0 100] } on-error={}
# v7.1.23: Enhanced validation - detect header pattern OR missing :log
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: action content INVALIDO - header ou sem :log")
:log error ("NAVSPOT-INSTALL: prefix=" . $prefix)
:do { /file remove $actionTempFile } on-error={}
} else={
:log info "NAVSPOT-INSTALL: action content valido"
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-action-processor" policy=read,write,test source=[/file get $actionTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar action" }
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
:local guardRawUrl ($apiBase . $ep . "?type=guardian-raw&token=" . $tk)
:local guardTempFile ("ns-guard-" . $tsStr . ".src")
:local guardOk false
:local guardRetry 0
:while (($guardRetry < 3) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:log info ("NAVSPOT-INSTALL: guardian tentativa " . $guardRetry . "/3")
:do {
/tool fetch url=$guardRawUrl check-certificate=no dst-path=$guardTempFile
:set guardOk true
} on-error={
:log warning ("NAVSPOT-INSTALL: guardian fetch tentativa " . $guardRetry . " falhou")
:delay 5s
}
}
:if ($guardOk = true) do={
# v7.1.25: Increased delay + retry loop for file read timing issues
:delay 1500ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $guardTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: guardian read retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: guardian baixado (" . $fsize . " bytes)")
# v7.1.25: Validate minimum size before content check
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: guardian arquivo muito pequeno ou vazio - " . $fsize . " bytes")
:do { /file remove $guardTempFile } on-error={}
} else={
:local prefix ""
:do { :set prefix [:pick [/file get $guardTempFile contents] 0 100] } on-error={}
# v7.1.23: Enhanced validation
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
:log error ("NAVSPOT-INSTALL: guardian content INVALIDO - header ou sem :log")
:do { /file remove $guardTempFile } on-error={}
} else={
:log info "NAVSPOT-INSTALL: guardian content valido"
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-guardian" policy=read,write,test source=[/file get $guardTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar guardian" }
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
:log info "Scripts: navspot-sync, navspot-action-processor, navspot-guardian"
:log info "Schedulers: sync a cada ${syncIntervalMinutes}m, guardian a cada 10m"
:log info "=========================================="

# ===== 6. PRIMEIRO SYNC =====
:log info "NAVSPOT-INSTALL: Executando primeiro sync..."
:delay 2s
/system script run navspot-sync
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
 * v7.1.18: LEGACY - Generate action-processor script using file-based approach
 * Kept for backwards compatibility
 */
function generateActionProcessorScript(): string {
  const source = generateActionProcessorCoreSource()
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

function generateActionProcessorRSC(): string {
  const source = generateActionProcessorCoreSource()
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
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:if ($navspotSyncLock="1") do={:return}
:set navspotSyncLock "1"
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "${syncToken}"}
:local u ""
:local r ""
:local p ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:set u ($u.[get $a user].",".[get $a mac-address].",".[get $a bytes-in].",".[get $a bytes-out].";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={:set r ($r.[get $i name].",")}
/ip hotspot user profile
:foreach x in=[find] do={:set p ($p.[get $x name].",")}
:local b ("{".$q."sync_token".$q.":".$q.$tk.$q.",".$q."active_users_csv".$q.":".$q.$u.$q.",".$q."registered_users_csv".$q.":".$q.$r.$q.",".$q."registered_profiles_csv".$q.":".$q.$p.$q."}")
:local ok false
:do {
/tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-resp.txt"
:set ok true
} on-error={}
:if ($ok) do={
:delay 500ms
:local resp ""
:do {:set resp [/file get "navspot-resp.txt" contents]} on-error={}
:do {/file remove "navspot-resp.txt"} on-error={}
:local s [:find $resp "[["]
:local e [:find $resp "]]"]
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
/file print file=navspot-actions.txt where name="__x__"
:delay 700ms
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
:delay 300ms
:do {/system script run navspot-action-processor} on-error={}
}
}
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}

/**
 * v7.1.23: COMPACTED Action Processor CORE (~3.1KB)
 * Contains only essential handlers:
 * - configure_hotspot_profile (critical for login-url)
 * - create_profile (robust 4-param parsing)
 * - create_user (core functionality)
 * 
 * NOTE: remove_user moved to AUX script to reduce size
 */
function generateActionProcessorCoreSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}"
:global navspotLock
:if ($navspotLock="1") do={:return}
:set navspotLock "1"
:local f [/file find name="navspot-actions.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={:set navspotLock "0";:return}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:local pos 0
:local cnt 0
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
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:if (([:len $lu]>0)&&([:len $dn]>0)) do={
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hp]>0) do={
:do {/ip hotspot profile set $hp login-url=$lu} on-error={}
:do {/ip hotspot profile set $hp dns-name=$dn} on-error={}
:do {/ip hotspot profile set $hp login-by=http-pap,http-chap} on-error={}
:set cnt ($cnt+1)
}}}
} on-error={}
}
:if ($c="create_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:if ([:len $n]>0) do={
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={
:set rt [:pick $sub 0 $p3]
:local s2 [:pick $sub ($p3+1) [:len $sub]]
:local p4 [:find $s2 "|"]
:if ($p4>=0) do={:set sh [:pick $s2 0 $p4]} else={:set sh $s2}
} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]=0) do={
:if ([:len $rt]>0) do={
:do {/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} on-error={}
} else={
:do {/ip hotspot user profile add name=$n shared-users=$sh} on-error={}
}
:set cnt ($cnt+1)
}
}}
} on-error={}
}
:if ($c="create_user") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:if ([:len $un]>0) do={
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3>=0) do={
:set pw [:pick $sub 0 $p3]
:set pf [:pick $sub ($p3+1) [:len $sub]]
} else={:set pw $sub}
:if ([:len $pf]=0) do={:set pf "default"}
:local pe [/ip hotspot user profile find name=$pf]
:if ([:len $pe]=0) do={:do {/ip hotspot user profile add name=$pf} on-error={}}
:local ex [/ip hotspot user find name=$un]
:if ([:len $ex]=0) do={
:if ([:len $pw]>0) do={
:do {/ip hotspot user add name=$un password=$pw profile=$pf comment="navspot"} on-error={}
:set cnt ($cnt+1)
}}
}}
} on-error={}
}
}}}
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
:if ($navspotLock="1") do={:return}
:set navspotLock "1"
:local f [/file find name="navspot-actions-aux.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:local pos 0
:local cnt 0
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
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof]>0) do={:set loginUrl [/ip hotspot profile get $hsprof login-url]}
:if ([:len $loginUrl]<10) do={:set needsRepair 1;:set missing ($missing."login-url ")}
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
