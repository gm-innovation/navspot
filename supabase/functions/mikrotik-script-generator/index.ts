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

  // Bootstrap script v4.1 - ultra minimal (~55 lines)
  return `# ============================================
# NAVSPOT Bootstrap Script v4.1
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# ============================================

/system identity set name="${embarcacao.nome}"

:log info "NAVSPOT: Iniciando bootstrap..."

# === 1. BRIDGE ===
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}
enable [find name="bridge1"]

# === 2. BRIDGE PORTS ===
/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {remove [find interface=$p]} on-error={}}
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {add bridge="bridge1" interface=$p comment="navspot"} on-error={}}

:delay 2s

# === 3. IP ADDRESS ===
/ip address
:do {remove [find address="${gateway}/24"]} on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot-${hotspotSlug}"

# === 4. IP POOL ===
/ip pool
:do {remove [find name="hs-pool-${hotspotSlug}"]} on-error={}
add name="hs-pool-${hotspotSlug}" ranges=${poolStart}-${poolEnd}

# === 5. DHCP NETWORK ===
/ip dhcp-server network
:do {remove [find gateway="${gateway}"]} on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

# === 6. DHCP SERVER ===
/ip dhcp-server
:do {remove [find name="dhcp-${hotspotSlug}"]} on-error={}
add name="dhcp-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" disabled=no

# === 7. DNS ===
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# === 8. HOTSPOT PROFILE ===
/ip hotspot profile
:do {remove [find name="hsprof-${hotspotSlug}"]} on-error={}
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap

:log info "NAVSPOT: Profile criado"

# === 9. HOTSPOT SERVER ===
/ip hotspot
:do {remove [find name="hs-${hotspotSlug}"]} on-error={}
add name="hs-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no

:log info "NAVSPOT: Hotspot ativo"

# === 10. NAT (MASQUERADE) ===
/ip firewall nat
:do {remove [find comment="navspot-masquerade"]} on-error={}
add chain=srcnat out-interface=!bridge1 action=masquerade comment="navspot-masquerade"

:log info "NAVSPOT: NAT configurado"

# === 11. WALLED GARDEN BASICO ===
/ip hotspot walled-garden
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-system-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-system-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-system-dhcp"

:log info "NAVSPOT: Walled garden basico configurado"

# === 12. TOKEN FILE ===
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

:log info "NAVSPOT: Token salvo"

# === 13. SCRIPT DE SYNC ===
/system script
:do {remove [find name="navspot-sync"]} on-error={}
add name="navspot-sync" policy=read,write,policy,test source=":local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\"sync_token\\\\\\":\\\\\\"\\". \\$token . \\"\\\\\\"\\",\\\\\\"active_users_csv\\\\\\":\\\\\\"\\". \\$users . \\"\\\\\\"}\\"\\r\\n:do {/tool fetch url=\\$syncUrl mode=https http-method=post http-data=\\$body output=user as-value} on-error={:log warning \\"NAVSPOT-SYNC: Falha\\"}\\r\\n:log info \\"NAVSPOT-SYNC: OK\\""

:log info "NAVSPOT: Script de sync criado"

# === 14. SCHEDULER ===
/system scheduler
:do {remove [find name="navspot-sync-scheduler"]} on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap concluido com sucesso!"
:log info "NAVSPOT: Hotspot funcional. Configure usuarios e regras via API."
`
}
