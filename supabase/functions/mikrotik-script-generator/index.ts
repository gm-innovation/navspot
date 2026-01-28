import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Hotspot {
  id: string
  nome: string
  interface_wifi: string
  wan_interface: string
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

    console.log(`[script-generator] Generating bootstrap script v4.2 for hotspot: ${hotspot_id}`)

    // Fetch hotspot with embarcacao
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, interface_wifi, wan_interface, rede, sync_token, sync_interval_minutes, max_usuarios,
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

    // Generate v4.2 bootstrap script with WAN protection
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

    console.log(`[script-generator] Bootstrap script v4.2 generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'})`)

    return new Response(
      JSON.stringify({
        success: true,
        script,
        hotspot_name: hotspot.nome,
        wan_interface: hotspot.wan_interface || 'ether1',
        version: '4.2'
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
  const wanInterface = hotspot.wan_interface || 'ether1'

  // Bootstrap script v4.2 - WAN Segura + Sync Robusto
  return `# ============================================
# NAVSPOT Bootstrap Script v4.2
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# WAN: ${wanInterface}
# Generated: ${new Date().toISOString()}
# ============================================

# === VARIÁVEL WAN (CRÍTICO - NUNCA SERÁ ADICIONADA À BRIDGE) ===
:local WAN_IF "${wanInterface}"

# === VALIDAÇÃO WAN ===
:if ([:len \$WAN_IF] = 0) do={
  :log error "NAVSPOT: WAN_IF vazio. Abortando para nao derrubar internet."
  :error "WAN_IF obrigatorio"
}
:if ([:len [/interface find name=\$WAN_IF]] = 0) do={
  :log error ("NAVSPOT: WAN_IF nao existe: " . \$WAN_IF)
  :error "WAN_IF invalido"
}
:log info ("NAVSPOT: WAN preservada = " . \$WAN_IF)

/system identity set name="${embarcacao.nome}"
:log info "NAVSPOT: Iniciando bootstrap v4.2..."

# === DHCP CLIENT NA WAN (SE NECESSÁRIO) ===
/ip dhcp-client
:if ([:len [find interface=\$WAN_IF]] = 0) do={
  add interface=\$WAN_IF disabled=no comment="navspot-wan-dhcp"
  :log info "NAVSPOT: DHCP client criado na WAN"
}

# === BRIDGE ===
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}
enable [find name="bridge1"]

# === BRIDGE PORTS (NUNCA INCLUI WAN) ===
:local LAN_IFS {"ether2";"ether3";"ether4";"ether5"}
/interface bridge port
:foreach p in=\$LAN_IFS do={
  :if ([:len [/interface find name=\$p]] > 0) do={
    :if (\$p != \$WAN_IF) do={
      :do {remove [find interface=\$p]} on-error={}
      :do {add bridge="bridge1" interface=\$p comment="navspot-lan"} on-error={}
    } else={
      :log warning ("NAVSPOT: Porta " . \$p . " e WAN, NAO adicionada a bridge")
    }
  }
}

:delay 2s

# === IP ADDRESS ===
/ip address
:do {remove [find interface="bridge1" comment~"navspot"]} on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot-${hotspotSlug}"

# === IP POOL ===
/ip pool
:do {remove [find name="hs-pool-${hotspotSlug}"]} on-error={}
add name="hs-pool-${hotspotSlug}" ranges=${poolStart}-${poolEnd}

# === DHCP NETWORK ===
/ip dhcp-server network
:do {remove [find comment~"navspot"]} on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

# === DHCP SERVER ===
/ip dhcp-server
:do {remove [find name="dhcp-${hotspotSlug}"]} on-error={}
add name="dhcp-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" disabled=no

# === DNS ===
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# === HOTSPOT PROFILE ===
/ip hotspot profile
:do {remove [find name="hsprof-${hotspotSlug}"]} on-error={}
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap

:log info "NAVSPOT: Profile criado"

# === HOTSPOT SERVER ===
/ip hotspot
:do {remove [find name="hs-${hotspotSlug}"]} on-error={}
add name="hs-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no

:log info "NAVSPOT: Hotspot ativo"

# === NAT EXPLÍCITO NA WAN (NÃO USA !bridge1) ===
/ip firewall nat
:do {remove [find comment="navspot-masquerade"]} on-error={}
add chain=srcnat out-interface=\$WAN_IF action=masquerade comment="navspot-masquerade"

:log info ("NAVSPOT: NAT configurado na WAN=" . \$WAN_IF)

# === WALLED GARDEN BÁSICO ===
/ip hotspot walled-garden
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-system-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-system-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-system-dhcp"

:log info "NAVSPOT: Walled garden configurado"

# === TOKEN FILE ===
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

:log info "NAVSPOT: Token salvo"

# === SCRIPT DE SYNC (BLOCO source={} - NÃO USA STRING ESCAPADA) ===
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
:do {/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$body output=user as-value} on-error={:log warning "NAVSPOT-SYNC: Falha ao conectar API"}
:log info "NAVSPOT-SYNC: Sincronizado"
}

:log info "NAVSPOT: Script de sync criado"

# === SCHEDULER ===
/system scheduler
:do {remove [find name="navspot-sync-scheduler"]} on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap v4.2 concluido com sucesso!"
:log info ("NAVSPOT: WAN=" . \$WAN_IF . " preservada. Hotspot funcional.")
`
}
