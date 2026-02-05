import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.1.22
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
 * v7.1.22: MODULARIZATION + ROBUST VALIDATION + SECURE FALLBACK
 *   - Action processor reduced to ~2.5KB (core handlers only)
 *   - New action-aux script for secondary handlers (~2KB)
 *   - Multi-line fallback (~1.2KB) with minimal escaping
 *   - Smoke test validation before accepting action-processor
 *   - Unique temp file names with timestamp
 *   - Configurable delays for slow flash
 * 
 * v7.1.21: Fixed sanitization (preserve backslash for placeholders)
 * v7.1.18: FETCH RAW SOURCE STRATEGY (Critical Fix)
 * 
 * Returns: text/plain RSC script or raw RouterOS source
 */

const VERSION = "7.1.22"
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
      // v7.1.22: Raw source endpoints (pure RouterOS code, no wrapper)
      case 'sync-raw':
        script = generateSyncSource(syncUrl, syncToken)
        break
      case 'action-raw':
        script = generateActionProcessorCoreSource()
        break
      // v7.1.22: NEW - Auxiliary action handlers
      case 'action-aux-raw':
        script = generateActionAuxSource()
        break
      case 'guardian-raw':
        script = generateGuardianSource(recoveryUrl, syncToken)
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
      
      // v7.1.22: Updated installer with modularization + smoke test
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
 * v7.1.22: REWRITTEN - Generate installer with MODULARIZATION + SMOKE TEST
 * 
 * Key changes:
 *   - Action processor reduced to ~2.5KB (core handlers)
 *   - Unique temp file names with timestamp
 *   - Configurable delays for slow flash (700ms after fetch)
 *   - Smoke test validation after script creation
 *   - Multi-line fallback with minimal escaping (~1.2KB)
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number
): string {
  const apiBase = `${supabaseUrl}/functions/v1`
  
  // v7.1.22: Multi-line fallback source (~1.2KB) - NO complex escaping
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
# MODULARIZATION + SMOKE TEST Strategy
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-INSTALL v${VERSION}: Iniciando instalacao..."

# URLs construidas incrementalmente (limite 160 chars)
:local apiBase "${apiBase}"
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"

# v7.1.22: Unique temp file names with timestamp
:local ts [/system clock get time]
:local tsStr [:pick $ts 0 2]
:set tsStr ($tsStr . [:pick $ts 3 5])
:set tsStr ($tsStr . [:pick $ts 6 8])

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

# ===== 1. SYNC SCRIPT (fetch raw source) =====
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
:delay 700ms
:local fsize 0
:do { :set fsize [/file get $syncTempFile size] } on-error={}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
:local prefix ""
:do { :set prefix [:pick [/file get $syncTempFile contents] 0 40] } on-error={}
:if ([:find $prefix ":log info"] >= 0) do={
:log info "NAVSPOT-INSTALL: sync content valido"
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-sync" policy=read,write,test source=[/file get $syncTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar sync" }
:delay 300ms
:do { /file remove $syncTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-sync v${VERSION} instalado"
} else={
:log error ("NAVSPOT-INSTALL: sync content INVALIDO (prefix=" . $prefix . ")")
:do { /file remove $syncTempFile } on-error={}
}
} else={
:log error "NAVSPOT-INSTALL: sync fetch falhou apos 3 tentativas"
}

# ===== 2. ACTION PROCESSOR CORE (fetch raw source ~2.5KB) =====
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
:delay 700ms
:local fsize 0
:do { :set fsize [/file get $actionTempFile size] } on-error={}
:log info ("NAVSPOT-INSTALL: action baixado (" . $fsize . " bytes)")
:local prefix ""
:do { :set prefix [:pick [/file get $actionTempFile contents] 0 40] } on-error={}
:if ([:find $prefix ":log info"] >= 0) do={
:log info "NAVSPOT-INSTALL: action content valido"
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-action-processor" policy=read,write,test source=[/file get $actionTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar action" }
:delay 300ms
:do { /file remove $actionTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-action-processor v${VERSION} instalado"
} else={
:log error ("NAVSPOT-INSTALL: action content INVALIDO (prefix=" . $prefix . ")")
:local fullPrefix ""
:do { :set fullPrefix [:pick [/file get $actionTempFile contents] 0 200] } on-error={}
:log error ("NAVSPOT-INSTALL: Primeiros 200 chars: " . $fullPrefix)
:do { /file remove $actionTempFile } on-error={}
}
} else={
:log error "NAVSPOT-INSTALL: action fetch falhou apos 3 tentativas"
}

