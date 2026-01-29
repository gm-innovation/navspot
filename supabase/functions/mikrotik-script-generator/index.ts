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

    console.log(`[script-generator] Generating bootstrap script v6.1 for hotspot: ${hotspot_id}`)

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

    // Generate v6.0 bootstrap script
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

    console.log(`[script-generator] Bootstrap script v6.1 generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'}, Type: ${hotspot.wan_type || 'dhcp'})`)

    return new Response(
      JSON.stringify({
        success: true,
        script,
        hotspot_name: hotspot.nome,
        wan_interface: hotspot.wan_interface || 'ether1',
        wan_type: hotspot.wan_type || 'dhcp',
        version: '6.1'
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

  // Gerar migração de portas em ordem reversa (ether2 sempre por último)
  const allPorts = ['ether2', 'ether3', 'ether4', 'ether5']
  const lanPorts = allPorts.filter(p => p !== wanInterface)
  
  // Ordenar: ether2 sempre por último, restante em ordem reversa (5, 4, 3)
  const migrationOrder = [...lanPorts].sort((a, b) => {
    if (a === 'ether2') return 1
    if (b === 'ether2') return -1
    return b.localeCompare(a)
  })

  // Gerar comandos de migração com delays e logs individuais
  const portMigrationCommands = migrationOrder.map((port, index) => {
    const isLast = index === migrationOrder.length - 1
    const delay = isLast ? '' : '\n:delay 500ms'
    const logMessage = isLast 
      ? `NAVSPOT: ${port} migrada - Winbox vai reconectar`
      : `NAVSPOT: ${port} migrada`
    
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "${logMessage}"${delay}`
  }).join('\n\n')

  // Script sync inline com \r\n (NAO usar bloco source={})
  const syncScriptSource = `:local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\\"sync_token\\\\\\\":\\\\\\\"\\" . \\$token . \\"\\\\\\\",\\\\\\\"active_users_csv\\\\\\\":\\\\\\\"\\" . \\$users . \\"\\\\\\\"}\\")\\r\\n:do {/tool fetch url=\\$syncUrl mode=https http-method=post http-data=\\$body output=user as-value} on-error={:log warning \\"NAVSPOT-SYNC: Falha\\"}\\r\\n:log info \\"NAVSPOT-SYNC: OK\\"`

  // Configuração WAN com remoção prévia do DHCP client existente
  const wanConfig = wanType === 'dhcp' 
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`

  // Bootstrap script v6.1 - Critical Fixes
  return `:log info "NAVSPOT v6.1: Iniciando instalacao..."

# 0. VALIDACAO INICIAL
:if ([:len [/interface find name="${wanInterface}"]] = 0) do={
  :log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
  :error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 1. LIMPEZA INICIAL (remover configs antigas)
:do { /ip hotspot remove [find name="hs-navspot"] } on-error={}
:do { /ip hotspot profile remove [find name~"navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip pool remove [find name="hs-pool-navspot"] } on-error={}
:do { /ip address remove [find comment="navspot"] } on-error={}
:do { /ip firewall nat remove [find comment="navspot-nat"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment~"navspot"] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment~"navspot"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
:do { /system script remove [find name="navspot-sync"] } on-error={}
:do { /system scheduler remove [find name="navspot-sync-scheduler"] } on-error={}
:do { /file remove "navspot-token.txt" } on-error={}
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
:delay 2s
:log info "NAVSPOT: Limpeza concluida"

# 2. CONFIGURAR WAN (antes de criar bridge)
${wanConfig}

# 3. IDENTIDADE
/system identity set name="${embarcacao.nome}"

# 4. CRIAR BRIDGE1 VAZIA (sem portas ainda)
/interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot"
:delay 1s
:log info "NAVSPOT: Bridge1 criada (vazia)"

# 5. CONFIGURAR REDE NA BRIDGE1 (antes de mover portas)
/ip address add address=${gateway}/24 interface=bridge1 comment="navspot"
/ip pool add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd}
/ip dhcp-server network add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot"
/ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
:log info "NAVSPOT: Rede IP configurada"

# 6. NAT
/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat"
:log info "NAVSPOT: NAT configurado em ${wanInterface}"

# 7. HOTSPOT
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=flash/hotspot login-by=http-chap,http-pap
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot ativo"

# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 9. TOKEN
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token salvo"

# 10. SYNC SCRIPT + SCHEDULER
/system script add name="navspot-sync" policy=read,write,policy,test source="${syncScriptSource}"
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup
:log info "NAVSPOT: Sync configurado"

# 11. MIGRACAO SEGURA DE PORTAS (ordem reversa, ether2 por ultimo)
:log info "NAVSPOT: Iniciando migracao de portas..."
${portMigrationCommands}

# 12. LIMPEZA FINAL (remover bridge defconf vazia)
:do { /interface bridge remove [find name="bridge"] } on-error={}
:log info "NAVSPOT: Bridge defconf removida"

# 13. FINALIZACAO
:log info "NAVSPOT: Portas migradas com sucesso"
:log info "NAVSPOT: Bridge1 ativa e funcional"
:log info "NAVSPOT v6.1: Bootstrap concluido!"
:log info "NAVSPOT: Reconecte via ${gateway}"
`
}
