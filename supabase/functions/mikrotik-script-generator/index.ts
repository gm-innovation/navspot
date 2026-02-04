import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "6.9.41"
const DEPLOYED_AT = new Date().toISOString()

// v6.9.37: Placeholders para runtime vars - evita erros de escaping
const RUNTIME_PLACEHOLDERS = {
  mac: '@@RUNTIME_MAC@@',
  ip: '@@RUNTIME_IP@@',
  linkLoginOnly: '@@RUNTIME_LINK_LOGIN_ONLY@@',
} as const;

// v6.9.41: Substituir placeholders por hex escape \24 (RouterOS /import compatible)
// RouterOS 6.x parser rejects \$( during /import - use \24 (hex for $, ASCII 36 = 0x24)
function replaceRuntimePlaceholders(script: string): string {
  const map: Record<string, string> = {
    '@@RUNTIME_MAC@@': '\\24(mac)',
    '@@RUNTIME_IP@@': '\\24(ip)',
    '@@RUNTIME_LINK_LOGIN_ONLY@@': '\\24(link-login-only)',
  };
  return Object.entries(map).reduce(
    (s, [ph, val]) => s.replace(new RegExp(ph, 'g'), val),
    script
  );
}

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
 * 
 * v6.9.27: The problematic pattern is `:if ([:len [/...` where a command is INSIDE
 * a [:len [...]] construct INSIDE an :if condition. This breaks RouterOS 6.x parser.
 * 
 * SAFE pattern: `:local varName [/... find ...]` followed by `:if ([:len $varName]...`
 * This works because the command is executed BEFORE the conditional check.
 */
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    // Nested brackets with command inside conditional - THIS BREAKS RouterOS 6.x
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets in conditional)' },
    // comment~ instead of comment= for partial matching (often causes issues)
    { regex: /comment~"/, desc: 'comment~ (must use comment= for exact match)' },
    // *.apple.com wildcard breaks RouterOS 6.x parser during /import
    { regex: /dst-host="\*\.apple\.com"/, desc: '*.apple.com (breaks RouterOS 6.x parser during /import)' },
    // v6.9.31: Block *.supabase.* wildcards - they break RouterOS 6.x parser inside [find ...]
    { regex: /dst-host="\*\.supabase\.(co|in)"/, desc: '*.supabase.* wildcard (breaks RouterOS 6.x parser - use explicit hostname)' },
    // v6.9.35: Block unescaped runtime vars $(mac) inside login-url strings
    // Note: Local script vars like "$fullUrl" are ALLOWED - they get expanded by script engine
    { regex: /login-url="[^"]*(?<![\\])\$\([^)]+\)/, desc: 'login-url="...$(var)..." (unescaped runtime var breaks /import - use \\24(...))' },
    // v6.9.41: Block \$( which doesn't work in RouterOS 6.x /import - use \24( hex escape instead
    { regex: /\\\$\(/, desc: '\\$( is invalid in RouterOS /import (use \\24( hex escape for $ - ASCII 36 = 0x24)' },
    // v6.9.37: Block escaped local variables - só runtime vars devem ter escape (now using \24)
    { regex: /\\24(?:urlBase|fullUrl|hsprof|urlVars[123])/, desc: 'Escaped local variable (use $urlBase not \\24urlBase - only runtime vars like \\24(mac) need escape)' },
    // v6.9.40: Block local variables starting with underscore - RouterOS 6.x parser issue
    { regex: /^:local\s+_/m, desc: 'Local var starts with underscore (RouterOS 6.x /import may fail - use hsprof not _hsprof)' },
    // v6.9.37: Block leftover placeholders - ensure all were replaced
    { regex: /@@RUNTIME_[A-Z_]+@@/, desc: 'Unreplaced runtime placeholder (call replaceRuntimePlaceholders before validation)' },
    // v6.9.37: Block double-escaped runtime vars (now using \24)
    { regex: /\\\\24\(/, desc: 'Double-escaped hex runtime var (\\\\24(mac) should be \\24(mac))' },
    // v6.9.38: Block ANY non-comment line >160 chars (RouterOS /import practical limit)
    { regex: /^(?!\s*#).{161,}$/m, desc: 'Line >160 chars (RouterOS /import may fail - split into multiple commands)' },
  ]
  
  for (const { regex, desc } of forbiddenPatterns) {
    if (regex.test(script)) {
      // v6.9.38: Log the actual long line for debugging
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

    console.log(`[script-generator ${VERSION}] Generating bootstrap script for hotspot: ${hotspot_id}`)

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

    // Generate v6.9.38 single bootstrap script with placeholder replacement
    let bootstrapScript = generateBootstrapScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      Deno.env.get('SUPABASE_URL')!
    )
    
    // v6.9.2: Script único - sem necessidade de navspot-finalize
    const finalizeScript = ''

    // v6.9.37: Apply placeholder replacement, normalize and validate
    bootstrapScript = replaceRuntimePlaceholders(bootstrapScript)
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

    // v6.9.21: Sanity checks - now using set-or-add pattern with token fallback
    // Scripts are created via conditional set/add, not simple add
    if (!bootstrapScript.includes('navspot-sync') || !bootstrapScript.includes('navspot-action-processor')) {
      throw new Error('Erro critico: scripts navspot nao foram gerados')
    }

    if (!bootstrapScript.includes('navspot-guardian')) {
      throw new Error('Erro critico: navspot-guardian nao foi gerado')
    }

    // v6.9.21: Verify token fallback is embedded
    if (!bootstrapScript.includes('token fallback embutido')) {
      throw new Error('Erro critico: token fallback nao foi embutido no sync')
    }

    if (bootstrapScript.includes('/ip hotspot user profile set') && 
        bootstrapScript.includes('limit-bytes-total')) {
      console.error(`[script-generator ${VERSION}] ERRO: Gerou limit-bytes-total em /ip hotspot user profile. Deve ser em /ip hotspot user.`)
    }

    if (bootstrapScript.includes('source="')) {
      throw new Error('Erro: source=" invalido. Use source={ }.')
    }

    if (bootstrapScript.includes(':do {/')) {
      console.error(`[script-generator ${VERSION}] ERRO: Gerou ":do {/". Corrigir para ":do { /".`)
    }

    // v6.9.3: Verificar políticas inválidas
    if (bootstrapScript.includes('policy=read,write,policy,test')) {
      throw new Error('Erro critico: policy token invalido. Use policy=read,write,test')
    }

    // v6.9.3: Verificar scheduler com comando completo
    if (bootstrapScript.includes('on-event="navspot-sync"') && 
        !bootstrapScript.includes('on-event="/system script run navspot-sync"')) {
      console.warn(`[script-generator ${VERSION}] AVISO: scheduler deve usar comando completo em on-event`)
    }

    // v6.9.4: action=deny é VÁLIDO para /ip hotspot walled-garden (hostnames)
    // action=reject é VÁLIDO para /ip hotspot walled-garden ip (IPs)
    // Verificar apenas que não há mistura incorreta
    if (bootstrapScript.includes('walled-garden ip') && bootstrapScript.includes('walled-garden ip add') && bootstrapScript.match(/walled-garden ip add[^;]*action=deny/)) {
      console.warn(`[script-generator ${VERSION}] AVISO: action=deny no menu ip pode estar incorreto. Use action=reject para IPs.`)
    }
    if (bootstrapScript.match(/walled-garden add[^i][^;]*action=reject/) && !bootstrapScript.match(/walled-garden ip add/)) {
      console.warn(`[script-generator ${VERSION}] AVISO: action=reject no menu de hostnames pode estar incorreto. Use action=deny.`)
    }

    // v6.8: Sanitização - garantir apenas LF (sem CRLF) e converter tabs
    let sanitizedBootstrap = bootstrapScript
      .replace(/\r\n/g, '\n')  // CRLF -> LF
      .replace(/\r/g, '\n')    // CR -> LF
      .replace(/\t/g, '  ')    // Tab -> 2 espaços

    // Remover linhas vazias consecutivas (mais de 2)
    sanitizedBootstrap = sanitizedBootstrap.replace(/\n{3,}/g, '\n\n')

    let sanitizedFinalize = finalizeScript
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\n{3,}/g, '\n\n')

    console.log(`[script-generator ${VERSION}] Bootstrap script generated for ${hotspot.nome} (WAN: ${hotspot.wan_interface || 'ether1'}, Type: ${hotspot.wan_type || 'dhcp'})`)

    return new Response(
      JSON.stringify({
        success: true,
        bootstrap_script: sanitizedBootstrap,
        finalize_script: sanitizedFinalize,
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

function generateFinalizeScript(_hotspot: Hotspot): string {
  // v6.9.2: Fluxo simplificado - ether2 permanece como gerência fixa
  // Não há mais necessidade de script de finalização
  return ''
}

function generateBootstrapScript(
  hotspot: Hotspot,
  embarcacao: Embarcacao,
  supabaseUrl: string
): string {
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  // v6.9.31: Extract explicit backend hostname (avoids *.supabase.* wildcards that break RouterOS parser)
  const backendHost = new URL(supabaseUrl).hostname
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
  // v6.9.38: Escape dnsName for safe use in quotes
  const dnsName = `${hotspotSlug}.navspot.local`.replace(/"/g, '\\"')
  // v6.9.38: URL-encode hotspot.id for safe URL construction
  const hotspotIdSafe = encodeURIComponent(hotspot.id)

  // v6.9.2: ether2 é porta de gerência fixa - NUNCA entra na bridge
  // Apenas ether3, 4, 5 serão portas do Hotspot
  const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
  const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))

  // Gerar comandos de migração com delays
  const migrationCommands = migrationOrder.map((port) => {
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "NAVSPOT: ${port} migrada"
:delay 500ms`
  }).join('\n\n')

  // v6.9.38: Script sync com JSON incremental (evita linha >160 chars) + TOKEN FALLBACK EMBUTIDO
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
# v6.9.38: Construir JSON incrementalmente (linhas <100 chars cada)
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q)
:set body ($body . ":" . $q . $users . $q)
:set body ($body . "," . $q . "registered_users_csv" . $q)
:set body ($body . ":" . $q . $registered . $q)
:set body ($body . "," . $q . "registered_profiles_csv" . $q)
:set body ($body . ":" . $q . $profiles . $q . "}")
# v6.9.38: Fetch usando variavel local para header (evita linha >160)
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
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`

  // v6.9.27: Action Processor - SIMPLIFIED
  // Uses direct commands with on-error={} - NO [:len [/... find ...]] patterns
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
 :local profExists [/ip hotspot user profile find name=$uProf]
 :if ([:len $profExists] = 0) do={
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
# v6.9.27: create_whitelist_domain - Direct add with on-error (handles duplicates)
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
# v6.9.27: create_blacklist_domain - Direct add with on-error (handles duplicates)
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName) } on-error={}
:log info ("NAVSPOT: Blacklist bloqueado (walled-garden) - " . $domain)
}
}
# v6.9.27: add_firewall_block - Direct commands only
:if ($cmd = "add_firewall_block") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=none comment=("navspot-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall block - " . $domain . " -> " . $resolvedIp)
}
} on-error={
:log warning ("NAVSPOT: Failed to resolve " . $domain)
}
}
}
# v6.9.27: add_firewall_allow - Direct commands only
:if ($cmd = "add_firewall_allow") do={
:local domain $rest
:if ([:len $domain] > 0) do={
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:do { /ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=none comment=("navspot-allow-" . $domain) } on-error={}
:log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
}
} on-error={
:log warning ("NAVSPOT: DNS failed for " . $domain . " - using Walled Garden only")
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
:log info "NAVSPOT-ACTION v${VERSION}: Processamento concluido"`

  // Configuração WAN com remoção prévia do DHCP client existente
  const wanConfig = wanType === 'dhcp' 
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`

  // v6.9.21: Recovery URL for guardian
  const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`

  // v6.9.27: Guardian script source - RUNTIME script, no /import restrictions apply here
  // NOTE: Since this is a runtime script (executed by scheduler, not by /import),
  // the [:len [/...]] pattern works fine. But for consistency and safety, we still
  // use direct find with local variable assignment to avoid any potential issues.
  const guardianScriptSource = `:log info "NAVSPOT-GUARDIAN v${VERSION}: Verificando integridade..."
:local needsRepair 0
:local missing ""
# v6.9.27: Verificar scripts essenciais usando find direto
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
# v6.9.27: Check version markers using pre-fetched script handles
:if (($needsRepair = 0) && ([:len $apScript] > 0)) do={
:local apSource [/system script get $apScript source]
:if ([:find $apSource "NAVSPOT-BLACKLIST"] < 0) do={
:set needsRepair 1
:set missing ($missing . "action-processor-outdated ")
:log warning "NAVSPOT-GUARDIAN: action-processor desatualizado (falta NAVSPOT-BLACKLIST)"
}
}
:if (($needsRepair = 0) && ([:len $syncScript] > 0)) do={
:local syncSource [/system script get $syncScript source]
:if ([:find $syncSource "token fallback embutido"] < 0) do={
:set needsRepair 1
:set missing ($missing . "sync-outdated-no-fallback ")
:log warning "NAVSPOT-GUARDIAN: sync desatualizado (falta fallback de token)"
}
}
:if ($needsRepair = 1) do={
:log warning ("NAVSPOT-GUARDIAN: Componentes faltando: " . $missing)
:global navspotLastRepair
:local now [/system clock get time]
:local canRepair 1
:if ([:typeof $navspotLastRepair] != "nothing") do={
:log info "NAVSPOT-GUARDIAN: Verificando cooldown..."
}
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
} on-error={
:log error "NAVSPOT-GUARDIAN: Erro no reparo automatico"
}
}
} else={
:log info "NAVSPOT-GUARDIAN: Sistema integro v${VERSION}"
}`

  // Bootstrap script v6.9.38 - Short commands, no lines >160 chars
  return `# NAVSPOT Bootstrap Script v${VERSION}
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT v${VERSION}: Iniciando instalacao..."