# ===== 2.1 SMOKE TEST + FALLBACK (v7.1.22) =====
:delay 1s
:local apTestSrc ""
:do { :set apTestSrc [/system script get navspot-action-processor source] } on-error={}
:local apSrcLen [:len $apTestSrc]
:local apValid false
:if (($apSrcLen >= 100) && ([:find $apTestSrc ":log info"] >= 0)) do={ :set apValid true }

:if ($apValid = true) do={
:log info ("NAVSPOT-INSTALL: action-processor source validado (" . $apSrcLen . " bytes)")
# v7.1.22: SMOKE TEST - execute with safe test payload
:log info "NAVSPOT-INSTALL: Executando smoke test..."
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 500ms
/file set [find name="navspot-actions.txt"] contents="create_profile|test_min|1M|1;"
:delay 500ms
:local smokeOk false
:do {
/system script run navspot-action-processor
:set smokeOk true
} on-error={
:log error "NAVSPOT-INSTALL: smoke test FALHOU na execucao"
}
:if ($smokeOk = true) do={
:log info "NAVSPOT-INSTALL: smoke test PASSOU - action-processor OK"
} else={
:log error "NAVSPOT-INSTALL: smoke test falhou - aplicando FALLBACK INLINE"
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
/system script add name="navspot-action-processor" policy=read,write,test source="${escapedFallback}"
:delay 300ms
:log info "NAVSPOT-INSTALL: Fallback inline v${VERSION}F instalado"
}
} else={
:log error ("NAVSPOT-INSTALL: action-processor INVALIDO (" . $apSrcLen . " bytes) - aplicando FALLBACK INLINE")
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 300ms
/system script add name="navspot-action-processor" policy=read,write,test source="${escapedFallback}"
:delay 300ms
:log info "NAVSPOT-INSTALL: Fallback inline v${VERSION}F instalado"
}

