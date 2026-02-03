import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-recovery-download v6.9.20
 * 
 * Minimal recovery endpoint for MikroTik self-healing.
 * Returns a .rsc script that ONLY recreates scripts/schedulers without touching
 * bridge, DHCP, NAT, hotspot config - to avoid network disruption.
 * 
 * v6.9.20: Token fallback embutido nos scripts + suporte a hotspot_id autenticado
 * v6.9.19: Startup resilience - delay in schedulers + Netwatch for auto-sync
 * v6.9.15: Added add_firewall_block handler with Address-List + DNS resolution
 * 
 * Called by navspot-guardian when it detects missing components or outdated scripts.
 * Also called by authenticated users from the admin panel to download recovery scripts.
 */

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
        console.error('[mikrotik-recovery-download] Invalid JSON body')
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
        console.error('[mikrotik-recovery-download] hotspot_id requires authentication')
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
        console.error('[mikrotik-recovery-download] Invalid JWT:', claimsError)
        return new Response(
          'Invalid token',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const userId = claims.claims.sub as string
      console.log(`[mikrotik-recovery-download] Authenticated user: ${userId} requesting hotspot: ${hotspotId}`)

      // Get user role and permissions
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, empresa_id, embarcacao_id')
        .eq('user_id', userId)
        .single()

      if (roleError || !userRole) {
        console.error('[mikrotik-recovery-download] User role not found:', roleError)
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
        console.error(`[mikrotik-recovery-download] Hotspot not found: ${hotspotId}`)
        return new Response(
          'Hotspot not found',
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const embarcacao = hotspot.embarcacoes as unknown as { id: string; nome: string; empresa_id: string }

      // Check permission based on role
      if (userRole.role === 'super_admin') {
        // OK - full access
        console.log('[mikrotik-recovery-download] super_admin has full access')
      } else if (userRole.role === 'empresa_admin') {
        // Check if hotspot belongs to user's empresa
        if (embarcacao.empresa_id !== userRole.empresa_id) {
          console.error(`[mikrotik-recovery-download] empresa_admin denied - hotspot empresa: ${embarcacao.empresa_id}, user empresa: ${userRole.empresa_id}`)
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
          console.error(`[mikrotik-recovery-download] gerente_embarcacao denied - no access to embarcacao: ${embarcacao.id}`)
          return new Response(
            'Access denied - you do not manage this embarcacao',
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
          )
        }
      } else {
        console.error(`[mikrotik-recovery-download] Unknown role: ${userRole.role}`)
        return new Response(
          'Access denied',
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      // Permission granted - use the hotspot's sync_token
      syncToken = hotspot.sync_token
      console.log(`[mikrotik-recovery-download] Permission granted for ${hotspot.nome}`)
    }

    if (!syncToken) {
      console.error('[mikrotik-recovery-download] Missing sync_token or hotspot_id')
      return new Response(
        'sync_token or hotspot_id is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    console.log(`[mikrotik-recovery-download] Recovery request for token: ${maskToken(syncToken)}`)

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
        console.error(`[mikrotik-recovery-download] Invalid token: ${maskToken(syncToken)}`)
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
        console.error(`[mikrotik-recovery-download] Hotspot not found for token`)
        return new Response(
          'Hotspot not found',
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
      hotspot = data as unknown as typeof hotspot
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const syncIntervalMinutes = hotspot!.sync_interval_minutes || 5

    console.log(`[mikrotik-recovery-download] Generating recovery v6.9.20 for: ${hotspot!.nome}`)

    // v6.9.20: Recovery script with embedded token fallback + Address-List blocking + startup resilience
    const recoveryScript = generateRecoveryScript(syncUrl, syncIntervalMinutes, syncToken)

    console.log(`[mikrotik-recovery-download] Recovery script v6.9.20 generated for ${hotspot!.nome} (${recoveryScript.length} bytes)`)

    return new Response(recoveryScript, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="navspot-recovery.rsc"',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })

  } catch (error) {
    console.error('[mikrotik-recovery-download] Unexpected error:', error)
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

function generateRecoveryScript(syncUrl: string, syncIntervalMinutes: number, syncToken: string): string {
  // v6.9.20 sync script source with embedded token fallback
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

  // v6.9.20 action processor source with Address-List blocking
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
:log info ("NAVSPOT-ACTION v6.9.20: Iniciando - " . $rawData)
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
:if ([:len [/ip hotspot user profile find name=$uProf]] = 0) do={
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
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName)
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado (walled-garden) - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
}
}
}
:if ($cmd = "add_firewall_block") do={
:local domain $rest
:if ([:len $domain] > 0) do={
# v6.9.20: Ensure master drop rule exists before fasttrack
:if ([:len [/ip firewall filter find comment="NAVSPOT-BLOCK-MASTER"]] = 0) do={
:local ftPos [/ip firewall filter find where action=fasttrack-connection]
:if ([:len $ftPos] = 0) do={:set ftPos 0}
/ip firewall filter add chain=forward action=drop dst-address-list=NAVSPOT-BLACKLIST comment="NAVSPOT-BLOCK-MASTER" place-before=$ftPos
:log info "NAVSPOT: Master firewall rule created"
}
# v6.9.20: Resolve domain to IP and add to address-list
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:if ([:len [/ip firewall address-list find list="NAVSPOT-BLACKLIST" address=$resolvedIp]] = 0) do={
/ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=1d comment=("navspot-" . $domain)
:log info ("NAVSPOT: Firewall block - " . $domain . " -> " . $resolvedIp)
} else={
:log info ("NAVSPOT: IP already in blacklist - " . $resolvedIp)
}
}
} on-error={
:log warning ("NAVSPOT: Failed to resolve " . $domain . " - using content match fallback")
:if ([:len [/ip firewall filter find comment=("NAVSPOT-BLOCK-" . $domain)]] = 0) do={
:local ftPos [/ip firewall filter find where action=fasttrack-connection]
:if ([:len $ftPos] = 0) do={:set ftPos 0}
/ip firewall filter add chain=forward action=drop protocol=tcp dst-port=80,443 content=$domain comment=("NAVSPOT-BLOCK-" . $domain) place-before=$ftPos
}
}
}
}
# v6.9.17: add_firewall_allow - Whitelist for "bloquear_tudo" mode
:if ($cmd = "add_firewall_allow") do={
:local domain $rest
:if ([:len $domain] > 0) do={
# Ensure master deny-all rule exists (must be AFTER allow rules)
:if ([:len [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]] = 0) do={
:local ftPos [/ip firewall filter find where action=fasttrack-connection]
:if ([:len $ftPos] = 0) do={:set ftPos 0}
# Create ACCEPT rule for allowed list first
/ip firewall filter add chain=forward action=accept dst-address-list=NAVSPOT-ALLOWED comment="NAVSPOT-ALLOW-ACCEPT" place-before=$ftPos
:log info "NAVSPOT: Allow accept rule created"
# Then create DROP for everything else (will be after the accept due to place-before logic)
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" place-before=$ftPos
:log info "NAVSPOT: Allow master drop rule created"
}
# Resolve domain to IP and add to allowed list
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:if ([:len [/ip firewall address-list find list="NAVSPOT-ALLOWED" address=$resolvedIp]] = 0) do={
/ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=1d comment=("navspot-allow-" . $domain)
:log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
} else={
:log info ("NAVSPOT: IP already in allowed list - " . $resolvedIp)
}
}
} on-error={
:log warning ("NAVSPOT: Failed to resolve allowed domain " . $domain)
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
:log info "NAVSPOT-ACTION v6.9.20: Processamento concluido"`

  // v6.9.20: Recovery script with set-or-add pattern + startup resilience + netwatch + token recreation + embedded fallback
  return `# NAVSPOT Recovery Script v6.9.20
# This script recreates missing scripts/schedulers + token
# It does NOT touch network config (bridge, DHCP, NAT, hotspot)
:log info "NAVSPOT-RECOVERY v6.9.20: Iniciando reparacao..."

# 0. RECRIAR TOKEN (metodo RouterOS 6.x compativel)
:log info "NAVSPOT-RECOVERY v6.9.20: Recriando token..."
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token where name="__never__"
:delay 1s
/file set [find name~"navspot-token"] contents="${syncToken}"
:log info "NAVSPOT-RECOVERY: Token recriado"

# 1. ACTION PROCESSOR - set-or-add pattern
:local apExists [/system script find name="navspot-action-processor"]
:if ([:len $apExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-action-processor v6.9.20..."
/system script set $apExists policy=read,write,test source={
${actionProcessorSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-action-processor v6.9.20..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
}
:delay 200ms

# 2. SYNC SCRIPT - set-or-add pattern with token fallback embutido
:local syncExists [/system script find name="navspot-sync"]
:if ([:len $syncExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-sync v6.9.20 (token fallback embutido)..."
/system script set $syncExists policy=read,write,test source={
${syncScriptSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-sync v6.9.20 (token fallback embutido)..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
}
:delay 200ms

# 3. SCHEDULER - set-or-add pattern v6.9.20: delay para aguardar rede + start-date fixo
:local schedExists [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $schedExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando scheduler v6.9.20..."
/system scheduler set $schedExists interval=${syncIntervalMinutes}m on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}" start-time=startup start-date=jan/01/1970 disabled=no
} else={
:log info "NAVSPOT-RECOVERY: Criando scheduler v6.9.20..."
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}" start-time=startup start-date=jan/01/1970
}

# 4. NETWATCH v6.9.20 - Dispara sync quando internet volta
:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0) do={
/tool netwatch add host=8.8.8.8 interval=30s down-script="" up-script=":delay 5s; :do { /system script run navspot-sync } on-error={}" comment="navspot-netwatch"
:log info "NAVSPOT-RECOVERY: Netwatch configurado para auto-sync"
}

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v6.9.20: REPARACAO CONCLUIDA!"
:log info "Token: recriado e fallback embutido no sync"
:log info "Scripts: sync + action-processor atualizados"
:log info "Scheduler: sync a cada ${syncIntervalMinutes}m com startup delay"
:log info "Netwatch: auto-sync quando internet volta"
:log info "=========================================="
`
}