# 0. VALIDACAO INICIAL (v6.9.27: using local variable to avoid nested brackets)
:local wanIf [/interface find name="${wanInterface}"]
:if ([:len $wanIf] = 0) do={
  :log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
  :error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 1. LIMPEZA INICIAL (configs de fabrica + rede navspot - NAO remove scripts!)
# v6.9.23: Scripts/schedulers sao atualizados via set-or-add, nao removidos aqui
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
 # v6.9.27: Cleanup walled-garden entries using EXACT comment match (avoid comment~)
 :do { /ip hotspot walled-garden remove [find comment="navspot-portal"] } on-error={}
 :do { /ip hotspot walled-garden remove [find comment="navspot-api"] } on-error={}
 :do { /ip hotspot walled-garden remove [find comment="navspot-cdn"] } on-error={}
 :do { /ip hotspot walled-garden remove [find comment="navspot-cpd-android"] } on-error={}
 :do { /ip hotspot walled-garden remove [find comment="navspot-cpd-windows"] } on-error={}
 :do { /ip hotspot walled-garden remove [find comment="navspot-cpd-apple"] } on-error={}
 :do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-udp"] } on-error={}
 :do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-tcp"] } on-error={}
 :do { /ip hotspot walled-garden ip remove [find comment="navspot-dhcp"] } on-error={}
 :do { /ip hotspot walled-garden ip remove [find comment="navspot-ntp"] } on-error={}
 :do { /ip hotspot walled-garden ip remove [find comment="navspot-icmp"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
:do { /file remove "navspot-token.txt" } on-error={}
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
:delay 2s
:log info "NAVSPOT: Limpeza concluida (scripts preservados) v${VERSION}"

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

# 6.5. GERENCIA WINBOX / NEIGHBOR DISCOVERY
# v6.9.27: Criar lista de interfaces de gestao usando direct add (on-error para duplicatas)
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
:do { /interface list member remove [find list="mgmt" interface=ether2] } on-error={}
:do { /interface list member remove [find list="mgmt" interface=bridge1] } on-error={}
# Adicionar ether2 (porta de gerencia principal)
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
# Adicionar bridge1 para discovery via hotspot (opcional, seguro pois requer auth)
/interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery-on-bridge"

# Configurar neighbor discovery para usar lista de gestao
/ip neighbor discovery-settings set discover-interface-list=mgmt
:log info "NAVSPOT: Neighbor Discovery configurado para lista mgmt"

# v6.9.27: Permitir Winbox (TCP 8291) pela porta de gestao (ether2) - remove+add pattern
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0

# v6.9.27: Permitir MNDP (UDP 5678) para aparecer em Neighbors - remove+add pattern
:do { /ip firewall filter remove [find comment="navspot-allow-mndp-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt" place-before=0

:log info "NAVSPOT: Regras de firewall para Winbox/MNDP criadas"

# 7. HOTSPOT v6.9.40 (add curto + sets separados para evitar linhas longas)
# Variaveis locais: SEM escape ($urlBase, $fullUrl, $hsprof)
# Variaveis runtime: via placeholder -> substituidas no final
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotIdSafe}"
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"
:local urlVars2 "&ip=${RUNTIME_PLACEHOLDERS.ip}"
:local urlVars3 "&link-login-only=${RUNTIME_PLACEHOLDERS.linkLoginOnly}"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 80])

# Passo A: Criar profile (idempotente - on-error ignora se ja existe)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}

# Passo B: Obter handle do profile (v6.9.40: SEM underscore - RouterOS 6.x parser issue)
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]

# Passo C: Aplicar configuracoes via sets SEPARADOS (cada linha <100 chars)
:do { /ip hotspot profile set $hsprof dns-name="${dnsName}" } on-error={}
:do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $hsprof login-url=$fullUrl } on-error={}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v${VERSION} com portal externo ativo"

