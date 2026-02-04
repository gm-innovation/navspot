import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-scripts v7.1.2
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
 * v7.1.2: Cascading fetch - installer downloads each script as .txt file
 *         and injects via [/file get ... contents] to bypass parser limits
 * 
 * Returns: text/plain RSC script that can be imported directly
 */

const VERSION = "7.1.4"
const DEPLOYED_AT = new Date().toISOString()

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
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
      // v7.1.2: New source-only types for cascading fetch
      case 'sync-source':
        script = generateSyncSource(syncUrl, syncToken)
        break
      case 'action-source':
        script = generateActionProcessorSource()
        break
      case 'guardian-source':
        script = generateGuardianSource(recoveryUrl, syncToken)
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
 * v7.1.2: Generate lightweight installer that uses cascading fetch
 * Downloads each script as .txt and injects via [/file get ... contents]
 * This bypasses RouterOS 6.x parser limitations with long source={} blocks
 */
function generateAllScripts(
  supabaseUrl: string,
  syncToken: string,
  syncIntervalMinutes: number
): string {
  // Build API base URL (split to stay under 160 char limit)
  const apiBase = `${supabaseUrl}/functions/v1`
  
  return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# Cascading Fetch - bypasses parser limits
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

# ===== 1. SYNC SCRIPT =====
:log info "NAVSPOT-SCRIPTS: Baixando sync..."
:local syncUrl ($apiBase . $ep . "?type=sync-source&token=" . $tk)
:local syncOk false
:local syncRetry 0
:while (($syncRetry < 3) && ($syncOk = false)) do={
:set syncRetry ($syncRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $syncRetry . "/3")
:do {
/tool fetch url=$syncUrl check-certificate=no dst-path="ns-sync.txt"
:set syncOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: sync fetch tentativa " . $syncRetry . " falhou")
:delay 5s
}
}
:if ($syncOk = true) do={
:delay 2s
:local fid [/file find name="ns-sync.txt"]
:if ([:len $fid] > 0) do={
:local fsize [/file get $fid size]
:do { /system script remove [find name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source=""
:local src [/file get "ns-sync.txt" contents]
/system script set [find name="navspot-sync"] source=$src
:do { /file remove "ns-sync.txt" } on-error={}
:log info ("NAVSPOT-SCRIPTS: Sync instalado (size=" . $fsize . ")")
} else={
:log error "NAVSPOT-SCRIPTS: Arquivo ns-sync.txt nao encontrado"
}
} else={
:log error "NAVSPOT-SCRIPTS: Sync fetch falhou apos 3 tentativas"
}

# ===== 2. ACTION PROCESSOR =====
:log info "NAVSPOT-SCRIPTS: Baixando action-processor..."
:local actionUrl ($apiBase . $ep . "?type=action-source&token=" . $tk)
:local actionOk false
:local actionRetry 0
:while (($actionRetry < 3) && ($actionOk = false)) do={
:set actionRetry ($actionRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $actionRetry . "/3")
:do {
/tool fetch url=$actionUrl check-certificate=no dst-path="ns-action.txt"
:set actionOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: action fetch tentativa " . $actionRetry . " falhou")
:delay 5s
}
}
:if ($actionOk = true) do={
:delay 2s
:local fid [/file find name="ns-action.txt"]
:if ([:len $fid] > 0) do={
:local fsize [/file get $fid size]
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source=""
:local src [/file get "ns-action.txt" contents]
/system script set [find name="navspot-action-processor"] source=$src
:do { /file remove "ns-action.txt" } on-error={}
:log info ("NAVSPOT-SCRIPTS: Action-processor instalado (size=" . $fsize . ")")
} else={
:log error "NAVSPOT-SCRIPTS: Arquivo ns-action.txt nao encontrado"
}
} else={
:log error "NAVSPOT-SCRIPTS: Action fetch falhou apos 3 tentativas"
}

# ===== 3. GUARDIAN =====
:log info "NAVSPOT-SCRIPTS: Baixando guardian..."
:local guardUrl ($apiBase . $ep . "?type=guardian-source&token=" . $tk)
:local guardOk false
:local guardRetry 0
:while (($guardRetry < 3) && ($guardOk = false)) do={
:set guardRetry ($guardRetry + 1)
:log info ("NAVSPOT-SCRIPTS: Tentativa " . $guardRetry . "/3")
:do {
/tool fetch url=$guardUrl check-certificate=no dst-path="ns-guard.txt"
:set guardOk true
} on-error={
:log warning ("NAVSPOT-SCRIPTS: guardian fetch tentativa " . $guardRetry . " falhou")
:delay 5s
}
}
:if ($guardOk = true) do={
:delay 2s
:local fid [/file find name="ns-guard.txt"]
:if ([:len $fid] > 0) do={
:local fsize [/file get $fid size]
:do { /system script remove [find name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source=""
:local src [/file get "ns-guard.txt" contents]
/system script set [find name="navspot-guardian"] source=$src
:do { /file remove "ns-guard.txt" } on-error={}
:log info ("NAVSPOT-SCRIPTS: Guardian instalado (size=" . $fsize . ")")
} else={
:log error "NAVSPOT-SCRIPTS: Arquivo ns-guard.txt nao encontrado"
}
} else={
:log error "NAVSPOT-SCRIPTS: Guardian fetch falhou apos 3 tentativas"
}

# ===== 4. SCHEDULERS =====
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $syncSched] > 0) do={
/system scheduler set $syncSched interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" disabled=no
:log info "NAVSPOT-SCRIPTS: Scheduler sync atualizado"
} else={
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-SCRIPTS: Scheduler sync criado"
}

:local guardSched [/system scheduler find name="navspot-guardian-scheduler"]
:if ([:len $guardSched] > 0) do={
/system scheduler set $guardSched interval=10m on-event="/system script run navspot-guardian" disabled=no
:log info "NAVSPOT-SCRIPTS: Scheduler guardian atualizado"
} else={
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT-SCRIPTS: Scheduler guardian criado"
}

# ===== 5. NETWATCH =====
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
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
 */
function generateSyncScript(syncUrl: string, syncToken: string): string {
  return `# NAVSPOT Sync Script v${VERSION}
:do { /system script remove [find name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source={
${generateSyncSource(syncUrl, syncToken)}
}
:log info "NAVSPOT: Script sync v${VERSION} instalado"
`
}

/**
 * Generate individual action-processor script RSC (legacy - with wrapper)
 */
function generateActionProcessorScript(): string {
  return `# NAVSPOT Action Processor v${VERSION}
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source={
${generateActionProcessorSource()}
}
:log info "NAVSPOT: Script action-processor v${VERSION} instalado"
`
}

/**
 * Generate individual guardian script RSC (legacy - with wrapper)
 */
function generateGuardianScript(recoveryUrl: string, syncToken: string): string {
  return `# NAVSPOT Guardian Script v${VERSION}
:do { /system script remove [find name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source={
${generateGuardianSource(recoveryUrl, syncToken)}
}
:log info "NAVSPOT: Script guardian v${VERSION} instalado"
`
}

// ==========================================
// SCRIPT SOURCES (RouterOS code - pure, no wrapper)
// These are returned directly for *-source types
// ==========================================

function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:local token ""
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
:do {
/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field=$hdr dst-path="navspot-resp.txt"
:delay 500ms
:local resp [/file get "navspot-resp.txt" contents]
:do { /file remove "navspot-resp.txt" } on-error={}
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={:set j ($j - 1)}
:local actions ""
:if ($j >= $i) do={:set actions [:pick $raw $i ($j + 1)]}
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
# v7.1.4: Usar arquivo ao inves de variavel global (evita race condition RouterOS 6.x)
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 500ms
/file set [find name="navspot-actions.txt"] contents=$actions
:log info ("NAVSPOT-SYNC: Acoes salvas em arquivo, acionando action-processor...")
:delay 500ms
/system script run navspot-action-processor
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`
}

function generateActionProcessorSource(): string {
  return `:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
# v7.1.4: Ler acoes de arquivo ao inves de variavel global (evita race condition)
:local actionsFile [/file find name="navspot-actions.txt"]
:if ([:len $actionsFile] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Arquivo navspot-actions.txt NAO encontrado"
:return
}
:local rawData [/file get "navspot-actions.txt" contents]
:log info ("NAVSPOT-ACTION: Acoes lidas do arquivo, len=" . [:len $rawData])
:do { /file remove "navspot-actions.txt" } on-error={}
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Arquivo vazio - nada a processar"
:return
}
:log info ("NAVSPOT-ACTION v${VERSION}: Iniciando - " . $rawData)
:local pos 0
:do {
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:local i 0
:local j ([:len $line] - 1)
:while (($i <= $j) && ([:pick $line $i] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $line $j] = " ")) do={:set j ($j - 1)}
:if ($j < $i) do={:set pos ($endPos + 1)}
:local trimmed [:pick $line $i ($j + 1)]
:local p1 [:find $trimmed "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $trimmed 0 $p1]
:local rest [:pick $trimmed ($p1 + 1) [:len $trimmed]]
# v7.1: configure_hotspot_profile - Configura profile via sync (runtime)
:if ($cmd = "configure_hotspot_profile") do={
:local p2 [:find $rest "|"]
:local loginUrl [:pick $rest 0 $p2]
:local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
:do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
:log info ("NAVSPOT v${VERSION}: Hotspot profile configurado via sync - " . $dnsName)
} else={
:log error "NAVSPOT: Hotspot profile hsprof-navspot NAO ENCONTRADO"
}
}
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
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
:if ([:len $pName] = 0) do={
:log warning "NAVSPOT: create_profile sem nome, ignorando"
} else={
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile add name=$pName shared-users=$pShared
}
:log info ("NAVSPOT: Perfil criado - " . $pName)
} else={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile set $existing shared-users=$pShared
}
:log info ("NAVSPOT: Perfil atualizado - " . $pName)
}
}
}
:if ($cmd = "create_user") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local uPass [:pick $sub 0 $p3]
:local uProf [:pick $sub ($p3 + 1) [:len $sub]]
:if ([:len $uName] = 0) do={
:log warning "NAVSPOT: create_user sem nome, ignorando"
} else={
:local profExists [/ip hotspot user profile find name=$uProf]
:if ([:len $profExists] = 0) do={
:log warning ("NAVSPOT: Perfil " . $uProf . " nao existe. Criando...")
/ip hotspot user profile add name=$uProf
}
:local existing [/ip hotspot user find name=$uName]
:if ([:len $existing] = 0) do={
/ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
:log info ("NAVSPOT: Usuario criado - " . $uName)
} else={
/ip hotspot user set $existing password=$uPass profile=$uProf
:log info ("NAVSPOT: Usuario atualizado - " . $uName)
}
}
}
:if ($cmd = "remove_user") do={
:if ([:len $rest] > 0) do={
:local existing [/ip hotspot user find name=$rest]
:if ([:len $existing] > 0) do={
/ip hotspot user remove $existing
:log info ("NAVSPOT: Usuario removido - " . $rest)
}
}
}
:if ($cmd = "disable_user") do={
:do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
:log info ("NAVSPOT: Usuario desabilitado - " . $rest)
}
:if ($cmd = "enable_user") do={
:do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
:log info ("NAVSPOT: Usuario habilitado - " . $rest)
}
:if ($cmd = "kick_session") do={
:local p2 [:find $rest "|"]
:local kUser [:pick $rest 0 $p2]
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
:log info ("NAVSPOT: Sessao encerrada - " . $kUser . "/" . $kMac)
}
:if ($cmd = "update_password") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local uPass [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot user set [find name=$uName] password=$uPass } on-error={}
:log info ("NAVSPOT: Senha atualizada - " . $uName)
}
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName) } on-error={}
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
}
}
:if ($cmd = "add_firewall_block") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=none comment=("navspot-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall block - " . $domain . " -> " . $resolvedIp)
}
} on-error={:log warning ("NAVSPOT: Failed to resolve " . $domain)}
}
}
:if ($cmd = "add_firewall_allow") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
}
}
:if ($cmd = "update_profile_quota") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local quota [:pick $rest ($p2 + 1) [:len $rest]]
:local quotaBytes ($quota * 1024 * 1024)
:foreach uId in=[/ip hotspot user find where profile=$pName] do={
:do { /ip hotspot user set $uId limit-bytes-total=$quotaBytes } on-error={}
}
:log info ("NAVSPOT: Quota aplicada - " . $pName . " = " . $quota . " MB")
}
}
}
} on-error={
:log warning "NAVSPOT-ACTION: Erro no processamento"
:set navspotLock "0"
:return
}
:set navspotActions ""
:set navspotLock "0"
:log info "NAVSPOT-ACTION v${VERSION}: Processamento concluido"`
}

function generateGuardianSource(recoveryUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-GUARDIAN v${VERSION}: Verificando integridade..."
:local needsRepair 0
:local missing ""
:local syncScript [/system script find name="navspot-sync"]
:local apScript [/system script find name="navspot-action-processor"]
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
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
# v7.1: Verificar se login-url esta configurada
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof] > 0) do={
:set loginUrl [/ip hotspot profile get $hsprof login-url]
}
:if ([:len $loginUrl] < 10) do={
:set needsRepair 1
:set missing ($missing . "login-url-incomplete ")
:log warning "NAVSPOT-GUARDIAN v${VERSION}: login-url incompleta - forcando sync"
}
# v7.1: Check version marker
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
} on-error={:log error "NAVSPOT-GUARDIAN: Erro no reparo automatico"}
}
} else={
:log info "NAVSPOT-GUARDIAN v${VERSION}: Sistema integro"
}`
}
