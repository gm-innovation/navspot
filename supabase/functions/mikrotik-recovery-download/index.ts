import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-recovery-download v6.9.12
 * 
 * Minimal recovery endpoint for MikroTik self-healing.
 * Returns a .rsc script that ONLY recreates scripts/schedulers without touching
 * bridge, DHCP, NAT, hotspot config - to avoid network disruption.
 * 
 * Called by navspot-guardian when it detects missing components.
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

    // Support both POST (JSON body) and GET (query param)
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncToken = body.sync_token
      } catch {
        console.error('[mikrotik-recovery-download] Invalid JSON body')
        return new Response(
          'Invalid JSON body. Expected: {"sync_token": "..."}',
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      syncToken = url.searchParams.get('sync_token')
    } else {
      return new Response(
        'Method not allowed. Use GET or POST.',
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    if (!syncToken) {
      console.error('[mikrotik-recovery-download] Missing sync_token')
      return new Response(
        'sync_token is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    console.log(`[mikrotik-recovery-download] Recovery request for token: ${maskToken(syncToken)}`)

    // Find hotspot by sync_token
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, sync_token, sync_interval_minutes,
        embarcacoes!inner(id, nome, empresa_id)
      `)
      .eq('sync_token', syncToken)
      .single()

    if (hotspotError || !hotspot) {
      console.error(`[mikrotik-recovery-download] Invalid token: ${maskToken(syncToken)}`)
      return new Response(
        'Invalid sync_token',
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const syncIntervalMinutes = hotspot.sync_interval_minutes || 5

    console.log(`[mikrotik-recovery-download] Generating recovery for: ${hotspot.nome}`)

    // v6.9.12: Minimal recovery script - ONLY scripts and scheduler
    // Uses set-or-add pattern to avoid removing functional components
    const recoveryScript = generateRecoveryScript(syncUrl, syncIntervalMinutes)

    console.log(`[mikrotik-recovery-download] Recovery script generated for ${hotspot.nome} (${recoveryScript.length} bytes)`)

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

function generateRecoveryScript(syncUrl: string, syncIntervalMinutes: number): string {
  // v6.9.9 sync script source (same as main generator)
  const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
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

  // v6.8 action processor source (same as main generator)
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
:log info ("NAVSPOT-ACTION v2: Iniciando - " . $rawData)
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
:if ([:len [/ip hotspot walled-garden find dst-host=$domain action=deny]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
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
:log info "NAVSPOT-ACTION v2: Processamento concluido"`

  // v6.9.12: Recovery script with set-or-add pattern (never removes then adds)
  return `# NAVSPOT Recovery Script v6.9.12
# This script ONLY recreates missing scripts/schedulers
# It does NOT touch network config (bridge, DHCP, NAT, hotspot)
:log info "NAVSPOT-RECOVERY: Iniciando reparacao..."

# 1. ACTION PROCESSOR - set-or-add pattern
:local apExists [/system script find name="navspot-action-processor"]
:if ([:len $apExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-action-processor..."
/system script set $apExists policy=read,write,test source={
${actionProcessorSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-action-processor..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
}
:delay 200ms

# 2. SYNC SCRIPT - set-or-add pattern
:local syncExists [/system script find name="navspot-sync"]
:if ([:len $syncExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando navspot-sync..."
/system script set $syncExists policy=read,write,test source={
${syncScriptSource}
}
} else={
:log info "NAVSPOT-RECOVERY: Criando navspot-sync..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
}
:delay 200ms

# 3. SCHEDULER - set-or-add pattern
:local schedExists [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $schedExists] > 0) do={
:log info "NAVSPOT-RECOVERY: Atualizando scheduler..."
/system scheduler set $schedExists interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync"
} else={
:log info "NAVSPOT-RECOVERY: Criando scheduler..."
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup
}

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v6.9.12: REPARACAO CONCLUIDA!"
:log info "=========================================="
`
}