# ===== 3. GUARDIAN (fetch raw source) =====
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
:delay 700ms
:local fsize 0
:do { :set fsize [/file get $guardTempFile size] } on-error={}
:log info ("NAVSPOT-INSTALL: guardian baixado (" . $fsize . " bytes)")
:local prefix ""
:do { :set prefix [:pick [/file get $guardTempFile contents] 0 40] } on-error={}
:if ([:find $prefix ":log info"] >= 0) do={
:log info "NAVSPOT-INSTALL: guardian content valido"
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:delay 300ms
:do { /system script add name="navspot-guardian" policy=read,write,test source=[/file get $guardTempFile contents] } on-error={ :log error "NAVSPOT-INSTALL: Falha ao criar guardian" }
:delay 300ms
:do { /file remove $guardTempFile } on-error={}
:log info "NAVSPOT-INSTALL: navspot-guardian v${VERSION} instalado"
} else={
:log error ("NAVSPOT-INSTALL: guardian content INVALIDO (prefix=" . $prefix . ")")
:do { /file remove $guardTempFile } on-error={}
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
// v7.1.22: Modularized - core and aux separated
// ==========================================

/**
 * v7.1.22: Sync source with retry logic for action file writing
 * - Added retry with exponential delays for flash write
 * - Validates saved file size matches expected
 */
function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}: Iniciando..."
:global navspotSyncLock
:if ($navspotSyncLock = "1") do={ :log info "NAVSPOT-SYNC: sync em andamento, ignorando"; :return }
:set navspotSyncLock "1"
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
:set token "${syncToken}"
:log warning "NAVSPOT-SYNC: Usando token fallback embutido"
}
:local syncUrl "${syncUrl}"
:local users ""
:local registered ""
:local profiles ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
/ip hotspot user profile
:foreach p in=[find] do={
:local pname [get $p name]
:set profiles ($profiles . $pname . ",")
}
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q)
:set body ($body . ":" . $q . $users . $q)
:set body ($body . "," . $q . "registered_users_csv" . $q)
:set body ($body . ":" . $q . $registered . $q)
:set body ($body . "," . $q . "registered_profiles_csv" . $q)
:set body ($body . ":" . $q . $profiles . $q . "}")
:local hdr "Content-Type: application/json"
:local fetchOk false
:local syncOk false
:do {
/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field=$hdr check-certificate=no dst-path="navspot-resp.txt"
:set fetchOk true
} on-error={ :log warning "NAVSPOT-SYNC: FETCH falhou (rede/TLS/DNS)"; :set navspotSyncLock "0" }
:if ($fetchOk = true) do={
:delay 500ms
:local fsize 0
:do { :set fsize [/file get "navspot-resp.txt" size] } on-error={}
:log info ("NAVSPOT-SYNC: Resp recebida (" . $fsize . " bytes)")
:local resp ""
:do { :set resp [/file get "navspot-resp.txt" contents] } on-error={}
:do { /file remove "navspot-resp.txt" } on-error={}
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={ :set i ($i + 1) }
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={ :set j ($j - 1) }
:local actions ""
:if ($j >= $i) do={ :set actions [:pick $raw $i ($j + 1)] }
:log info ("NAVSPOT-SYNC: pending_actions_pipe (" . [:len $actions] . " chars)")
:if ([:len $actions] = 0) do={
:log info "NAVSPOT-SYNC: Nenhuma acao pendente"
:set syncOk true
} else={
# v7.1.22: Retry with exponential delays for flash write
:local writeOk false
:local retry 0
:local expectedLen [:len $actions]
:while (($retry < 3) && ($writeOk = false)) do={
:set retry ($retry + 1)
:local delayMs (500 * $retry)
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay ($delayMs . "ms")
:do { /file set [find where name="navspot-actions.txt"] contents=$actions } on-error={ :log error "NAVSPOT-SYNC: Falha ao salvar arquivo" }
:delay ($delayMs . "ms")
:local savedLen 0
:do { :set savedLen [:len [/file get [find where name="navspot-actions.txt"] contents]] } on-error={}
:if ($savedLen = $expectedLen) do={
:set writeOk true
:log info ("NAVSPOT-SYNC: Arquivo salvo OK (tentativa " . $retry . ", size=" . $savedLen . ")")
} else={
:log warning ("NAVSPOT-SYNC: Mismatch tentativa " . $retry . " (expected=" . $expectedLen . ", saved=" . $savedLen . ")")
}
}
:if ($writeOk = true) do={
:log info "NAVSPOT-SYNC: Acionando action-processor..."
:do {
/system script run navspot-action-processor
:set syncOk true
} on-error={
:log error "NAVSPOT-SYNC: action-processor FALHOU na execucao"
}
} else={
:log error "NAVSPOT-SYNC: Falha ao salvar arquivo apos 3 tentativas"
}
}
} else={
:local respPrefix ""
:if ([:len $resp] > 80) do={
:set respPrefix [:pick $resp 0 80]
} else={
:set respPrefix $resp
}
:log warning ("NAVSPOT-SYNC: Resposta invalida (prefix=" . $respPrefix . ")")
}
}
:set navspotSyncLock "0"
:if ($syncOk = true) do={
:log info "NAVSPOT-SYNC v${VERSION}: OK"
} else={
:log warning "NAVSPOT-SYNC v${VERSION}: Concluido com erros"
}`
}

/**
 * v7.1.22: Action Processor CORE (~2.5KB)
 * Contains only essential handlers:
 * - configure_hotspot_profile (critical for login-url)
 * - create_profile (robust 4-param parsing)
 * - create_user (core functionality)
 * - remove_user (user removal)
 */
function generateActionProcessorCoreSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :log info "NAVSPOT-ACTION: lock ativo"; :return }
:set navspotLock "1"
:local fid [/file find where name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Arquivo nao encontrado"
:return
}
:local rawData ""
:do {
:set rawData [/file get $fid contents]
} on-error={
:log error "NAVSPOT-ACTION: Erro leitura"
:set navspotLock "0"
:return
}
:log info ("NAVSPOT-ACTION: len=" . [:len $rawData])
:do { /file remove $fid } on-error={}
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log info "NAVSPOT-ACTION: Nenhuma acao pendente"
:return
}
:local pos 0
:local processedCount 0
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:if ([:len $line] > 0) do={
:local p1 [:find $line "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $line 0 $p1]
:local rest [:pick $line ($p1 + 1) [:len $line]]
:if ($cmd = "configure_hotspot_profile") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local loginUrl [:pick $rest 0 $p2]
:local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
:if (([:len $loginUrl] > 0) && ([:len $dnsName] > 0)) do={
:local hsprof [/ip hotspot profile find where name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={ :log warning "NAVSPOT: falha login-url" }
:do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={ :log warning "NAVSPOT: falha dns-name" }
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:log info ("NAVSPOT: Profile config OK - " . $dnsName)
:set processedCount ($processedCount + 1)
}
}
}
} on-error={ :log warning "NAVSPOT: Erro configure_hotspot_profile" }
}
:if ($cmd = "create_profile") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local pName [:pick $rest 0 $p2]
:if ([:len $pName] > 0) do={
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={
:set pShared [:pick $sub2 0 $p4]
} else={
:set pShared $sub2
}
} else={
:set pRate $sub
}
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
:if ([:len $pRate] > 0) do={
:do { /ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared } on-error={}
} else={
:do { /ip hotspot user profile add name=$pName shared-users=$pShared } on-error={}
}
:log info ("NAVSPOT: Perfil criado - " . $pName)
:set processedCount ($processedCount + 1)
} else={
:if ([:len $pRate] > 0) do={
:do { /ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared } on-error={}
} else={
:do { /ip hotspot user profile set $existing shared-users=$pShared } on-error={}
}
}
}
}
} on-error={ :log warning "NAVSPOT: Erro create_profile" }
}
:if ($cmd = "create_user") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local uName [:pick $rest 0 $p2]
:if ([:len $uName] > 0) do={
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local uPass ""
:local uProf "default"
:if ($p3 >= 0) do={
:set uPass [:pick $sub 0 $p3]
:set uProf [:pick $sub ($p3 + 1) [:len $sub]]
} else={
:set uPass $sub
}
:if ([:len $uProf] = 0) do={ :set uProf "default" }
:local profExists [/ip hotspot user profile find name=$uProf]
:if ([:len $profExists] = 0) do={
:do { /ip hotspot user profile add name=$uProf } on-error={}
}
:local existing [/ip hotspot user find name=$uName]
:if ([:len $existing] = 0) do={
:if ([:len $uPass] > 0) do={
:do { /ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync" } on-error={}
:log info ("NAVSPOT: Usuario criado - " . $uName)
:set processedCount ($processedCount + 1)
} else={
:log warning ("NAVSPOT: Usuario sem senha, ignorando - " . $uName)
}
} else={
:if ([:len $uPass] > 0) do={
:do { /ip hotspot user set $existing password=$uPass profile=$uProf } on-error={}
} else={
:do { /ip hotspot user set $existing profile=$uProf } on-error={}
}
}
}
}
} on-error={ :log warning "NAVSPOT: Erro create_user" }
}
:if ($cmd = "remove_user") do={
:do {
:if ([:len $rest] > 0) do={
:local existing [/ip hotspot user find name=$rest]
:if ([:len $existing] > 0) do={
:do { /ip hotspot user remove $existing } on-error={}
:log info ("NAVSPOT: Usuario removido - " . $rest)
:set processedCount ($processedCount + 1)
}
}
} on-error={ :log warning "NAVSPOT: Erro remove_user" }
}
}
}
}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - " . $processedCount . " acoes")`
}