# 8. WALLED GARDEN v6.9.27 (Portal + APIs + Captive Portal Detection)
# Portal NAVSPOT
/ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
/ip hotspot walled-garden add dst-host="*.lovable.app" action=allow comment="navspot-portal"
# Backend (explicit host - v6.9.31: avoids *.supabase.* wildcard parser issues)
/ip hotspot walled-garden add dst-host="${backendHost}" action=allow comment="navspot-api"
# CDNs para logos
/ip hotspot walled-garden add dst-host="*.cloudfront.net" action=allow comment="navspot-cdn"
/ip hotspot walled-garden add dst-host="*.amazonaws.com" action=allow comment="navspot-cdn"
# Captive Portal Detection - Android
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-cpd-android"
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-cpd-android"
# Captive Portal Detection - Windows
/ip hotspot walled-garden add dst-host="*.msftconnecttest.com" action=allow comment="navspot-cpd-windows"
/ip hotspot walled-garden add dst-host="*.msftncsi.com" action=allow comment="navspot-cpd-windows"
# Captive Portal Detection - Apple (v6.9.28: explicit hosts instead of *.apple.com wildcard)
/ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="navspot-cpd-apple"
/ip hotspot walled-garden add dst-host="www.apple.com" action=allow comment="navspot-cpd-apple"
# Protocolos de rede essenciais
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"
:log info "NAVSPOT: Walled Garden v${VERSION} configurado (Portal + CPD)"

