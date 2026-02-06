import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "7.1.46"
const DEPLOYED_AT = new Date().toISOString()

/**
 * mikrotik-script-generator v7.1.34 - ULTRA-THIN CLIENT with ROS VERSION DETECTION
 * 
 * Bootstrap is minimal (~100 lines) and uses /tool fetch to download
 * scripts from the mikrotik-scripts endpoint AFTER infrastructure is configured.
 * 
 * v7.1.34: ROUTEROS 7.x SUPPORT (hAP ax² optimization)
 *   - Auto-detects RouterOS version at runtime
 *   - Passes ros_version to mikrotik-scripts endpoint for optimized scripts
 *   - RouterOS 7.x: Reduced delays (500ms vs 2500ms), full action-processor
 *   - RouterOS 6.x: Conservative delays, reduced action-processor (<3KB)
 * 
 * v7.1.9: CRITICAL FIX - Convert newlines to \r\n in source="..."
 *   - RouterOS 6.x does NOT accept literal newlines inside source="..." in .rsc files
 *   - The parser interprets each line as a separate command, breaking syntax
 *   - mikrotik-scripts endpoint now converts \n to \\r\\n
 * 
 * v7.1.8: Use source="..." instead of source={...} for /import compatibility
 * v7.1.6: CRITICAL FIX for RouterOS 6.x 4KB variable limit
 *   - Installer now uses /import directly with .rsc files
 *   - Action processor minified to <4KB (essential handlers only)
 *   - Bypasses [/file get ... contents] 4KB truncation issue
 */

// Normalizar newlines (UTF-8 LF sem BOM/CRLF)
function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Validação de balanceamento básico
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
  const openParens = (script.match(/\(/g) || []).length;
  const closeParens = (script.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    throw new Error(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
  }
}

/**
 * v7.1.40: Block reserved networks that conflict with MikroTik factory defaults
 */
function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  const net = cidr.split('/')[0].trim()
  const base = net.replace(/\.\d+$/, '')
  if (base === '192.168.88' || net === '192.168.88.0' || net.startsWith('192.168.88.')) {
    return { 
      blocked: true, 
      reason: 'Rede 192.168.88.0/24 e reservada para gerencia do MikroTik (Winbox). Use outra rede, ex: 10.10.10.0/24.' 
    }
  }
  return { blocked: false, reason: '' }
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
  ros_version: string | null
}

interface Embarcacao {
  id: string
  nome: string
  empresa_id: string
}