/**
 * v7.1.22: Action Processor AUX (~2KB)
 * Contains secondary handlers for optional functionality:
 * - create_whitelist_domain (walled garden allow)
 * - create_blacklist_domain (walled garden deny)
 * - disable_user / enable_user
 * - kick_session
 * - update_password
 */
function generateActionAuxSource(): string {
  return `:log info "NAVSPOT-ACTION-AUX v${VERSION}: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :log info "NAVSPOT-ACTION-AUX: lock ativo"; :return }
:set navspotLock "1"
:local fid [/file find where name="navspot-actions-aux.txt"]
:if ([:len $fid] = 0) do={
:set navspotLock "0"
:log info "NAVSPOT-ACTION-AUX: Arquivo nao encontrado"
:return
}
:local rawData ""
:do { :set rawData [/file get $fid contents] } on-error={}
:do { /file remove $fid } on-error={}
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:return
}
:local pos 0
:local cnt 0
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:if ([:len $line] > 0) do={
:local p1 [:find $line "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $line 0 $p1]
:local rest [:pick $line ($p1 + 1) [:len $line]]
:if ($cmd = "create_whitelist_domain") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:local dstHost ("*" . $domain . "*")
:do { /ip hotspot walled-garden add dst-host=$dstHost action=allow comment="navspot-whitelist" } on-error={}
:log info ("NAVSPOT-AUX: Whitelist - " . $domain)
:set cnt ($cnt + 1)
}
}
} on-error={}
}
:if ($cmd = "create_blacklist_domain") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:local dstHost ("*" . $domain . "*")
:do { /ip hotspot walled-garden add dst-host=$dstHost action=deny comment="navspot-blacklist" } on-error={}
:log info ("NAVSPOT-AUX: Blacklist - " . $domain)
:set cnt ($cnt + 1)
}
}
} on-error={}
}
:if ($cmd = "disable_user") do={
:do {
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
:set cnt ($cnt + 1)
}
} on-error={}
}
:if ($cmd = "enable_user") do={
:do {
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
:set cnt ($cnt + 1)
}
} on-error={}
}
:if ($cmd = "kick_session") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $kMac] > 0) do={
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
:set cnt ($cnt + 1)
}
}
} on-error={}
}
:if ($cmd = "update_password") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local uName [:pick $rest 0 $p2]
:local uPass [:pick $rest ($p2 + 1) [:len $rest]]
:if (([:len $uName] > 0) && ([:len $uPass] > 0)) do={
:do { /ip hotspot user set [find name=$uName] password=$uPass } on-error={}
:set cnt ($cnt + 1)
}
}
} on-error={}
}
}
}
}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION-AUX v${VERSION}: OK - " . $cnt)`
}