# 9. TOKEN (metodo robusto RouterOS 6.x e 7.x - usa print+set como padrao)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
:local tokenValue "${hotspot.sync_token}"
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents=$tokenValue
:log info "NAVSPOT: Token criado (navspot-token.txt)"
:delay 500ms

# 10. GUARDIAN SCRIPT v6.9.27 (usando variavel local para evitar [:len [...]] aninhado)
:local guardianExists [/system script find name="navspot-guardian"]
:if ([:len $guardianExists] > 0) do={
:log info "NAVSPOT: Atualizando guardian..."
/system script set $guardianExists policy=read,write,test source={
${guardianScriptSource}
}
} else={
:log info "NAVSPOT: Criando guardian..."
/system script add name="navspot-guardian" policy=read,write,test source={
${guardianScriptSource}
}
}

# Guardian scheduler v6.9.38: on-event curto (sem delay inline)
:local guardianSchedExists [/system scheduler find name="navspot-guardian-scheduler"]
:if ([:len $guardianSchedExists] > 0) do={
/system scheduler set $guardianSchedExists interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970 disabled=no
} else={
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup start-date=jan/01/1970
}
:log info "NAVSPOT: Guardian v${VERSION} ativo (startup + token fallback + version check)"

# 11. ACTION PROCESSOR v6.9.27 - set-or-add pattern (nunca remove antes)
:local apExists [/system script find name="navspot-action-processor"]
:if ([:len $apExists] > 0) do={
:log info "NAVSPOT: Atualizando action-processor..."
/system script set $apExists policy=read,write,test source={
${actionProcessorSource}
}
} else={
:log info "NAVSPOT: Criando action-processor..."
/system script add name="navspot-action-processor" policy=read,write,test source={
${actionProcessorSource}
}
}
:delay 100ms

