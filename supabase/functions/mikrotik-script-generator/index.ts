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

    console.log(`[script-generator] Generating bootstrap script v6.5 for hotspot: ${hotspot_id}`)

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

    // Generate v6.5 scripts (bootstrap + finalize)
    const bootstrapScript = generateBootstrapScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      Deno.env.get('SUPABASE_URL')!
    )
    
    const finalizeScript = generateFinalizeScript(
      hotspot as unknown as Hotspot
    )

    // Save generated script to hotspot
    const { error: updateError } = await supabase
      .from('hotspots')
      .update({
        script_gerado: bootstrapScript,
        script_versao: hotspot.script_versao ? hotspot.script_versao + 1 : 1
      })
      .eq('id', hotspot_id)

    if (updateError) {
      console.error('[script-generator] Failed to save script:', updateError)
    }

    // Sanity checks para evitar regressões
    if (bootstrapScript.includes('/ip hotspot user profile set') && 
        bootstrapScript.includes('limit-bytes-total')) {
      console.error('[script-generator] ERRO: Gerou limit-bytes-total em /ip hotspot user profile. Deve ser em /ip hotspot user.')
    }

    if (bootstrapScript.includes('source="')) {
      console.error('[script-generator] ERRO: Gerou source="...". Use sempre source={...} para scripts longos.')
    }

    if (bootstrapScript.includes(':do {/')) {
      console.error('[script-generator] ERRO: Gerou ":do {/". Corrigir para ":do { /".')
    }

    if (bootstrapScript.includes('/file add') && !bootstrapScript.includes('/file print file=')) {
      console.error('[script-generator] AVISO: Usando /file add sem fallback para RouterOS 6.x')
    }

    console.log(`[script-generator] Bootstrap script v6.5 generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'}, Type: ${hotspot.wan_type || 'dhcp'})`)

    return new Response(
      JSON.stringify({
        success: true,
        bootstrap_script: bootstrapScript,
        finalize_script: finalizeScript,
        hotspot_name: hotspot.nome,
        wan_interface: hotspot.wan_interface || 'ether1',
        wan_type: hotspot.wan_type || 'dhcp',
        version: '6.5'
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

function generateFinalizeScript(hotspot: Hotspot): string {
  const syncIntervalMinutes = hotspot.sync_interval_minutes || 5
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`

  return `:log info "NAVSPOT v6.5 Parte 2: Finalizando migracao da ether2..."

# Validacoes de seguranca
:if ([:len [/interface bridge find name="bridge1"]] = 0) do={
  :log error "NAVSPOT: ERRO - bridge1 nao encontrada! Execute a Parte 1 primeiro."
  :error "Abortando: bridge1 inexistente"
}

:if ([:len [/ip address find address="${gateway}/24"]] = 0) do={
  :log error "NAVSPOT: ERRO - IP ${gateway}/24 nao encontrado! Execute a Parte 1 primeiro."
  :error "Abortando: IP inexistente"
}

:log info "NAVSPOT: Validacoes OK, prosseguindo..."

# Migrar ether2 para bridge1
:do { /interface bridge port remove [find interface=ether2] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether2 comment="navspot-lan"
:log info "NAVSPOT: ether2 migrada com sucesso"

# Remover bridge antiga
:delay 2s
:do { /interface bridge remove [find name="bridge"] } on-error={}
:log info "NAVSPOT: Bridge defconf removida"

# Finalizacao
:log info "=========================================="
:log info "NAVSPOT v6.5: INSTALACAO 100% CONCLUIDA!"
:log info "Todas as portas (ether2-5) estao na bridge1"
:log info "Hotspot ativo em ${gateway}"
:log info "Sync inteligente rodando a cada ${syncIntervalMinutes} minuto(s)"
:log info "Action Processor ativo para comandos em tempo real"
:log info "=========================================="
`
}

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

  // Gerar migração de portas em ordem reversa (excluindo ether2 na Parte 1)
  const allPorts = ['ether2', 'ether3', 'ether4', 'ether5']
  const lanPorts = allPorts.filter(p => p !== wanInterface)
  
  // Portas para migrar na Parte 1: excluir ether2 e ordenar em ordem reversa (5, 4, 3)
  const partialPorts = lanPorts.filter(p => p !== 'ether2')
  const partialMigrationOrder = [...partialPorts].sort((a, b) => b.localeCompare(a))

  // Gerar comandos de migração parcial com delays
  const partialMigrationCommands = partialMigrationOrder.map((port) => {
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "NAVSPOT: ${port} migrada"
:delay 2s`
  }).join('\n\n')

  // v6.5: Script sync inteligente com extração de [[ ]] e chamada ao action-processor
  const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
:local body ("{\\"sync_token\\":\\"" . $token . "\\",\\"active_users_csv\\":\\"" . $users . "\\"}")
:do {
:local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body output=user as-value]
:if (($result->"status") = "finished") do={
:local resp ($result->"data")
:local start [:find $resp "[[ "]
:local end [:find $resp " ]]"]
:if (($start >= 0) && ($end >= 0)) do={
:local actions [:pick $resp ($start + 3) $end]
:global navspotActions $actions
/system script run navspot-action-processor
}
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`

  // v6.5: Action Processor - processa comandos separados por ; com parsing por |
  const actionProcessorSource = `:global navspotActions
:local rawData $navspotActions
:if ([:len $rawData] = 0) do={:log info "NAVSPOT: Sem acoes"; :return}
:log info "NAVSPOT: Processando acoes..."
:local pos 0
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:local p1 [:find $line "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $line 0 $p1]
:local rest [:pick $line ($p1 + 1) [:len $line]]
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local pRate [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len [/ip hotspot user profile find name="$pName"]] = 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=1
:log info "NAVSPOT: Perfil $pName criado"
}
}
:if ($cmd = "create_user") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local uPass [:pick $sub 0 $p3]
:local uProf [:pick $sub ($p3 + 1) [:len $sub]]
:if ([:len [/ip hotspot user find name="$uName"]] = 0) do={
/ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
:log info "NAVSPOT: Usuario $uName criado"
} else={
/ip hotspot user set [find name="$uName"] password=$uPass profile=$uProf
:log info "NAVSPOT: Usuario $uName atualizado"
}
}
:if ($cmd = "remove_user") do={
:do { /ip hotspot user remove [find name="$rest"] } on-error={}
:log info "NAVSPOT: Usuario $rest removido"
}
:if ($cmd = "disable_user") do={
:do { /ip hotspot user set [find name="$rest"] disabled=yes } on-error={}
:log info "NAVSPOT: Usuario $rest desabilitado"
}
:if ($cmd = "enable_user") do={
:do { /ip hotspot user set [find name="$rest"] disabled=no } on-error={}
:log info "NAVSPOT: Usuario $rest habilitado"
}
:if ($cmd = "kick_session") do={
:local p2 [:find $rest "|"]
:local kUser [:pick $rest 0 $p2]
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
:log info "NAVSPOT: Sessao $kUser/$kMac encerrada"
}
:if ($cmd = "update_password") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local uPass [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot user set [find name="$uName"] password=$uPass } on-error={}
:log info "NAVSPOT: Senha de $uName atualizada"
}
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len [/ip hotspot walled-garden find dst-host="$domain"]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=allow comment="navspot-$wName"
:log info "NAVSPOT: Whitelist $wName - $domain adicionado"
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:log info "NAVSPOT: Blacklist $bName - $domain registrado (v6.6)"
}
:if ($cmd = "create_firewall_rule") do={
:log info "NAVSPOT: Regra firewall registrada (v6.6): $rest"
}
:if ($cmd = "update_profile_quota") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local quota [:pick $rest ($p2 + 1) [:len $rest]]
:local quotaBytes ($quota * 1024 * 1024)
:foreach uId in=[/ip hotspot user find where profile="$pName"] do={
:do { /ip hotspot user set $uId limit-bytes-total=$quotaBytes } on-error={}
}
:log info ("NAVSPOT: Quota aplicada para usuarios do perfil " . $pName . " = " . $quota . " MB")
}
}
}`

  // Configuração WAN com remoção prévia do DHCP client existente
  const wanConfig = wanType === 'dhcp' 
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`

  // Bootstrap script v6.5 - Sync Inteligente com Action Processor
  return `:log info "NAVSPOT v6.5: Iniciando instalacao..."

# 0. VALIDACAO INICIAL
:if ([:len [/interface find name="${wanInterface}"]] = 0) do={
  :log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
  :error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 1. LIMPEZA INICIAL (remover configs padrao de fabrica + navspot)
:do { /ip address remove [find address="${gateway}/24"] } on-error={}
:do { /ip dhcp-server remove [find name="defconf"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp1"] } on-error={}
:do { /ip dhcp-server network remove [find address="${networkBase}.0/24"] } on-error={}
:do { /ip pool remove [find name="default-dhcp"] } on-error={}
:do { /ip pool remove [find name="dhcp-pool1"] } on-error={}
:log info "NAVSPOT: Configs de fabrica removidas"
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
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
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

# 7. HOTSPOT (login-by=http-pap para compatibilidade com senhas do sistema)
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=flash/hotspot login-by=http-pap
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot ativo"

# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"
:log info "NAVSPOT: Walled Garden configurado"

# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
:do {
/file print file=navspot-token
:delay 1s
/file set navspot-token.txt contents="${hotspot.sync_token}"
} on-error={
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
}
:log info "NAVSPOT: Token criado"

# 10. SYNC SCRIPT v6.5 + ACTION PROCESSOR
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
${actionProcessorSource}
}
/system script add name="navspot-sync" policy=read,write,policy,test source={
${syncScriptSource}
}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup
:log info "NAVSPOT: Sync v6.5 + Action Processor configurados"

# 11. MIGRACAO PARCIAL DE PORTAS (apenas ether3, 4, 5 - NAO migra ether2)
:log info "NAVSPOT: Iniciando migracao PARCIAL de portas (ether3, 4, 5)..."

${partialMigrationCommands}

# 12. PAUSA PARA TROCA DE CABO
:log warning "=========================================="
:log warning "NAVSPOT: MIGRACAO PARCIAL CONCLUIDA"
:log warning "ACAO NECESSARIA:"
:log warning "1. Desconecte o cabo da ether2"
:log warning "2. Conecte na ether3, ether4 ou ether5"
:log warning "3. Reconecte o Winbox em ${gateway}"
:log warning "4. Rode: /import navspot-finalize-ether2.rsc"
:log warning "=========================================="

# 13. FINALIZACAO PARCIAL
:log info "NAVSPOT v6.5 Parte 1: Bootstrap parcial concluido"
:log info "NAVSPOT: Aguardando troca de cabo para finalizar ether2"
`
}