function generateGuardianSource(recoveryUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-GUARDIAN v${VERSION}: Verificando integridade..."
:local needsRepair 0
:local missing ""
:local syncScript [/system script find where name="navspot-sync"]
:local apScript [/system script find where name="navspot-action-processor"]
:local syncSched [/system scheduler find where name="navspot-sync-scheduler"]
:if ([:len $syncScript] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-sync ")
}
:if ([:len $apScript] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-action-processor ")
}
:if ([:len $syncSched] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-sync-scheduler ")
}
:local hsprof [/ip hotspot profile find where name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof] > 0) do={
:set loginUrl [/ip hotspot profile get $hsprof login-url]
}
:if ([:len $loginUrl] < 10) do={
:set needsRepair 1
:set missing ($missing . "login-url-incomplete ")
:log warning "NAVSPOT-GUARDIAN v${VERSION}: login-url incompleta - forcando sync"
}
:if (($needsRepair = 0) && ([:len $apScript] > 0)) do={
:local apSource [/system script get $apScript source]
:if ([:find $apSource "configure_hotspot_profile"] < 0) do={
:set needsRepair 1
:set missing ($missing . "action-processor-outdated ")
:log warning "NAVSPOT-GUARDIAN: action-processor sem configure_hotspot_profile"
}
}
:if ($needsRepair = 1) do={
:log warning ("NAVSPOT-GUARDIAN: Componentes faltando: " . $missing)
:global navspotLastRepair
:local now [/system clock get time]
:local canRepair 1
:if ($canRepair = 1) do={
:log info "NAVSPOT-GUARDIAN: Iniciando reparo automatico..."
:do {
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
:set token "${syncToken}"
:log warning "NAVSPOT-GUARDIAN: Usando token fallback embutido"
}
:local recoveryUrl "${recoveryUrl}"
:local body ("{\\"sync_token\\":\\"" . $token . "\\"}")
/tool fetch url=$recoveryUrl mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-recovery.rsc"
:delay 3s
:local recoveryFile [/file find name~"navspot-recovery.rsc"]
:if ([:len $recoveryFile] > 0) do={
/import navspot-recovery.rsc
:set navspotLastRepair $now
:log info "NAVSPOT-GUARDIAN: Reparo concluido com sucesso!"
:do { /file remove "navspot-recovery.rsc" } on-error={}
} else={
:log warning "NAVSPOT-GUARDIAN: Falha ao baixar recovery"
}
} on-error={ :log error "NAVSPOT-GUARDIAN: Erro no reparo automatico" }
}
} else={
:log info "NAVSPOT-GUARDIAN v${VERSION}: Sistema integro"
}`
}
