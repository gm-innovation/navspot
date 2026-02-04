import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-recovery-download v7.0.0
 * 
 * Minimal recovery endpoint for MikroTik self-healing.
 * v7.0: Returns a clean .rsc script that recreates scripts/schedulers.
 *       NO login-url in recovery - it comes via sync API.
 *       CRITICAL: Resets initial_config_sent=false to force re-configuration.
 * 
 * Called by navspot-guardian when it detects missing components.
 * Also called by authenticated users from admin panel to download recovery scripts.
 */

const VERSION = "7.0.0"
const DEPLOYED_AT = new Date().toISOString()

// Normalizar newlines
function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Validação de balanceamento
function validateBalance(script: string): void {
  const openBraces = (script.match(/{/g) || []).length;
  const closeBraces = (script.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    throw new Error(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  }
  const quotes = (script.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    throw new Error(`Unbalanced quotes: ${quotes} (odd number)`);
  }
}

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * Validate RouterOS script - v7.0 simplified
 */
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets in conditional)' },
    { regex: /comment~"/, desc: 'comment~ (must use comment= for exact match)' },
    // v7.0: No login-url with runtime vars allowed in recovery
    { regex: /login-url=.*\$\(/, desc: 'login-url with $(var) - must come via sync API' },
    { regex: /^:local\s+_/m, desc: 'Local var starts with underscore' },
    { regex: /^(?!\s*#).{161,}$/m, desc: 'Line >160 chars' },
  ]
  
  for (const { regex, desc } of forbiddenPatterns) {
    if (regex.test(script)) {
      console.error(`[${context} ${VERSION}] VALIDATION FAILED: ${desc}`)
      throw new Error(`Script validation failed: contains ${desc}`)
    }
  }
  console.log(`[${context} ${VERSION}] Script validation passed`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let syncToken: string | null = null
    let hotspotId: string | null = null

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncToken = body.sync_token || null
        hotspotId = body.hotspot_id || null
      } catch {
        console.error(`[mikrotik-recovery-download ${VERSION}] Invalid JSON body`)
        return new Response(
          'Invalid JSON body',
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      syncToken = url.searchParams.get('sync_token')
      hotspotId = url.searchParams.get('hotspot_id')
    } else {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    // Handle hotspot_id with JWT authentication
    if (hotspotId) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          'Authorization required when using hotspot_id',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )

      const token = authHeader.replace('Bearer ', '')
      const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token)

      if (claimsError || !claims?.claims) {
        return new Response('Invalid token', { status: 401, headers: corsHeaders })
      }

      const userId = claims.claims.sub as string
      console.log(`[mikrotik-recovery-download ${VERSION}] User: ${userId} requesting hotspot: ${hotspotId}`)

      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, empresa_id, embarcacao_id')
        .eq('user_id', userId)
        .single()

      if (roleError || !userRole) {
        return new Response('User role not found', { status: 403, headers: corsHeaders })
      }

      const { data: hotspot, error: hotspotError } = await supabase
        .from('hotspots')
        .select(`id, nome, sync_token, sync_interval_minutes, embarcacoes!inner(id, nome, empresa_id)`)
        .eq('id', hotspotId)
        .single()

      if (hotspotError || !hotspot) {
        return new Response('Hotspot not found', { status: 404, headers: corsHeaders })
      }

      const embarcacao = hotspot.embarcacoes as unknown as { id: string; empresa_id: string }

      // Permission check
      if (userRole.role === 'super_admin') {
        // OK
      } else if (userRole.role === 'empresa_admin') {
        if (embarcacao.empresa_id !== userRole.empresa_id) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else if (userRole.role === 'gerente_embarcacao') {
        const { data: access } = await supabase
          .from('gerente_embarcacoes')
          .select('embarcacao_id')
          .eq('user_id', userId)
          .eq('embarcacao_id', embarcacao.id)
          .maybeSingle()

        if (!access) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else {
        return new Response('Access denied', { status: 403, headers: corsHeaders })
      }

      syncToken = hotspot.sync_token
    }

    if (!syncToken) {
      return new Response(
        'sync_token or hotspot_id is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery for token: ${maskToken(syncToken)}`)

    // Find hotspot
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`id, nome, sync_token, sync_interval_minutes, embarcacoes!inner(id, nome, empresa_id)`)
      .eq('sync_token', syncToken)
      .single()

    if (hotspotError || !hotspot) {
      return new Response('Invalid sync_token', { status: 404, headers: corsHeaders })
    }

    // v7.0 CRITICAL: Reset initial_config_sent to force re-configuration
    const { error: resetError } = await supabase
      .from('hotspots')
      .update({ initial_config_sent: false })
      .eq('id', hotspot.id)

    if (resetError) {
      console.error(`[mikrotik-recovery-download ${VERSION}] Failed to reset initial_config_sent:`, resetError)
    } else {
      console.log(`[mikrotik-recovery-download ${VERSION}] Reset initial_config_sent=false for ${hotspot.nome}`)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const syncIntervalMinutes = hotspot.sync_interval_minutes || 5

    console.log(`[mikrotik-recovery-download ${VERSION}] Generating recovery for: ${hotspot.nome}`)

    let recoveryScript = generateRecoveryScript(syncUrl, syncIntervalMinutes, syncToken)
    recoveryScript = normalizeNewlines(recoveryScript)
    validateBalance(recoveryScript)
    validateRouterOSScript(recoveryScript, 'mikrotik-recovery-download')

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery generated (${recoveryScript.length} bytes)`)

    return new Response(recoveryScript, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="navspot-recovery-v${VERSION}.rsc"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })

  } catch (error) {
    console.error(`[mikrotik-recovery-download ${VERSION}] Error:`, error)
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

function generateRecoveryScript(syncUrl: string, syncIntervalMinutes: number, syncToken: string): string {
  // v7.0: Sync script com token fallback
  const syncScriptSource = `:local token ""
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
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:delay 250ms
/system script run navspot-action-processor
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`

  // v7.0: Action processor com handler configure_hotspot_profile
  const actionProcessorSource = `:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
:local rawData $navspotActions
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log info "NAVSPOT: Sem acoes pendentes"
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
# v7.0: configure_hotspot_profile - Configura profile via sync
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
:log info ("NAVSPOT v7.0: Hotspot profile configurado via sync - " . $dnsName)
} else={
:log error "NAVSPOT: hsprof-navspot NAO ENCONTRADO"
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
:set pShared [:pick $sub ($p3 + 1) [:len $sub]]
} else={
:set pRate $sub
}
:if ([:len $pName] > 0) do={
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile add name=$pName shared-users=$pShared
}
:log info ("NAVSPOT: Perfil criado - " . $pName)
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
:if ([:len $uName] > 0) do={
:local existing [/ip hotspot user find name=$uName]
:if ([:len $existing] = 0) do={
/ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
:log info ("NAVSPOT: Usuario criado - " . $uName)
} else={
/ip hotspot user set $existing password=$uPass profile=$uProf
}
}
}
:if ($cmd = "remove_user") do={
:local existing [/ip hotspot user find name=$rest]
:if ([:len $existing] > 0) do={
/ip hotspot user remove $existing
:log info ("NAVSPOT: Usuario removido - " . $rest)
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
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
:log info ("NAVSPOT: Sessao encerrada - " . $kMac)
}
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist - " . $domain)
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName) } on-error={}
:log info ("NAVSPOT: Blacklist - " . $domain)
}
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

  // v7.0: Recovery MÍNIMO - sem login-url (vem via sync)
  return `# =========================================
# NAVSPOT Recovery Script v${VERSION}
# Recreates scripts/schedulers. Config comes via sync API.
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-RECOVERY v${VERSION}: Iniciando reparacao..."

# 0. TOKEN
:log info "NAVSPOT-RECOVERY: Recriando token..."
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="${syncToken}"
:log info "NAVSPOT-RECOVERY: Token recriado"

# 1. ACTION PROCESSOR v7.0
:local apExists [/system script find name="navspot-action-processor"]
:if ([:len $apExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando action-processor v${VERSION}..."
/system script set $apExists policy=read,write,test source={
${actionProcessorSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando action-processor v${VERSION}..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
}
:delay 200ms

# 2. SYNC SCRIPT (token fallback embutido)
:local syncExists [/system script find name="navspot-sync"]
:if ([:len $syncExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando sync v${VERSION}..."
/system script set $syncExists policy=read,write,test source={
${syncScriptSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando sync v${VERSION}..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
}
:delay 200ms

# 3. SCHEDULER
:local schedExists [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $schedExists] > 0) do={
/system scheduler set $schedExists interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" disabled=no
} else={
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
}
:log info "NAVSPOT-RECOVERY: Scheduler configurado"

# 4. NETWATCH
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT-RECOVERY: Netwatch configurado"

# 5. EXECUTAR SYNC para receber configuracao
:log info "NAVSPOT-RECOVERY v${VERSION}: Executando sync para receber config..."
:delay 2s
/system script run navspot-sync

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v${VERSION}: REPARACAO CONCLUIDA!"
:log info "Arquitetura v7.0: Config via sync API"
:log info "NOTE: initial_config_sent resetado no servidor"
:log info "NOTE: Sync ira injetar login-url + walled-garden"
:log info "=========================================="
`
}
