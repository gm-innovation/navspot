import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-recovery-download v6.9.31
 * 
 * Minimal recovery endpoint for MikroTik self-healing.
 * Returns a .rsc script that recreates scripts/schedulers and verifies hotspot profile login-url.
 * 
 * v6.9.31: CRITICAL FIX - Replaced *.supabase.co/in wildcards with explicit backend hostname
 *          Wildcard patterns in walled-garden [find dst-host="*.supabase.co"] break RouterOS 6.x parser
 *          Now uses removal by comment ("navspot-api") and explicit host from SUPABASE_URL
 *          Token file now uses explicit .txt extension throughout
 * v6.9.30: Fixed local variable escaping ($hsprof not escaped, \$(mac) escaped)
 * v6.9.29: (broken) Over-escaped local variables causing parser errors
 * v6.9.28: Removed *.apple.com wildcard (breaks RouterOS 6.x /import)
 * v6.9.27: Eliminated ALL [:len [/... find ...]] patterns
 * v6.9.26: CRITICAL FIX - Removed AUTO-FIX firewall block completely
 * v6.9.25: CRITICAL FIX - RouterOS 6.x /import compatible syntax (partial fix)
 * v6.9.24: RouterOS 6.x compatible check (no -> operator)
 * v6.9.23: CRITICAL FIX - Whitelist firewall rules now scoped to hotspot=auth only
 * v6.9.22: Added essential Walled Garden recreation (portal, API, CDNs, CPD) + DNS TCP + ICMP
 * v6.9.21: Fixed firewall rule order (ACCEPT before DROP) + Walled Garden for whitelists + timeout=none
 * v6.9.20: Token fallback embutido nos scripts + suporte a hotspot_id autenticado
 * 
 * Called by navspot-guardian when it detects missing components or outdated scripts.
 * Also called by authenticated users from the admin panel to download recovery scripts.
 */

