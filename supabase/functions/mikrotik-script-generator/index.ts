import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Hotspot {
  id: string
  nome: string
  interface_wifi: string
  rede: string
  sync_token: string
  sync_interval_minutes: number
  max_usuarios: number | null
}

interface Embarcacao {
  id: string
  nome: string
  empresa_id: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Validate JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token)
    
    if (claimsError || !claims?.claims) {
      console.error('[script-generator] Invalid JWT:', claimsError)
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { hotspot_id } = await req.json()
    
    if (!hotspot_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'hotspot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[script-generator] Generating bootstrap script for hotspot: ${hotspot_id}`)

    // Fetch hotspot with embarcacao
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, interface_wifi, rede, sync_token, sync_interval_minutes, max_usuarios,
        embarcacoes!inner(id, nome, empresa_id)
      `)
      .eq('id', hotspot_id)
      .single()

    if (hotspotError || !hotspot) {
      console.error('[script-generator] Hotspot not found:', hotspotError)
      return new Response(
        JSON.stringify({ success: false, error: 'Hotspot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const embarcacao = hotspot.embarcacoes as unknown as Embarcacao

    // Generate minimal bootstrap RSC script
    const script = generateBootstrapScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      Deno.env.get('SUPABASE_URL')!
    )

    // Save generated script to hotspot
    const { error: updateError } = await supabase
      .from('hotspots')
      .update({
        script_gerado: script,
        script_versao: hotspot.script_versao ? hotspot.script_versao + 1 : 1
      })
      .eq('id', hotspot_id)

    if (updateError) {
      console.error('[script-generator] Failed to save script:', updateError)
    }

    console.log(`[script-generator] Bootstrap script generated for ${hotspot.nome}`)

    return new Response(
      JSON.stringify({
        success: true,
        script,
        hotspot_name: hotspot.nome,
        tripulantes_count: 0, // Users configured via API
        perfis_count: 0,      // Profiles configured via API
        regras_count: 0       // Rules configured via API
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[script-generator] Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateBootstrapScript(
  hotspot: Hotspot,
  embarcacao: Embarcacao,
  supabaseUrl: string
): string {
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const hotspotSlug = hotspot.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const syncIntervalMinutes = hotspot.sync_interval_minutes || 5
  const syncIntervalSeconds = syncIntervalMinutes * 60

  // Bootstrap script - minimal, just infrastructure + sync
  return `# ============================================
# NAVSPOT Bootstrap Script v4.0
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# ============================================
# Este script cria APENAS a infraestrutura basica.
# Usuarios, perfis e regras sao configurados via API.
# ============================================

/system identity set name="${hotspot.nome}"

# === Bridge Infrastructure ===
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}
enable [find name="bridge1"]
:delay 2s

/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {remove [find interface=\$p]} on-error={}}
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {add bridge="bridge1" interface=\$p} on-error={}}
:foreach w in={"wlan1";"wlan2"} do={:if ([/interface find name=\$w]!="") do={:do {/interface bridge port remove [find interface=\$w]} on-error={};:do {/interface bridge port add bridge="bridge1" interface=\$w} on-error={}}}
/interface ethernet
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {enable [find name=\$p]} on-error={}}
:delay 2s

# === IP Configuration ===
/ip address
:do {remove [find interface="bridge1" comment~"navspot"]} on-error={}
:do {add address=${gateway}/24 interface="bridge1" comment="navspot-${hotspotSlug}"} on-error={}

/ip pool
:do {remove [find name="hs-pool-${hotspotSlug}"]} on-error={}
add name="hs-pool-${hotspotSlug}" ranges=${poolStart}-${poolEnd}

/ip dhcp-server network
:do {remove [find gateway="${gateway}"]} on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

/ip dhcp-server
:do {remove [find name="dhcp-${hotspotSlug}"]} on-error={}
add name="dhcp-${hotspotSlug}" interface="bridge1" address-pool="hs-pool-${hotspotSlug}" disabled=no

/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

# === Hotspot ===
/ip hotspot profile
:do {remove [find name="hsprof-${hotspotSlug}"]} on-error={}
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=hotspot login-by=http-chap,http-pap

/ip hotspot user profile
:do {remove [find name="default-navspot"]} on-error={}
add name="default-navspot" rate-limit="2M/5M" shared-users=1

/ip hotspot ip-binding
:do {remove [find comment~"navspot"]} on-error={}
add address=0.0.0.0/0 type=bypassed server=none comment="navspot-admin-bypass"

/ip hotspot
:do {remove [find name="hs-${hotspotSlug}"]} on-error={}
add name="hs-${hotspotSlug}" interface="bridge1" address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no

# === Walled Garden (sistema) ===
/ip hotspot walled-garden
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-system-dns"
add dst-port=67-68 protocol=udp action=accept comment="navspot-system-dhcp"

# === Token File ===
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

# === Sync Script ===
/system script
:do {remove [find name="navspot-sync"]} on-error={}
add name="navspot-sync" policy=read,write,policy,test source={
:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
:local u [get \$a user]
:local m [get \$a mac-address]
:local bi [get \$a bytes-in]
:local bo [get \$a bytes-out]
:set users (\$users . \$u . "," . \$m . "," . \$bi . "," . \$bo . ";")
}
:local body ("{\\"sync_token\\":\\"" . \$token . "\\",\\"active_users_csv\\":\\"" . \$users . "\\"}")
:do {/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$body output=user as-value} on-error={:log warning "NAVSPOT: Sync failed"}
}

# === Action Processor ===
:do {remove [find name="navspot-action-processor"]} on-error={}
add name="navspot-action-processor" policy=read,write,policy,test source={
:local actions [:toarray ""]
:foreach a in=\$actions do={
:local parts [:toarray \$a]
:local id [:pick \$parts 0]
:local t [:pick \$parts 1]
:if (\$t="create_user") do={/ip hotspot user add name=[:pick \$parts 2] password=[:pick \$parts 3] profile=[:pick \$parts 4]}
:if (\$t="remove_user") do={/ip hotspot user remove [find name=[:pick \$parts 2]]}
:if (\$t="disable_user") do={/ip hotspot user set [find name=[:pick \$parts 2]] disabled=yes}
:if (\$t="enable_user") do={/ip hotspot user set [find name=[:pick \$parts 2]] disabled=no}
:if (\$t="kick_session") do={/ip hotspot active remove [find user=[:pick \$parts 2]]}
:if (\$t="add_user_profile") do={/ip hotspot user profile add name=[:pick \$parts 2] rate-limit=[:pick \$parts 3] shared-users=[:pick \$parts 4]}
:if (\$t="add_walled_garden") do={/ip hotspot walled-garden add dst-host=[:pick \$parts 2] action=[:pick \$parts 3] comment=[:pick \$parts 4]}
}
}

# === Health Check ===
:do {remove [find name="navspot-health"]} on-error={}
add name="navspot-health" policy=read,write,policy,test source={
:if ([/ip hotspot find name="hs-${hotspotSlug}"]="") do={:log error "NAVSPOT: Hotspot not found!"}
:if ([/ip dhcp-server find name="dhcp-${hotspotSlug}"]="") do={:log error "NAVSPOT: DHCP not found!"}
}

# === Scheduler ===
/system scheduler
:do {remove [find name="navspot-sync-scheduler"]} on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalSeconds}s on-event="/system script run navspot-sync" start-time=startup

:log info "NAVSPOT: Bootstrap concluido! Hotspot funcional."
:log info "NAVSPOT: Usuarios e regras serao configurados via API."
`
}