/**
 * Validate RouterOS script for forbidden patterns that break during /import
 * v7.1: Ultra-thin bootstrap - no embedded scripts, so validation is simpler
 */
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    // Block ANY non-comment line >160 chars
    { regex: /^(?!\s*#).{161,}$/m, desc: 'Line >160 chars (RouterOS /import may fail)' },
    // v7.1: source={} should NOT contain complex multi-line scripts (but short source={} is OK)
  ]
  
  for (const { regex, desc } of forbiddenPatterns) {
    if (regex.test(script)) {
      if (desc.includes('>160 chars')) {
        const lines = script.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 160 && !lines[i].trim().startsWith('#')) {
            console.error(`[${context} ${VERSION}] Long line #${i + 1} (${lines[i].length} chars): ${lines[i].substring(0, 100)}...`)
          }
        }
      }
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
      console.error(`[script-generator ${VERSION}] Invalid JWT:`, claimsError)
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

    console.log(`[script-generator ${VERSION}] Generating ULTRA-THIN bootstrap for hotspot: ${hotspot_id}`)

    // Fetch hotspot with embarcacao (including ros_version)
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, interface_wifi, wan_interface, wan_type, rede, sync_token, sync_interval_minutes, max_usuarios, ros_version,
        embarcacoes!inner(id, nome, empresa_id)
      `)
      .eq('id', hotspot_id)
      .single()

    if (hotspotError || !hotspot) {
      console.error(`[script-generator ${VERSION}] Hotspot not found:`, hotspotError)
      return new Response(
        JSON.stringify({ success: false, error: 'Hotspot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // v7.1.40: Validate network is not reserved
    const networkValidation = isBlockedNetwork(hotspot.rede)
    if (networkValidation.blocked) {
      console.error(`[script-generator ${VERSION}] Blocked network: ${hotspot.rede}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: networkValidation.reason 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const embarcacao = hotspot.embarcacoes as unknown as Embarcacao

    // Generate v7.1 ULTRA-THIN bootstrap script (NO embedded scripts!)
    let bootstrapScript = generateBootstrapScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      Deno.env.get('SUPABASE_URL')!
    )

    bootstrapScript = normalizeNewlines(bootstrapScript)
    validateBalance(bootstrapScript)
    validateRouterOSScript(bootstrapScript, 'script-generator')

    // Save generated script to hotspot
    const { error: updateError } = await supabase
      .from('hotspots')
      .update({
        script_gerado: bootstrapScript,
        script_versao: hotspot.script_versao ? hotspot.script_versao + 1 : 1
      })
      .eq('id', hotspot_id)

    if (updateError) {
      console.error(`[script-generator ${VERSION}] Failed to save script:`, updateError)
    }

    // v7.1 Sanity checks - bootstrap should NOT contain embedded scripts
    if (bootstrapScript.includes('source={') && bootstrapScript.includes(':foreach')) {
      console.warn(`[script-generator ${VERSION}] Warning: Bootstrap may contain embedded script logic`)
    }

    // v7.1.36: Verify fetch+import pattern exists (dynamic tmpFile)
    if (!bootstrapScript.includes('/tool fetch') || !bootstrapScript.includes('/import $tmpFile')) {
      throw new Error('Erro critico: Bootstrap nao contem fetch+import pattern')
    }

    if (bootstrapScript.includes('source="')) {
      throw new Error('Erro: source=" invalido. Use source={ }.')
    }

    // v7.1: Sanitização
    let sanitizedBootstrap = bootstrapScript
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\n{3,}/g, '\n\n')

    console.log(`[script-generator ${VERSION}] ULTRA-THIN bootstrap generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'})`)

    return new Response(
      JSON.stringify({
        success: true,
        bootstrap_script: sanitizedBootstrap,
        finalize_script: '', // v7.1: No finalize script needed
        hotspot_name: hotspot.nome,
        wan_interface: hotspot.wan_interface || 'ether1',
        wan_type: hotspot.wan_type || 'dhcp',
        version: VERSION
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error(`[script-generator ${VERSION}] Unexpected error:`, error)
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
  const scriptsUrl = `${supabaseUrl}/functions/v1/mikrotik-scripts`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const wanInterface = hotspot.wan_interface || 'ether1'
  const wanType = hotspot.wan_type || 'dhcp'

  // v7.1: ether2 é porta de gerência fixa
  const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
  const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))

  const migrationCommands = migrationOrder.map((port) => {
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
:do { /interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan" } on-error={}
:log info "NAVSPOT: ${port} migrada"
:delay 500ms`
  }).join('\n\n')

  // WAN config
  const wanConfig = wanType === 'dhcp' 
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`

  // v7.1.1: Bootstrap with retry, route/DNS checks
  return `# =========================================
# NAVSPOT Bootstrap Script v${VERSION} - ULTRA-THIN
# Scripts baixados via API (sem source={} embutido)
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT v${VERSION}: Iniciando bootstrap ULTRA-THIN..."

# 0. CLEANUP
:log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."
:do { /file remove [find where name="navspot-token.txt"] } on-error={}
:do { /file remove [find where name="navspot-resp.txt"] } on-error={}
:do { /file remove [find where name="navspot-recovery.rsc"] } on-error={}
:do { /file remove [find where name="ns-install.rsc"] } on-error={}
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
:do { /ip hotspot remove [find name="hs-navspot"] } on-error={}
:do { /ip hotspot profile remove [find name="hsprof-navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip pool remove [find name="hs-pool-navspot"] } on-error={}
:do { /ip address remove [find comment="navspot"] } on-error={}
:do { /ip firewall nat remove [find comment="navspot-nat"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment="navspot-initial"] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment="navspot-initial"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
:delay 2s
:log info "NAVSPOT v${VERSION}: Cleanup concluido"

# 1. VALIDACAO WAN
:local wanIf [/interface find name="${wanInterface}"]
:if ([:len $wanIf] = 0) do={
:log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
:error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 2. CONFIGURAR DNS (ANTES de tudo - necessario para fetch)
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1
:log info "NAVSPOT: DNS configurado (8.8.8.8, 1.1.1.1)"

# 3. CONFIGURAR WAN
# v7.1.40: Garantir que WAN nao esta em nenhuma bridge (alguns firmwares incluem ether1 na bridge padrao)
:do { /interface bridge port remove [find interface=${wanInterface}] } on-error={}
${wanConfig}

# 4. IDENTIDADE
/system identity set name="${embarcacao.nome}"

# 4.5. GUARDRAIL: Verificar conflito de rede ANTES de criar bridge1 (v7.1.40)
:local networkBase "${networkBase}"
:local conflict false
:foreach addr in=[/ip address find] do={
:local addrStr [/ip address get $addr address]
# v7.1.40: Usar operador regex para match robusto em ROS 7
:if ($addrStr ~ ("^" . $networkBase . "\\\\.")) do={
:set conflict true
:log error ("NAVSPOT v${VERSION}: CONFLITO - IP " . $addrStr . " ja existe na faixa " . $networkBase . ".x!")
}
}
:if ($conflict = true) do={
:log error "NAVSPOT v${VERSION}: ABORTANDO - Rede em uso"
:log error "NAVSPOT v${VERSION}: Altere a rede do hotspot no painel para outra faixa"
:error "NAVSPOT_ABORT_NETWORK_CONFLICT"
}
:log info "NAVSPOT v${VERSION}: Guardrail OK - nenhum conflito de rede"

# 5. CRIAR BRIDGE1
:do { /interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot" } on-error={}
:delay 1s
:log info "NAVSPOT: Bridge1 criada"

# 6. CONFIGURAR REDE
:do { /ip address add address=${gateway}/24 interface=bridge1 comment="navspot" } on-error={}
:do { /ip pool add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd} } on-error={}
:do { /ip dhcp-server network add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot" } on-error={}
:do { /ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no } on-error={}
:log info "NAVSPOT: Rede IP configurada"

# 7. NAT
:do { /ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat" } on-error={}
:log info "NAVSPOT: NAT configurado"

# 8. GERENCIA WINBOX
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
:do { /interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery" } on-error={}
/ip neighbor discovery-settings set discover-interface-list=mgmt
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
# v7.1.2: regras de gerencia sem place-before (evita erro em roteadores limpos)
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt"
:do { /ip firewall filter remove [find comment="navspot-allow-mndp-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt"
:log info "NAVSPOT: Gerencia configurada"

# 9. MIGRAR PORTAS LAN
:log info "NAVSPOT: Migrando portas LAN..."
${migrationCommands}
:log info "NAVSPOT: Portas LAN migradas"

# 9.5. MIGRAR INTERFACES WIFI (v7.1.40 - hAP ax² / WifiWave2)
:log info "NAVSPOT v${VERSION}: Verificando interfaces WiFi..."
:local wifiCount 0
# Tentar WifiWave2 (ROS 7.x - hAP ax²)
:do {
:foreach i in=[/interface wifi find] do={
:local wName [/interface wifi get $i name]
:log info ("NAVSPOT: Detectada interface WifiWave2: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
# v7.1.40: Delay para kernel processar mudanca de estado do radio
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
# Fallback: Tentar wireless legacy (ROS 6.x)
:if ($wifiCount = 0) do={
:do {
:foreach i in=[/interface wireless find] do={
:local wName [/interface wireless get $i name]
:log info ("NAVSPOT: Detectada interface wireless legacy: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
}
:if ($wifiCount > 0) do={
:log info ("NAVSPOT: " . $wifiCount . " interface(s) WiFi migrada(s) para bridge1")
} else={
:log info "NAVSPOT: Nenhuma interface WiFi detectada"
}

# 10. HOTSPOT MINIMO v7.1.46 (SEM login-url - sera configurada via sync)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}
# v7.1.46: Garantir login-by correto desde o inicio
/ip hotspot profile set [find name="hsprof-navspot"] login-by="cookie,http-pap"
:log info "NAVSPOT v${VERSION}: login-by=cookie,http-pap aplicado"
:do { /ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no } on-error={}
:log info "NAVSPOT v${VERSION}: Hotspot criado (aguardando config via sync)"

# 11. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token salvo"

# 12. AGUARDAR ESTABILIZACAO DA REDE (15s v7.1.1)
:log info "NAVSPOT v${VERSION}: Aguardando 15s para rede estabilizar..."
:delay 15s

# 12.1. VERIFICAR ROTA DEFAULT
:local hasRoute false
:do {
:local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
:if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = false) do={
:log warning "NAVSPOT v${VERSION}: Rota default NAO encontrada - fetch pode falhar"
} else={
:log info "NAVSPOT v${VERSION}: Rota default OK"
}

# 12.2. VERIFICAR DNS
:local dnsOk false
:do {
:local resolved [:resolve "focqrhkozhdefohroqyi.supabase.co"]
:if ([:len $resolved] > 0) do={ :set dnsOk true }
} on-error={}
:if ($dnsOk = false) do={
:log warning "NAVSPOT v${VERSION}: DNS NAO resolvido - tentando fetch mesmo assim"
} else={
:log info "NAVSPOT v${VERSION}: DNS OK"
}

# 13. DETECTAR VERSAO DO ROUTEROS DE FORMA ROBUSTA (v7.1.36)
:local rosVer [/system resource get version]
:local dotIndex [:find $rosVer "."]
:local rosMajor $rosVer
:if ($dotIndex != 0) do={ :set rosMajor [:pick $rosVer 0 $dotIndex] }
:local rosV "6"
:if ($rosMajor = "7") do={
:set rosV "7"
:log info ("NAVSPOT v${VERSION}: RouterOS " . $rosVer . " detectado - modo otimizado")
} else={
:log info ("NAVSPOT v${VERSION}: RouterOS " . $rosVer . " detectado - modo compatibilidade")
}

# 14. BAIXAR E INSTALAR SCRIPTS VIA API COM RETRY
:local apiBase "${scriptsUrl}"
:local tk "${hotspot.sync_token}"

# v7.1.36: Arquivo temporario unico para evitar conteudo residual
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local tmpFile ("ns-install-" . $tsStr . ".rsc")

# Construir URL com ros_version detectado em runtime
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk . "&ros_version=" . $rosV)

# v7.1.36: Backoff variavel baseado na versao
:local retryDelay 5s
:if ($rosV = "7") do={ :set retryDelay 2s }

:local maxRetries 3
:local retryCount 0
:local fetchSuccess false

:log info ("NAVSPOT v${VERSION}: Iniciando download (tmpFile=" . $tmpFile . ")...")

:while (($retryCount < $maxRetries) && ($fetchSuccess = false)) do={
:set retryCount ($retryCount + 1)
:log info ("NAVSPOT v${VERSION}: Tentativa " . $retryCount . "/" . $maxRetries)
:do {
/tool fetch url=$scriptsUrl check-certificate=no dst-path=$tmpFile
:set fetchSuccess true
} on-error={
:log warning ("NAVSPOT v${VERSION}: Fetch falhou na tentativa " . $retryCount)
:if ($retryCount < $maxRetries) do={
:delay $retryDelay
}
}
}

:if ($fetchSuccess = true) do={
# v7.1.36: Delay pos-fetch baseado na versao (ROS 7 = 500ms, ROS 6 = 4s)
:if ($rosV = "7") do={ :delay 500ms } else={ :delay 4s }
:log info ("NAVSPOT v${VERSION}: Importando " . $tmpFile . "...")
/import $tmpFile
:delay 1s
:do { /file remove $tmpFile } on-error={ :log warning "NAVSPOT: nao foi possivel remover arquivo temporario" }
:log info "NAVSPOT v${VERSION}: Scripts instalados com sucesso!"

# 15. PRIMEIRO SYNC (delay baseado na versao)
:if ($rosV = "7") do={
:log info "NAVSPOT v${VERSION}: Aguardando 20s para primeiro sync (ROS 7)..."
:delay 20s
} else={
:log info "NAVSPOT v${VERSION}: Aguardando 35s para primeiro sync (ROS 6)..."
:delay 35s
}
/system script run navspot-sync
:log info "NAVSPOT v${VERSION}: Primeiro sync executado!"

:log info "=========================================="
:log info "NAVSPOT v${VERSION}: BOOTSTRAP ULTRA-THIN CONCLUIDO!"
:log info ("Arquitetura: Fetch + Import (ros_version=" . $rosV . ")")
:log info "Rede: ${networkCidr} | Gateway: ${gateway}"
:log info "WAN: ${wanInterface} (${wanType})"
:log info "Hotspot: hs-navspot (aguardando login-url via sync)"
:log info "Gerencia: ether2 (Winbox/MNDP)"
:log info "=========================================="
} else={
:log error "NAVSPOT v${VERSION}: FALHA CRITICA - Fetch falhou apos 3 tentativas"
:log error "NAVSPOT v${VERSION}: Verifique conectividade e execute manualmente:"
:log error ("NAVSPOT v${VERSION}: /tool fetch url=<API_URL>&ros_version=" . $rosV)
:log error "NAVSPOT v${VERSION}: /import ns-install-<timestamp>.rsc"
}
`
}