# 12. SYNC SCRIPT v6.9.38 - set-or-add pattern com TOKEN FALLBACK EMBUTIDO e JSON incremental
:local syncExists [/system script find name="navspot-sync"]
:if ([:len $syncExists] > 0) do={
:log info "NAVSPOT: Atualizando sync (token fallback embutido)..."
/system script set $syncExists policy=read,write,test source={
${syncScriptSource}
}
} else={
:log info "NAVSPOT: Criando sync (token fallback embutido)..."
/system script add name="navspot-sync" policy=read,write,test source={
${syncScriptSource}
}
}
:delay 100ms

# Scheduler v6.9.38: on-event curto (sem delay inline)
:local schedExists [/system scheduler find name="navspot-sync-scheduler"]
:if ([:len $schedExists] > 0) do={
/system scheduler set $schedExists interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970 disabled=no
} else={
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup start-date=jan/01/1970
}
:log info "NAVSPOT: Sync scheduler v${VERSION} configurado"

# 13. NETWATCH v6.9.38 - on-event curto (remove+add pattern)
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s down-script="" up-script="/system script run navspot-sync" comment="navspot-netwatch"
:log info "NAVSPOT: Netwatch configurado para auto-sync"

# 14. MIGRAR PORTAS LAN COM DELAYS (evitar perda de conexao)
:log info "NAVSPOT: Migrando portas LAN para bridge1..."

