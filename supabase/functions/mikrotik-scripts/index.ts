import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.1.14
 * 
 * Serves individual RouterOS scripts as pure RSC files.
 * This endpoint is called by the bootstrap via /tool fetch to download
 * scripts AFTER the basic infrastructure is configured.
 * 
 * Parameters:
 *   - type: "sync" | "action-processor" | "guardian" | "all" | 
 *           "sync-source" | "action-source" | "guardian-source" (default: "all")
 *   - token: sync_token for authentication
 * 
 * v7.1.14: CRITICAL FIX for RouterOS 6.x /import line length limit
 *   - Long source="..." strings now use line continuation with \
 *   - Improved sync logging (shows response prefix on invalid responses)
 *   - Standardized find where name="..." syntax
 *   - Validates RSC line lengths after generation
 * 
 * v7.1.13: CRITICAL FIX for RouterOS 6.x strict syntax
 *   - All / commands inside do={} wrapped with :do { } on-error={}
 *   - Removed problematic ~ (regex) operator in walled-garden find
 *   - Variables used directly without ("" . $var) wrapper
 *   - navspotLock released in all error paths
 * 
 * Returns: text/plain RSC script that can be imported directly
 */

const VERSION = "7.1.14"
const DEPLOYED_AT = new Date().toISOString()

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * Escape script source for embedding in source="..." block
 * RouterOS requires:
 * - Escaping " and $ inside source="" quoted strings
 * - Converting newlines to \r\n for multiline content in .rsc files
 * 
 * v7.1.9: CRITICAL - Convert newlines to \r\n for RouterOS 6.x /import compatibility
 *   RouterOS 6.x does NOT accept literal newlines inside source="..." in .rsc files
 *   The parser interprets each line as a separate command, breaking syntax
 * 
 * Escaping rules for source="...":
 * - Backslashes: \ -> \\
 * - Double quotes: " -> \"
 * - Dollar signs (local vars): $ -> \$
 * - CRLF: \r\n -> \\r\\n
 * - LF: \n -> \\r\\n
 * - Runtime vars $(...): preserved unescaped
 */
