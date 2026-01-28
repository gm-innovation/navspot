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
  wan_type: string
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

    console.log(`[script-generator] Generating bootstrap script v5.0 for hotspot: ${hotspot_id}`)

    // Fetch hotspot with embarcacao
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, interface_wifi, wan_interface, wan_type, rede, sync_token, sync_interval_minutes, max_usuarios,
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

    // Generate v5.0 bootstrap script
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

    console.log(`[script-generator] Bootstrap script v5.0 generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'}, Type: ${hotspot.wan_type || 'dhcp'})`)

    return new Response(
      JSON.stringify({
        success: true,
        script,
        hotspot_name: hotspot.nome,
        wan_interface: hotspot.wan_interface || 'ether1',
        wan_type: hotspot.wan_type || 'dhcp',
        version: '5.0'
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
  const wanType = hotspot.wan_type || 'dhcp'
  const dnsName = `${hotspotSlug}.navspot.local`

  // Script sync inline com \r\n (NAO usar bloco source={})
  const syncScriptSource = `:local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\\"sync_token\\\\\\\":\\\\\\\"\\" . \\$token . \\"\\\\\\\",\\\\\\\"active_users_csv\\\\\\\":\\\\\\\"\\" . \\$users . \\"\\\\\\\"}\\")\\r\\n:do {/tool fetch url=\\$syncUrl mode=https http-method=post http-data=\\$body output=user as-value} on-error={:log warning \\"NAVSPOT-SYNC: Falha\\"}\\r\\n:log info \\"NAVSPOT-SYNC: OK\\"`

  // Bootstrap script v5.0 - Producao Definitiva
  return `# ============================================
# NAVSPOT Bootstrap Script v5.0 - PRODUCAO
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# WAN: ${wanInterface} (${wanType})
# Generated: ${new Date().toISOString()}
# ============================================

# --- VARIAVEIS DO SISTEMA ---
:local WANIF "${wanInterface}"
:local WANTYPE "${wanType}"
:local DNSNAME "${dnsName}"
:local TOKEN "${hotspot.sync_token}"

:log info "NAVSPOT: Iniciando instalacao segura v5.0..."

# 1. VALIDACAO DE SEGURANCA
:if ([:len [/interface find name=\$WANIF]] = 0) do={
  :log error ("NAVSPOT: Erro critico - Interface WAN " . \$WANIF . " nao existe!")
  :error "Abortando: WAN inexistente"
}
:log info ("NAVSPOT: WAN validada = " . \$WANIF)

# 2. REMOVER WAN DE QUALQUER BRIDGE EXISTENTE (CRITICO)
/interface bridge port
:do { remove [find interface=\$WANIF] } on-error={}
:log info ("NAVSPOT: WAN " . \$WANIF . " removida de bridges")

# 3. CONFIGURAR INTERNET (WAN)
:if (\$WANTYPE = "dhcp") do={
  /ip dhcp-client
  :do { remove [find interface=\$WANIF comment~"navspot"] } on-error={}
  :do { add interface=\$WANIF disabled=no comment="navspot-wan" } on-error={}
  :log info "NAVSPOT: DHCP client configurado na WAN"
}

/system identity set name="${embarcacao.nome}"

# 4. CRIAR BRIDGE DO HOTSPOT
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={ add name="bridge1" comment="navspot" }
enable [find name="bridge1"]

# 5. PORTAS LAN (NUNCA INCLUI WAN)
/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={
  :if (\$p != \$WANIF) do={
    :if ([:len [/interface find name=\$p]] > 0) do={
      :do { remove [find interface=\$p] } on-error={}
      :do { add bridge="bridge1" interface=\$p comment="navspot-lan" } on-error={}
    }
  }
}

:delay 2s

# 6. REDE IP
/ip address
:do { remove [find interface="bridge1" comment~"navspot"] } on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot"

/ip pool
:do { remove [find name="hs-pool-navspot"] } on-error={}
add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd}

/ip dhcp-server network
:do { remove [find comment~"navspot"] } on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot"

/ip dhcp-server
:do { remove [find name="dhcp-navspot"] } on-error={}
add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no

/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# 7. NAT (EXPLICITO NA WAN)
/ip firewall nat
:do { remove [find comment="navspot-nat"] } on-error={}
add chain=srcnat out-interface=\$WANIF action=masquerade comment="navspot-nat"

:log info ("NAVSPOT: NAT configurado na " . \$WANIF)

# 8. HOTSPOT
/ip hotspot profile
:do { remove [find name="hsprof-navspot"] } on-error={}
add name="hsprof-navspot" hotspot-address=${gateway} dns-name=\$DNSNAME html-directory=flash/hotspot login-by=http-chap,http-pap

/ip hotspot
:do { remove [find name="hs-navspot"] } on-error={}
add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no

:log info "NAVSPOT: Hotspot ativo"

# 9. WALLED GARDEN BASICO
/ip hotspot walled-garden
:do { remove [find comment~"navspot"] } on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do { remove [find comment~"navspot"] } on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 10. TOKEN FILE
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents=\$TOKEN

:log info "NAVSPOT: Token salvo"

# 11. SYNC SCRIPT (INLINE COM \\r\\n - NAO BLOCO)
/system script
:do { remove [find name="navspot-sync"] } on-error={}
add name="navspot-sync" policy=read,write,policy,test source="${syncScriptSource}"

:log info "NAVSPOT: Script de sync criado"

# 12. SCHEDULER
/system scheduler
:do { remove [find name="navspot-sync-scheduler"] } on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap v5.0 concluido com sucesso!"
:log info ("NAVSPOT: WAN=" . \$WANIF . " preservada. Hotspot funcional.")
`
}