const VERSION = "6.9.34"
const DEPLOYED_AT = new Date().toISOString()

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * Validate RouterOS script for forbidden patterns that break during /import
 */
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets in conditional)' },
    { regex: /comment~"/, desc: 'comment~ (must use comment= for exact match)' },
    { regex: /dst-host="\*\.apple\.com"/, desc: '*.apple.com (breaks RouterOS 6.x parser during /import)' },
    // v6.9.31: Block *.supabase.* wildcards - they break RouterOS 6.x parser inside [find ...]
    { regex: /dst-host="\*\.supabase\.(co|in)"/, desc: '*.supabase.* wildcard (breaks RouterOS 6.x parser - use explicit hostname)' },
    // v6.9.30: Only detect MikroTik variables INSIDE strings (those break /import)
    // Local script variables like $hsprof outside strings are fine and SHOULD NOT be escaped
    { regex: /login-url="\$[a-zA-Z]/, desc: 'login-url="$var... (MikroTik variable in string breaks /import - use escaped \\$)' },
    // v6.9.32: Block :if ... do={} with escaped vars - the conditional inline block breaks parser
    // This is MORE SPECIFIC than matching any do={} - only :if conditions are problematic
    { regex: /:if [^;]*do=\{[^}]*\\\$\(/, desc: ':if...do={...\\$(...} (escaped var inside if-do block breaks RouterOS 6.x - use :do { } on-error={})' },
    // v6.9.33: Block [find ...] + \$(...) inside same :do block - use two-step pattern
    { regex: /:do\s*\{\s*[^}]*\[find[^\]]*\][^}]*\\\$\([^\)]*\)[^}]*\}/, desc: '[find ...] + \\$(...) in same :do block (breaks RouterOS 6.x - use two-step pattern: assign find to local, then set)' },
    // v6.9.34: Block long command lines (>150 chars) with escaped variables - risk of parser failure
    { regex: /^\/[^#\n]{150,}\\\$\(/m, desc: 'Long command line (>150 chars) with escaped vars (use local variable concatenation)' },
  ]
  
  for (const { regex, desc } of forbiddenPatterns) {
    if (regex.test(script)) {
      console.error(`[${context} ${VERSION}] VALIDATION FAILED: Script contains forbidden pattern: ${desc}`)
      throw new Error(`Script validation failed: contains ${desc}`)
    }
  }
  console.log(`[${context} ${VERSION}] Script validation passed`)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    // Support both POST (JSON body) and GET (query param)
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncToken = body.sync_token || null
        hotspotId = body.hotspot_id || null
      } catch {
        console.error(`[mikrotik-recovery-download ${VERSION}] Invalid JSON body`)
        return new Response(
          'Invalid JSON body. Expected: {"sync_token": "..."} or {"hotspot_id": "..."}',
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      syncToken = url.searchParams.get('sync_token')
      hotspotId = url.searchParams.get('hotspot_id')
    } else {
      return new Response(
        'Method not allowed. Use GET or POST.',
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    // v6.9.20: Support hotspot_id with JWT authentication (for admin panel)
    if (hotspotId) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        console.error(`[mikrotik-recovery-download ${VERSION}] hotspot_id requires authentication`)
        return new Response(
          'Authorization required when using hotspot_id',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      // Create authenticated client
      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )

      // Validate JWT
      const token = authHeader.replace('Bearer ', '')
      const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token)

      if (claimsError || !claims?.claims) {
        console.error(`[mikrotik-recovery-download ${VERSION}] Invalid JWT:`, claimsError)
        return new Response(
          'Invalid token',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const userId = claims.claims.sub as string
      console.log(`[mikrotik-recovery-download ${VERSION}] Authenticated user: ${userId} requesting hotspot: ${hotspotId}`)

      // Get user role and permissions
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, empresa_id, embarcacao_id')
        .eq('user_id', userId)
        .single()

      if (roleError || !userRole) {
        console.error(`[mikrotik-recovery-download ${VERSION}] User role not found:`, roleError)
        return new Response(
          'User role not found',
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      // Fetch hotspot with embarcacao for permission check
      const { data: hotspot, error: hotspotError } = await supabase
        .from('hotspots')
        .select(`
          id, nome, sync_token, sync_interval_minutes,
          embarcacoes!inner(id, nome, empresa_id)
        `)
        .eq('id', hotspotId)
        .single()

      if (hotspotError || !hotspot) {
        console.error(`[mikrotik-recovery-download ${VERSION}] Hotspot not found: ${hotspotId}`)
        return new Response(
          'Hotspot not found',
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const embarcacao = hotspot.embarcacoes as unknown as { id: string; nome: string; empresa_id: string }

      // Check permission based on role
      if (userRole.role === 'super_admin') {
        // OK - full access
        console.log(`[mikrotik-recovery-download ${VERSION}] super_admin has full access`)
      } else if (userRole.role === 'empresa_admin') {
        // Check if hotspot belongs to user's empresa
        if (embarcacao.empresa_id !== userRole.empresa_id) {
          console.error(`[mikrotik-recovery-download ${VERSION}] empresa_admin denied - hotspot empresa: ${embarcacao.empresa_id}, user empresa: ${userRole.empresa_id}`)
          return new Response(
            'Access denied - hotspot belongs to another empresa',
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
          )
        }
      } else if (userRole.role === 'gerente_embarcacao') {
        // Check via gerente_embarcacoes table
        const { data: access, error: accessError } = await supabase
          .from('gerente_embarcacoes')
          .select('embarcacao_id')
          .eq('user_id', userId)
          .eq('embarcacao_id', embarcacao.id)
          .maybeSingle()

        if (accessError || !access) {
          console.error(`[mikrotik-recovery-download ${VERSION}] gerente_embarcacao denied - no access to embarcacao: ${embarcacao.id}`)
          return new Response(
            'Access denied - you do not manage this embarcacao',
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
          )
        }
      } else {
        console.error(`[mikrotik-recovery-download ${VERSION}] Unknown role: ${userRole.role}`)
        return new Response(
          'Access denied',
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      // Permission granted - use the hotspot's sync_token
      syncToken = hotspot.sync_token
      console.log(`[mikrotik-recovery-download ${VERSION}] Permission granted for ${hotspot.nome}`)
    }

    if (!syncToken) {
      console.error(`[mikrotik-recovery-download ${VERSION}] Missing sync_token or hotspot_id`)
      return new Response(
        'sync_token or hotspot_id is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery request for token: ${maskToken(syncToken)}`)

    // Find hotspot by sync_token (if we didn't already fetch it above)
    let hotspot: { id: string; nome: string; sync_token: string; sync_interval_minutes: number; embarcacoes: { id: string; nome: string; empresa_id: string } } | null = null

    if (!hotspotId) {
      const { data, error: hotspotError } = await supabase
        .from('hotspots')
        .select(`
          id, nome, sync_token, sync_interval_minutes,
          embarcacoes!inner(id, nome, empresa_id)
        `)
        .eq('sync_token', syncToken)
        .single()

      if (hotspotError || !data) {
        console.error(`[mikrotik-recovery-download ${VERSION}] Invalid token: ${maskToken(syncToken)}`)
        return new Response(
          'Invalid sync_token',
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
      hotspot = data as unknown as typeof hotspot
    } else {
      // We already fetched it above - fetch again to ensure we have correct data
      const { data, error: hotspotError } = await supabase
        .from('hotspots')
        .select(`
          id, nome, sync_token, sync_interval_minutes,
          embarcacoes!inner(id, nome, empresa_id)
        `)
        .eq('sync_token', syncToken)
        .single()

      if (hotspotError || !data) {
        console.error(`[mikrotik-recovery-download ${VERSION}] Hotspot not found for token`)
        return new Response(
          'Hotspot not found',
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
      hotspot = data as unknown as typeof hotspot
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    // v6.9.31: Extract explicit backend hostname (avoids *.supabase.* wildcards that break RouterOS parser)
    const backendHost = new URL(supabaseUrl).hostname
    const syncIntervalMinutes = hotspot!.sync_interval_minutes || 5

    console.log(`[mikrotik-recovery-download ${VERSION}] Generating recovery for: ${hotspot!.nome}`)

    // v6.9.31: Recovery script with explicit backend host - no *.supabase.* wildcards
    const recoveryScript = generateRecoveryScript(syncUrl, syncIntervalMinutes, syncToken, hotspot!.id, backendHost)

    // Validate script before returning
    validateRouterOSScript(recoveryScript, 'mikrotik-recovery-download')

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery script generated for ${hotspot!.nome} (${recoveryScript.length} bytes)`)

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
    console.error(`[mikrotik-recovery-download ${VERSION}] Unexpected error:`, error)
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

function generateRecoveryScript(syncUrl: string, syncIntervalMinutes: number, syncToken: string, hotspotId: string, backendHost: string): string {
  // External portal login URL with escaped variables for runtime expansion
  const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)`
  
  // v6.9.27 sync script source with embedded token fallback
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
# Coletar usuarios ativos (conectados)
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
# v6.9.7: Coletar lista completa de usuarios cadastrados (exclui dinamicos)
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
# v6.9.9: Coletar lista de perfis de usuario do hotspot
/ip hotspot user profile
:foreach p in=[find] do={
:local pname [get $p name]
:set profiles ($profiles . $pname . ",")
}
# Construir JSON com todos os campos (users, registered, profiles)
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "," . $q . "registered_users_csv" . $q . ":" . $q . $registered . $q . "," . $q . "registered_profiles_csv" . $q . ":" . $q . $profiles . $q . "}")
:do {
:local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" output=user as-value]
:if (($result->"status") = "finished") do={
:local resp ($result->"data")
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
# v6.9.5: Trim de espacos no inicio e fim
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={:set j ($j - 1)}
:local actions ""
:if ($j >= $i) do={:set actions [:pick $raw $i ($j + 1)]}
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:log info ("NAVSPOT-DEBUG: raw=[" . $actions . "]")
:delay 250ms
/system script run navspot-action-processor
}
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`

  // v6.9.27 action processor source - SIMPLIFIED
  // Uses direct commands with on-error={} - NO [:len [/... find ...]] patterns
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
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:local pLimit "0"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={
:set pShared [:pick $sub2 0 $p4]
:set pLimit [:pick $sub2 ($p4 + 1) [:len $sub2]]
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
:log warning ("NAVSPOT: Perfil " . $uProf . " nao existe. Criando com defaults...")
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
} else={
:log info ("NAVSPOT: remove_user - usuario inexistente: " . $rest)
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
# v6.9.27: create_whitelist_domain - Direct add with on-error (handles duplicates)
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
# v6.9.27: create_blacklist_domain - Direct add with on-error (handles duplicates)
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName) } on-error={}
:log info ("NAVSPOT: Blacklist bloqueado (walled-garden) - " . $domain)
}
}
# v6.9.27: add_firewall_block - Direct commands only
:if ($cmd = "add_firewall_block") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=none comment=("navspot-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall block - " . $domain . " -> " . $resolvedIp)
}
} on-error={
:log warning ("NAVSPOT: Failed to resolve " . $domain)
}
}
}
# v6.9.27: add_firewall_allow - Direct commands only
:if ($cmd = "add_firewall_allow") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=none comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
}
} on-error={
:log warning ("NAVSPOT: DNS failed for " . $domain . " - using Walled Garden only")
}
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

  // v6.9.27: Recovery script - Uses remove+add pattern (NO nested [:len [/...]] patterns)
  return `# NAVSPOT Recovery Script v${VERSION}
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
# This script recreates missing scripts/schedulers + token
# v6.9.27: CRITICAL FIX - Eliminated ALL [:len [/... find ...]] patterns
#          Uses idempotent remove+add pattern for Walled Garden entries
#          RouterOS 6.x compatible /import syntax
# v6.9.26: Removed AUTO-FIX firewall block completely
# v6.9.23: Whitelist rules now scoped to hotspot=auth (pre-login traffic no longer blocked)
# It does NOT touch network config (bridge, DHCP, NAT, hotspot)
:log info "NAVSPOT-RECOVERY v${VERSION}: Iniciando reparacao..."

# 0. RECRIAR TOKEN (metodo RouterOS 6.x compativel - explicit .txt extension)
:log info "NAVSPOT-RECOVERY v${VERSION}: Recriando token..."
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="${syncToken}"
:log info "NAVSPOT-RECOVERY: Token recriado (navspot-token.txt)"

# 1. ACTION PROCESSOR - set-or-add pattern
:local apExists [/system script find name="navspot-action-processor"]
:if ([:len $apExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-action-processor v${VERSION}..."
/system script set $apExists policy=read,write,test source={
${actionProcessorSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-action-processor v${VERSION}..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
}
:delay 200ms

# 2. SYNC SCRIPT - set-or-add pattern with token fallback embutido
:local syncExists [/system script find name="navspot-sync"]
:if ([:len $syncExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-sync v${VERSION} (token fallback embutido)..."
/system script set $syncExists policy=read,write,test source={
${syncScriptSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-sync v${VERSION} (token fallback embutido)..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
}
:delay 200ms

# 3. SCHEDULER - set-or-add pattern v6.9.27: delay para aguardar rede + start-date fixo
:local schedExists [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $schedExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando scheduler v${VERSION}..."
/system scheduler set $schedExists interval=${syncIntervalMinutes}m on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}" start-time=startup start-date=jan/01/1970 disabled=no
} else={
:log info "NAVSPOT-RECOVERY: Criando scheduler v${VERSION}..."
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}" start-time=startup start-date=jan/01/1970
}

# 4. NETWATCH v6.9.27 - Dispara sync quando internet volta (remove+add pattern)
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s down-script="" up-script=":delay 5s; :do { /system script run navspot-sync } on-error={}" comment="navspot-netwatch"
:log info "NAVSPOT-RECOVERY: Netwatch configurado para auto-sync"

# 5. WALLED GARDEN ESSENCIAL v6.9.27 (remove+add pattern - idempotent)
:log info "NAVSPOT-RECOVERY: Reconfigurando Walled Garden essencial..."

# Portal NAVSPOT
:do { /ip hotspot walled-garden remove [find dst-host="navspot.lovable.app"] } on-error={}
/ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
:do { /ip hotspot walled-garden remove [find dst-host="*.lovable.app"] } on-error={}
/ip hotspot walled-garden add dst-host="*.lovable.app" action=allow comment="navspot-portal"

# Backend (explicit host - v6.9.31: avoids *.supabase.* wildcard parser issues)
:do { /ip hotspot walled-garden remove [find where comment="navspot-api"] } on-error={}
/ip hotspot walled-garden add dst-host="${backendHost}" action=allow comment="navspot-api"

# CDNs para logos e assets
:do { /ip hotspot walled-garden remove [find dst-host="*.cloudfront.net"] } on-error={}
/ip hotspot walled-garden add dst-host="*.cloudfront.net" action=allow comment="navspot-cdn"
:do { /ip hotspot walled-garden remove [find dst-host="*.amazonaws.com"] } on-error={}
/ip hotspot walled-garden add dst-host="*.amazonaws.com" action=allow comment="navspot-cdn"

# Captive Portal Detection - Android
:do { /ip hotspot walled-garden remove [find dst-host="connectivitycheck.gstatic.com"] } on-error={}
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-cpd-android"
:do { /ip hotspot walled-garden remove [find dst-host="*.gstatic.com"] } on-error={}
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-cpd-android"

# Captive Portal Detection - Windows
:do { /ip hotspot walled-garden remove [find dst-host="*.msftconnecttest.com"] } on-error={}
/ip hotspot walled-garden add dst-host="*.msftconnecttest.com" action=allow comment="navspot-cpd-windows"
:do { /ip hotspot walled-garden remove [find dst-host="*.msftncsi.com"] } on-error={}
/ip hotspot walled-garden add dst-host="*.msftncsi.com" action=allow comment="navspot-cpd-windows"

# Captive Portal Detection - Apple (v6.9.28: explicit hosts instead of *.apple.com wildcard)
:do { /ip hotspot walled-garden remove [find dst-host="captive.apple.com"] } on-error={}
/ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="navspot-cpd-apple"
:do { /ip hotspot walled-garden remove [find dst-host="www.apple.com"] } on-error={}
/ip hotspot walled-garden add dst-host="www.apple.com" action=allow comment="navspot-cpd-apple"

# v6.9.27: Protocolos essenciais (remove+add by comment - EXACT match)
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-udp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-tcp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dhcp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
:do { /ip hotspot walled-garden ip remove [find comment="navspot-ntp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
:do { /ip hotspot walled-garden ip remove [find comment="navspot-icmp"] } on-error={}
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"

:log info "NAVSPOT-RECOVERY: Walled Garden essencial configurado"

# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.34
# Safe URL construction: build URL in local vars, then set profile
# Nota: $fullUrl sem aspas pois e variavel local (aspas causam erro no linter)
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl (\$urlBase . \$urlVars)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do {
/ip hotspot profile set \$_hsprof login-url=\$fullUrl
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v${VERSION}: REPARACAO CONCLUIDA!"
:log info "FIX v6.9.34: login-url built via local vars (safe URL construction)"
:log info "FIX v6.9.31: Replaced *.supabase.* wildcards with explicit host"
:log info "FIX v6.9.31: Token file uses explicit .txt extension"
:log info "FIX v6.9.28: Removed *.apple.com (explicit hosts instead)"
:log info "FIX: Uses idempotent remove+add pattern for Walled Garden"
:log info "FIX: login-url do hotspot profile verificada/corrigida"
:log info "Token: recriado e fallback embutido no sync"
:log info "Scripts: sync + action-processor v${VERSION} atualizados"
:log info "Scheduler: sync a cada ${syncIntervalMinutes}m com startup delay"
:log info "Netwatch: auto-sync quando internet volta"
:log info "Walled Garden: portal + API (${backendHost}) + CPD + DNS/ICMP"
:log info "NOTE: Old firewall rules will be fixed on next sync (hotspot=auth)"
:log info "=========================================="
`
}