function escapeForSourceQuotes(script: string): string {
  // Preserve runtime vars $(...) BEFORE escaping
  const preserved = script.replace(/\$\(/g, '@@RUNTIME_VAR@@')
  
  const escaped = preserved
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')        // Escape double quotes
    .replace(/\$/g, '\\$')       // Escape dollar signs (local vars)
    .replace(/\r\n/g, '\\r\\n')  // Convert CRLF to escaped \r\n
    .replace(/\n/g, '\\r\\n')    // Convert LF to escaped \r\n
  
  // Restore runtime vars (unescaped)
  return escaped.replace(/@@RUNTIME_VAR@@/g, '$(')
}

/**
 * v7.1.14: Wrap a RouterOS source string with line continuation for long content
 * 
 * RouterOS supports \ at end of line (inside quotes) for multi-line strings,
 * exactly like /export generates. This bypasses the ~4KB per-line/command limit
 * in RouterOS 6.x /import parser that was causing scripts to be truncated.
 * 
 * Max chunk ~120 chars to stay safely under 160 char line limit after prefixes.
 * 
 * @param escapedSource - Already escaped source string (from escapeForSourceQuotes)
 * @param maxChunk - Maximum characters per chunk (default 120)
 * @returns Quoted string with line continuation: "chunk1\
 *          chunk2\
 *          chunk3"
 */
function wrapSourceWithContinuation(escapedSource: string, maxChunk = 120): string {
  // Short strings don't need continuation
  if (escapedSource.length <= maxChunk) {
    return `"${escapedSource}"`
  }
  
  const chunks: string[] = []
  let remaining = escapedSource
  
  while (remaining.length > 0) {
    let chunkSize = Math.min(maxChunk, remaining.length)
    
    // Don't break on a backslash (would create \\\ at line end, confusing the parser)
    while (chunkSize > 1 && remaining[chunkSize - 1] === '\\') {
      chunkSize--
    }
    
    const chunk = remaining.substring(0, chunkSize)
    remaining = remaining.substring(chunkSize)
    chunks.push(chunk)
  }
  
  // Single chunk after processing (edge case)
  if (chunks.length === 1) {
    return `"${chunks[0]}"`
  }
  
  // Join with \ continuation: "chunk1\
  // chunk2\
  // chunk3"
  // The \ at end of each line (except last) tells RouterOS to continue
  return '"' + chunks.slice(0, -1).map(c => c + '\\').join('\n') + '\n' + chunks[chunks.length - 1] + '"'
}

/**
 * v7.1.14: Validate generated RSC doesn't have lines exceeding RouterOS limits
 * Logs warnings for any problematic lines (useful for debugging)
 */
function validateRSCLineLength(rsc: string, context: string, maxLength = 160): void {
  const lines = rsc.split('\n')
  let hasWarning = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip comment lines and continuation lines (they're part of quoted string)
    if (line.length > maxLength && !line.trim().startsWith('#')) {
      // Check if it's a continuation line (ends with \ or is inside quoted string)
      if (!line.endsWith('\\') && !line.endsWith('"')) {
        console.warn(`[mikrotik-scripts ${VERSION}] ${context} line ${i+1} exceeds ${maxLength} chars: ${line.length} chars`)
        hasWarning = true
      }
    }
  }
  if (!hasWarning) {
    console.log(`[mikrotik-scripts ${VERSION}] ${context} RSC validation passed`)
  }
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

    switch (scriptType) {
      case 'sync':
        script = generateSyncScript(syncUrl, syncToken)
        break
      case 'action-processor':
        script = generateActionProcessorScript()
        break
      case 'guardian':
        script = generateGuardianScript(recoveryUrl, syncToken)
        break
      // v7.1.8: RSC with source="..." wrapper for /import
      case 'sync-source':
        script = generateSyncRSC(syncUrl, syncToken)
        break
      case 'action-source':
        script = generateActionProcessorRSC()
        break
      case 'guardian-source':
        script = generateGuardianRSC(recoveryUrl, syncToken)
        break
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
        'Content-Type': 'text/plain; charset=utf-8',
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
 * v7.1.10: Generate installer with idempotent schedulers (remove-then-add)
 * v7.1.6: Uses /import directly - bypasses RouterOS 6.x 4KB variable limit
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number
): string {
  const apiBase = `${supabaseUrl}/functions/v1`
  
  return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# Direct Import - bypasses 4KB var limit
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-SCRIPTS v${VERSION}: Iniciando instalacao..."

# URLs construidas incrementalmente (limite 160 chars)
:local apiBase "${apiBase}"
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"

# Pre-flight checks
:local hasRoute false
:do {
:local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
:if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = true) do={
:log info "NAVSPOT-SCRIPTS: Rota default OK"
} else={
:log warning "NAVSPOT-SCRIPTS: Rota default NAO encontrada"
}

# DNS check
:local dnsOk false
:do {
:resolve "google.com"
:set dnsOk true
} on-error={}
:if ($dnsOk = true) do={
:log info "NAVSPOT-SCRIPTS: DNS OK"
} else={
:log warning "NAVSPOT-SCRIPTS: DNS pode estar com problemas"
}

# ===== 1. SYNC SCRIPT (via /import direto) =====
:log info "NAVSPOT-SCRIPTS: Baixando sync..."
:local syncUrl ($apiBase . $ep . "?type=sync-source&token=" . $tk)
:local syncOk false
:local syncRetry 0
:while (($syncRetry < 3) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $syncRetry . "/3")
:do {
/tool fetch url=$syncUrl check-certificate=no dst-path="ns-sync.rsc"
:set syncOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: sync fetch tentativa " . $syncRetry . " falhou")
:delay 5s
}
}
:if ($syncOk = true) do={
:delay 2s
:do { /import ns-sync.rsc } on-error={ :log error "NAVSPOT-SCRIPTS: Falha ao importar sync" }
:do { /file remove "ns-sync.rsc" } on-error={}
} else={
:log error "NAVSPOT-SCRIPTS: Sync fetch falhou apos 3 tentativas"
}

# ===== 2. ACTION PROCESSOR (via /import direto) =====
:log info "NAVSPOT-SCRIPTS: Baixando action-processor..."
:local actionUrl ($apiBase . $ep . "?type=action-source&token=" . $tk)
:local actionOk false
:local actionRetry 0
:while (($actionRetry < 3) && ($actionOk = false)) do={
:set actionRetry ($actionRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $actionRetry . "/3")
:do {
/tool fetch url=$actionUrl check-certificate=no dst-path="ns-action.rsc"
:set actionOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: action fetch tentativa " . $actionRetry . " falhou")
:delay 5s
}
}
:if ($actionOk = true) do={
:delay 2s
:do { /import ns-action.rsc } on-error={ :log error "NAVSPOT-SCRIPTS: Falha ao importar action" }
:do { /file remove "ns-action.rsc" } on-error={}
} else={
:log error "NAVSPOT-SCRIPTS: Action fetch falhou apos 3 tentativas"
}

# ===== 3. GUARDIAN (via /import direto) =====
:log info "NAVSPOT-SCRIPTS: Baixando guardian..."
:local guardUrl ($apiBase . $ep . "?type=guardian-source&token=" . $tk)
:local guardOk false
:local guardRetry 0
:while (($guardRetry < 3) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $guardRetry . "/3")
:do {
/tool fetch url=$guardUrl check-certificate=no dst-path="ns-guard.rsc"
:set guardOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: guardian fetch tentativa " . $guardRetry . " falhou")
:delay 5s
}
}
:if ($guardOk = true) do={
:delay 2s
:do { /import ns-guard.rsc } on-error={ :log error "NAVSPOT-SCRIPTS: Falha ao importar guardian" }
:do { /file remove "ns-guard.rsc" } on-error={}
} else={
:log error "NAVSPOT-SCRIPTS: Guardian fetch falhou apos 3 tentativas"
}

# ===== 4. SCHEDULERS (idempotent remove-then-add) =====
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-SCRIPTS: Scheduler sync criado"

:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-SCRIPTS: Scheduler guardian criado"

# ===== 5. NETWATCH =====
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT-SCRIPTS: Netwatch configurado"

:log info "=========================================="
:log info "NAVSPOT-SCRIPTS v${VERSION}: INSTALACAO CONCLUIDA!"
:log info "Scripts: navspot-sync, navspot-action-processor, navspot-guardian"
:log info "Schedulers: sync a cada ${syncIntervalMinutes}m, guardian a cada 10m"
:log info "=========================================="

# ===== 6. PRIMEIRO SYNC =====
:log info "NAVSPOT-SCRIPTS: Executando primeiro sync..."
:delay 2s
/system script run navspot-sync
`
}

/**
 * Generate individual sync script RSC (legacy - with wrapper)
 * v7.1.14: Updated to use find where
 * v7.1.8: Uses source="..." instead of source={...}
 */
function generateSyncScript(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  return `# NAVSPOT Sync Script v${VERSION}
:do { /system script remove [find where name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Script sync v${VERSION} instalado"
`
}

/**
 * Generate individual action-processor script RSC (legacy - with wrapper)
 * v7.1.14: Updated to use find where and line continuation
 * v7.1.8: Uses source="..." instead of source={...}
 */
function generateActionProcessorScript(): string {
  const source = generateActionProcessorSource()
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  return `# NAVSPOT Action Processor v${VERSION}
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Script action-processor v${VERSION} instalado"
`
}

/**
 * Generate individual guardian script RSC (legacy - with wrapper)
 * v7.1.14: Updated to use find where and line continuation
 * v7.1.8: Uses source="..." instead of source={...}
 */
function generateGuardianScript(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  return `# NAVSPOT Guardian Script v${VERSION}
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Script guardian v${VERSION} instalado"
`
}

// ==========================================
// v7.1.8: RSC files with source="..." wrapper for /import
// RouterOS 6.x requires quoted strings, not curly braces
// ==========================================

/**
 * Generate sync RSC with source="..." wrapper for direct /import
 * v7.1.14: Uses line continuation for long source strings
 * v7.1.8: Uses source="..." syntax compatible with RouterOS 6.x /import
 */
function generateSyncRSC(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  
  const rsc = `# NAVSPOT Sync v${VERSION} - RSC for /import
:do { /system script remove [find where name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Sync v${VERSION} instalado"
`
  validateRSCLineLength(rsc, 'sync-source')
  return rsc
}

/**
 * Generate action-processor RSC with source="..." wrapper for direct /import
 * v7.1.14: Uses line continuation for long source strings (CRITICAL FIX)
 * v7.1.13: Fixed RouterOS 6.x syntax with proper command separation
 * v7.1.8: Uses source="..." syntax compatible with RouterOS 6.x /import
 * v7.1.6: MINIFIED to <4KB with essential handlers only
 */
function generateActionProcessorRSC(): string {
  const source = generateActionProcessorSource()
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  
  const rsc = `# NAVSPOT Action Processor v${VERSION} - RSC for /import
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Action-processor v${VERSION} instalado"
`
  validateRSCLineLength(rsc, 'action-source')
  return rsc
}

/**
 * Generate guardian RSC with source="..." wrapper for direct /import
 * v7.1.14: Uses line continuation for long source strings
 * v7.1.8: Uses source="..." syntax compatible with RouterOS 6.x /import
 */
function generateGuardianRSC(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  
  const rsc = `# NAVSPOT Guardian v${VERSION} - RSC for /import
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Guardian v${VERSION} instalado"
`
  validateRSCLineLength(rsc, 'guardian-source')
  return rsc
}

// ==========================================
// SCRIPT SOURCES (RouterOS code - pure, no wrapper)
// v7.1.10: All commands properly separated with ; and prefixed with :
// ==========================================

/**
 * v7.1.11: Sync source with concurrency lock to prevent parallel executions
 * - navspotSyncLock global to prevent scheduler + netwatch + manual conflicts
 * - check-certificate=no for SSL bypass
 * - Specific error messages for debugging
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
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 1s
:do { /file set [find where name="navspot-actions.txt"] contents=$actions } on-error={ :log error "NAVSPOT-SYNC: Falha ao salvar arquivo" }
:delay 500ms
:local fsize 0
:do { :set fsize [/file get [find where name="navspot-actions.txt"] size] } on-error={}
:log info ("NAVSPOT-SYNC: Arquivo salvo (size=" . $fsize . "), acionando action-processor...")
:do {
/system script run navspot-action-processor
:set syncOk true
} on-error={ :log error "NAVSPOT-SYNC: action-processor FALHOU na execucao" }
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
 * v7.1.13: Action Processor with STRICT RouterOS 6.x syntax
 * 
 * CRITICAL FIXES v7.1.13:
 * - All / commands wrapped in :do { } on-error={}
 * - Removed ~ (regex) operator from walled-garden find (causes parsing issues)
 * - Variables used directly (login-url=$loginUrl instead of ("" . $loginUrl))
 * - Each handler wrapped in :do { } on-error={} for isolation
 * - Lock released in all error paths
 * 
 * Essential handlers:
 * - configure_hotspot_profile
 * - create_profile / create_user / remove_user
 * - create_whitelist_domain / create_blacklist_domain (walled-garden)
 * - disable_user / enable_user / kick_session / update_password
 */
function generateActionProcessorSource(): string {
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
:set pShared [:pick $sub ($p3 + 1) [:len $sub]]
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
:if ($cmd = "create_whitelist_domain") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:local dstHost ("*" . $domain . "*")
:do { /ip hotspot walled-garden add dst-host=$dstHost action=allow comment="navspot-whitelist" } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
:set processedCount ($processedCount + 1)
}
}
} on-error={ :log warning "NAVSPOT: Erro create_whitelist_domain" }
}
:if ($cmd = "create_blacklist_domain") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:local dstHost ("*" . $domain . "*")
:do { /ip hotspot walled-garden add dst-host=$dstHost action=deny comment="navspot-blacklist" } on-error={}
:log info ("NAVSPOT: Blacklist adicionado - " . $domain)
:set processedCount ($processedCount + 1)
}
}
} on-error={ :log warning "NAVSPOT: Erro create_blacklist_domain" }
}
:if ($cmd = "disable_user") do={
:do {
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
}
} on-error={}
}
:if ($cmd = "enable_user") do={
:do {
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
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
}
}
} on-error={}
}
}
}
}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - " . $processedCount . " acoes")`
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
