import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "7.0.0"
const DEPLOYED_AT = new Date().toISOString()

// v7.0: No more runtime placeholders needed - login-url comes via sync API
// Bootstrap is minimal and clean, no complex strings

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

/**
 * Validate RouterOS script for forbidden patterns that break during /import
 * v7.0: Simplified - no more runtime var escapes needed in bootstrap
 */
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    // Nested brackets with command inside conditional - THIS BREAKS RouterOS 6.x
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets in conditional)' },
    // comment~ instead of comment= for partial matching
    { regex: /comment~"/, desc: 'comment~ (must use comment= for exact match)' },
    // v7.0: Block any login-url= with runtime vars in bootstrap (they come via sync now)
    { regex: /login-url=.*\$\(/, desc: 'login-url with $(var) - must come via sync API in v7.0' },
    // Block local variables starting with underscore
    { regex: /^:local\s+_/m, desc: 'Local var starts with underscore (RouterOS 6.x /import may fail)' },
    // Block ANY non-comment line >160 chars
    { regex: /^(?!\s*#).{161,}$/m, desc: 'Line >160 chars (RouterOS /import may fail)' },
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

    console.log(`[script-generator ${VERSION}] Generating MINIMAL bootstrap for hotspot: ${hotspot_id}`)

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
      console.error(`[script-generator ${VERSION}] Hotspot not found:`, hotspotError)
      return new Response(
        JSON.stringify({ success: false, error: 'Hotspot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const embarcacao = hotspot.embarcacoes as unknown as Embarcacao

    // Generate v7.0 MINIMAL bootstrap script
    let bootstrapScript = generateBootstrapScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      Deno.env.get('SUPABASE_URL')!
    )

    // v7.0: No more placeholder replacement needed - bootstrap is clean
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

    // v7.0 Sanity checks
    if (!bootstrapScript.includes('navspot-sync') || !bootstrapScript.includes('navspot-action-processor')) {
      throw new Error('Erro critico: scripts navspot nao foram gerados')
    }

    if (!bootstrapScript.includes('navspot-guardian')) {
      throw new Error('Erro critico: navspot-guardian nao foi gerado')
    }

    // v7.0: Verify token fallback is embedded
    if (!bootstrapScript.includes('token fallback embutido')) {
      throw new Error('Erro critico: token fallback nao foi embutido no sync')
    }

    // v7.0: Verify configure_hotspot_profile handler exists
    if (!bootstrapScript.includes('configure_hotspot_profile')) {
      throw new Error('Erro critico: handler configure_hotspot_profile nao foi gerado')
    }

    // v7.0: Verify NO login-url with runtime vars in bootstrap
    if (bootstrapScript.includes('login-url=') && bootstrapScript.includes('$(mac)')) {
      throw new Error('Erro critico: login-url com $(mac) no bootstrap - deve vir via sync')
    }

    if (bootstrapScript.includes('source="')) {
      throw new Error('Erro: source=" invalido. Use source={ }.')
    }

    // v7.0: Sanitização
    let sanitizedBootstrap = bootstrapScript
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\n{3,}/g, '\n\n')

    console.log(`[script-generator ${VERSION}] MINIMAL bootstrap generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'})`)

    return new Response(
      JSON.stringify({
        success: true,
        bootstrap_script: sanitizedBootstrap,
        finalize_script: '', // v7.0: No finalize script needed
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
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const syncIntervalMinutes = hotspot.sync_interval_minutes || 5
  const wanInterface = hotspot.wan_interface || 'ether1'
  const wanType = hotspot.wan_type || 'dhcp'

  // v7.0: ether2 é porta de gerência fixa
  const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
  const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))

  const migrationCommands = migrationOrder.map((port) => {
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "NAVSPOT: ${port} migrada"
:delay 500ms`
  }).join('\n\n')

  // WAN config
  const wanConfig = wanType === 'dhcp' 
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`

  // v7.0: Sync script com JSON incremental + token fallback
  const syncScriptSource = `:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
:set token "${hotspot.sync_token}"
:log warning "NAVSPOT-SYNC: Usando token fallback embutido"
}
:local syncUrl "${syncUrl}"
:local users ""
:local registered ""
:local profiles ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
/ip hotspot user profile
:foreach p in=[find] do={
:local pname [get $p name]
:set profiles ($profiles . $pname . ",")
}
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q)
:set body ($body . ":" . $q . $users . $q)
:set body ($body . "," . $q . "registered_users_csv" . $q)
:set body ($body . ":" . $q . $registered . $q)
:set body ($body . "," . $q . "registered_profiles_csv" . $q)
:set body ($body . ":" . $q . $profiles . $q . "}")
:local hdr "Content-Type: application/json"
:do {
/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field=$hdr dst-path="navspot-resp.txt"
:delay 500ms
:local resp [/file get "navspot-resp.txt" contents]
:do { /file remove "navspot-resp.txt" } on-error={}
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={:set j ($j - 1)}
:local actions ""
:if ($j >= $i) do={:set actions [:pick $raw $i ($j + 1)]}
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:delay 250ms
/system script run navspot-action-processor
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`

  // v7.0: Action Processor com handler configure_hotspot_profile
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
# v7.0: configure_hotspot_profile - Configura profile via sync (runtime)
:if ($cmd = "configure_hotspot_profile") do={
:local p2 [:find $rest "|"]
:local loginUrl [:pick $rest 0 $p2]
:local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
:do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
:log info ("NAVSPOT v7.0: Hotspot profile configurado via sync - " . $dnsName)
} else={
:log error "NAVSPOT: Hotspot profile hsprof-navspot NAO ENCONTRADO"
}
}
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={
:set pShared [:pick $sub2 0 $p4]
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
:log warning ("NAVSPOT: Perfil " . $uProf . " nao existe. Criando...")
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
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName) } on-error={}
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
}
}
:if ($cmd = "add_firewall_block") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=none comment=("navspot-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall block - " . $domain . " -> " . $resolvedIp)
}
} on-error={:log warning ("NAVSPOT: Failed to resolve " . $domain)}
}
}
:if ($cmd = "add_firewall_allow") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
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

  // v7.0: Guardian verifica se login-url esta configurada
  const guardianScriptSource = `:log info "NAVSPOT-GUARDIAN v${VERSION}: Verificando integridade..."
:local needsRepair 0
:local missing ""
:local syncScript [/system script find name="navspot-sync"]
:local apScript [/system script find name="navspot-action-processor"]
:local syncSched [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $syncScript] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-sync ")
}
:if ([:len $apScript] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-action-processor ")
}
:if ([:len $syncSched] = 0) do={
:set needsRepair 1
:set missing ($missing . "navspot-sync-scheduler ")
}
# v7.0: Verificar se login-url esta configurada
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof] > 0) do={
:set loginUrl [/ip hotspot profile get $hsprof login-url]
}
:if ([:len $loginUrl] < 10) do={
:set needsRepair 1
:set missing ($missing . "login-url-incomplete ")
:log warning "NAVSPOT-GUARDIAN v7.0: login-url incompleta - forcando sync"
}
# v7.0: Check version marker
:if (($needsRepair = 0) && ([:len $apScript] > 0)) do={
:local apSource [/system script get $apScript source]
:if ([:find $apSource "configure_hotspot_profile"] < 0) do={
:set needsRepair 1
:set missing ($missing . "action-processor-outdated ")
:log warning "NAVSPOT-GUARDIAN: action-processor sem configure_hotspot_profile"
}
}
:if ($needsRepair = 1) do={
:log warning ("NAVSPOT-GUARDIAN: Componentes faltando: " . $missing)
:global navspotLastRepair
:local now [/system clock get time]
:local canRepair 1
:if ($canRepair = 1) do={
:log info "NAVSPOT-GUARDIAN: Iniciando reparo automatico..."
:do {
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
:set token "${hotspot.sync_token}"
:log warning "NAVSPOT-GUARDIAN: Usando token fallback embutido"
}
:local recoveryUrl "${recoveryUrl}"
:local body ("{\\"sync_token\\":\\"" . $token . "\\"}")
/tool fetch url=$recoveryUrl mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" dst-path="navspot-recovery.rsc"
:delay 2s
:local recoveryFile [/file find name~"navspot-recovery.rsc"]
:if ([:len $recoveryFile] > 0) do={
/import navspot-recovery.rsc
:set navspotLastRepair $now
:log info "NAVSPOT-GUARDIAN: Reparo concluido com sucesso!"
:do { /file remove "navspot-recovery.rsc" } on-error={}
} else={
:log warning "NAVSPOT-GUARDIAN: Falha ao baixar recovery"
}
} on-error={:log error "NAVSPOT-GUARDIAN: Erro no reparo automatico"}
}
} else={
:log info "NAVSPOT-GUARDIAN v${VERSION}: Sistema integro"
}`

  // v7.0: Bootstrap MÍNIMO - sem login-url, sem walled-garden complexo
  return `# =========================================
# NAVSPOT Bootstrap Script v${VERSION} - MINIMAL EDITION
# Apenas infraestrutura. Configuracao complexa vem via API sync.
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT v${VERSION}: Iniciando bootstrap MINIMO..."

# 0. CLEANUP AGRESSIVO - Remove instalacoes anteriores
:log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."
:do { /file remove [find where name~"navspot"] } on-error={}
:do { /system script remove [find where name~"navspot"] } on-error={}
:do { /system scheduler remove [find where name~"navspot"] } on-error={}
:do { /tool netwatch remove [find where comment~"navspot"] } on-error={}
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
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
# Remove configs de fabrica tambem
:do { /ip dhcp-server remove [find name="defconf"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp1"] } on-error={}
:do { /ip pool remove [find name="default-dhcp"] } on-error={}
:delay 2s
:log info "NAVSPOT v${VERSION}: Cleanup concluido"

# 1. VALIDACAO WAN
:local wanIf [/interface find name="${wanInterface}"]
:if ([:len $wanIf] = 0) do={
:log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
:error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 2. CONFIGURAR DNS (ANTES de tudo - necessario para sync)
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
:log info "NAVSPOT: DNS configurado"

# 3. CONFIGURAR WAN
${wanConfig}

# 4. IDENTIDADE
/system identity set name="${embarcacao.nome}"

# 5. CRIAR BRIDGE1
/interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot"
:delay 1s
:log info "NAVSPOT: Bridge1 criada"

# 6. CONFIGURAR REDE
/ip address add address=${gateway}/24 interface=bridge1 comment="navspot"
/ip pool add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd}
/ip dhcp-server network add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot"
/ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no
:log info "NAVSPOT: Rede IP configurada"

# 7. NAT
/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat"
:log info "NAVSPOT: NAT configurado"

# 8. GERENCIA WINBOX
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
/interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery"
/ip neighbor discovery-settings set discover-interface-list=mgmt
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0
:do { /ip firewall filter remove [find comment="navspot-allow-mndp-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt" place-before=0
:log info "NAVSPOT: Gerencia configurada"

# 9. HOTSPOT MINIMO v7.0 (SEM login-url - sera configurada via sync)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT v7.0: Hotspot criado (aguardando config via sync)"

# 10. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token salvo"

# 11. ACTION PROCESSOR v7.0 (com handler configure_hotspot_profile)
:log info "NAVSPOT: Criando action-processor v${VERSION}..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
:delay 200ms

# 12. SYNC SCRIPT (token fallback embutido)
:log info "NAVSPOT: Criando sync v${VERSION}..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
:delay 200ms

# 13. GUARDIAN v7.0 (verifica login-url)
:log info "NAVSPOT: Criando guardian v${VERSION}..."
/system script add name="navspot-guardian" policy=read,write,test source={
${guardianScriptSource}
}

# 14. SCHEDULERS
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
:log info "NAVSPOT: Schedulers criados"

# 15. NETWATCH
/tool netwatch add host=8.8.8.8 interval=30s up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT: Netwatch configurado"

# 16. MIGRAR PORTAS LAN
:log info "NAVSPOT: Migrando portas LAN..."
${migrationCommands}
:log info "NAVSPOT: Portas LAN migradas"

# 17. PRIMEIRO SYNC (45s delay para rede estabilizar)
:log info "NAVSPOT v${VERSION}: Aguardando 45s para primeiro sync..."
:delay 45s
/system script run navspot-sync
:log info "NAVSPOT v${VERSION}: Primeiro sync executado!"

:log info "=========================================="
:log info "NAVSPOT v${VERSION}: BOOTSTRAP MINIMO CONCLUIDO!"
:log info "Arquitetura: Thin Client - config via sync API"
:log info "Rede: ${networkCidr} | Gateway: ${gateway}"
:log info "WAN: ${wanInterface} (${wanType})"
:log info "Hotspot: hs-navspot (aguardando login-url via sync)"
:log info "Sync: a cada ${syncIntervalMinutes}m | Guardian: a cada 10m"
:log info "Gerencia: ether2 (Winbox/MNDP)"
:log info "=========================================="
`
}