${migrationCommands}

:log info "NAVSPOT: Portas LAN migradas"

# 15. SYNC INICIAL SUAVE v6.9.38 (scheduler com script helper para on-event curto)
:log info "NAVSPOT: Agendando sync inicial em 45 segundos..."
:delay 200ms
# Usar scheduler com on-event simples, removal sera feito manualmente ou no proximo boot
/system scheduler add name="navspot-first-sync" start-time=startup interval=45s on-event="/system script run navspot-sync"
:delay 45s
:do { /system scheduler remove [find name="navspot-first-sync"] } on-error={}

:log info "=========================================="
:log info "NAVSPOT v${VERSION}: INSTALACAO CONCLUIDA!"
:log info "FIX v6.9.38: Hard line cap + comandos curtos (max 160 chars/linha)"
:log info "FIX v6.9.37: Placeholders + escaping robusto"
:log info "FIX v6.9.31: Replaced *.supabase.* wildcards with explicit host"
:log info "FIX v6.9.31: Token file uses explicit .txt extension"
:log info "FIX v6.9.28: Removed *.apple.com (explicit hosts instead)"
:log info "FIX: Whitelist/blacklist use direct commands only"
:log info "FIX: Firewall rules use remove+add with place-before=0"
:log info "Rede: ${networkCidr} | Gateway: ${gateway}"
:log info "WAN: ${wanInterface} (${wanType})"
:log info "Hotspot: hs-navspot | Profile: hsprof-navspot"
:log info "API: ${backendHost}"
:log info "Sync: a cada ${syncIntervalMinutes}m | Guardian: a cada 10m"
:log info "Gerencia: ether2 (Winbox/MNDP via mgmt list)"
:log info "Token fallback: embutido no sync + guardian"
:log info "=========================================="
`
}
