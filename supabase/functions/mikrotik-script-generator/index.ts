import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "7.7.1"
const DEPLOYED_AT = new Date().toISOString()

function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

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

function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  const net = cidr.split('/')[0].trim()
  const base = net.replace(/\.\d+$/, '')
  if (base === '192.168.88' || net === '192.168.88.0' || net.startsWith('192.168.88.')) {
    return { blocked: true, reason: 'Rede 192.168.88.0/24 e reservada para gerencia do MikroTik (Winbox). Use outra rede, ex: 10.10.10.0/24.' }
  }
  return { blocked: false, reason: '' }
}

interface Hotspot {
  id: string; nome: string; interface_wifi: string; wan_interface: string; wan_type: string
  rede: string; sync_token: string; sync_interval_minutes: number; max_usuarios: number | null
  ros_version: string | null; script_versao?: number
}

interface Embarcacao { id: string; nome: string; empresa_id: string }

function validateRouterOSScript(script: string, context: string): void {
  const lines = script.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 160 && !lines[i].trim().startsWith('#')) {
      console.error(`[${context} ${VERSION}] Long line #${i + 1} (${lines[i].length} chars)`)
      throw new Error('Script validation failed: Line >160 chars')
    }
  }
  console.log(`[${context} ${VERSION}] Script validation passed`)
}

function deriveBootstrapVars(hotspot: Hotspot, embarcacao: Embarcacao, supabaseUrl: string) {
  const scriptsUrl = `${supabaseUrl}/functions/v1/mikrotik-script-generator?mode=serve`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const wanInterface = hotspot.wan_interface || 'ether1'
  const wanType = hotspot.wan_type || 'dhcp'
  const supabaseHost = new URL(supabaseUrl).hostname
  const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
  const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))
  const migrationCommands = migrationOrder.map((port) => {
    return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
:do { /interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan" } on-error={}
:log info "NAVSPOT: ${port} migrada"
:delay 500ms`
  }).join('\n\n')
  const wanConfig = wanType === 'dhcp'
    ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
    : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`
  return {
    '{{VERSION}}': VERSION, '{{DEPLOYED_AT}}': DEPLOYED_AT, '{{WAN_INTERFACE}}': wanInterface,
    '{{WAN_CONFIG}}': wanConfig, '{{WAN_TYPE}}': wanType, '{{NETWORK_BASE}}': networkBase,
    '{{NETWORK_CIDR}}': networkCidr, '{{GATEWAY}}': gateway, '{{POOL_START}}': poolStart,
    '{{POOL_END}}': poolEnd, '{{EMBARCACAO_NOME}}': embarcacao.nome,
    '{{MIGRATION_COMMANDS}}': migrationCommands, '{{SCRIPTS_URL}}': scriptsUrl,
    '{{SYNC_TOKEN}}': hotspot.sync_token, '{{SUPABASE_HOST}}': supabaseHost,
  }
}

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value)
  }
  if (result.includes('{{')) {
    const remaining = result.match(/\{\{[A-Z_]+\}\}/g) || []
    throw new Error(`Unreplaced placeholders: ${remaining.join(', ')}`)
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode')
    // Health check
    if (req.method === 'GET' && mode === 'health') {
      return new Response(
        JSON.stringify({ version: VERSION, status: 'ok', deployed_at: DEPLOYED_AT }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Navspot-Version': VERSION } }
      )
    }
    // Serve mode (GET - no auth)
    if (req.method === 'GET' && mode === 'serve') {
      const scriptType = url.searchParams.get('type') || 'all'
      const syncToken = url.searchParams.get('token')
      const rosVersion = url.searchParams.get('ros_version') || '6'
      if (!syncToken) {
        return new Response('# Error: token required', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      console.log(`[serve ${VERSION}] type=${scriptType}, token=${syncToken.slice(0,4)}...${syncToken.slice(-4)}, ros=${rosVersion}`)
      const supabaseServe = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: hotspot, error: hotspotError } = await supabaseServe
        .from('hotspots')
        .select('id, nome, sync_token, sync_interval_minutes, ros_version, wan_interface, wan_type, rede, embarcacoes!inner(id, nome, empresa_id)')
        .eq('sync_token', syncToken)
        .single()
      if (hotspotError || !hotspot) {
        return new Response('# Error: Invalid sync token', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      const effRos = hotspot.ros_version === 'auto' ? rosVersion : (hotspot.ros_version || rosVersion)
      const rosConfigs: Record<string, { delayAfterFetch: number; delayAfterFileWrite: number; contentRetryCount: number }> = {
        '6': { delayAfterFetch: 2500, delayAfterFileWrite: 1500, contentRetryCount: 3 },
        '7': { delayAfterFetch: 500, delayAfterFileWrite: 300, contentRetryCount: 1 },
      }
      const rosConfig = rosConfigs[effRos] || rosConfigs['6']
      const sUrl = Deno.env.get('SUPABASE_URL')!
      const syncUrl = `${sUrl}/functions/v1/mikrotik-sync`
      const recoveryUrl = `${sUrl}/functions/v1/mikrotik-recovery-download`
      const apiBase = `${sUrl}/functions/v1`
      const syncMin = hotspot.sync_interval_minutes || 5
      // Infra type (standalone infrastructure script)
      if (scriptType === 'infra') {
        const embarcacao = (hotspot as any).embarcacoes as Embarcacao
        const vars = deriveBootstrapVars(hotspot as unknown as Hotspot, embarcacao, sUrl)
        const { data: tpl, error: tplError } = await supabaseServe.from('script_templates').select('content').eq('id', 'infra').single()
        if (tplError || !tpl) {
          return new Response('# Error: Infra template not found', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Navspot-Version': VERSION } })
        }
        let script = applyPlaceholders(tpl.content, vars)
        script = normalizeNewlines(script)
        console.log(`[serve ${VERSION}] type=infra tpl=infra (${script.length}b)`)
        return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(new TextEncoder().encode(script).length), 'Cache-Control': 'no-store, max-age=0', 'X-Navspot-Version': VERSION } })
      }
      // Bootstrap type (ultra-thin fetch+import)
      if (scriptType === 'bootstrap') {
        const embarcacao = (hotspot as any).embarcacoes as Embarcacao
        const vars = deriveBootstrapVars(hotspot as unknown as Hotspot, embarcacao, sUrl)
        const { data: tpl, error: tplError } = await supabaseServe.from('script_templates').select('content').eq('id', 'bootstrap').single()
        if (tplError || !tpl) {
          return new Response('# Error: Bootstrap template not found', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Navspot-Version': VERSION } })
        }
        let script = applyPlaceholders(tpl.content, vars)
        script = normalizeNewlines(script)
        console.log(`[serve ${VERSION}] type=bootstrap tpl=bootstrap (${script.length}b)`)
        return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(new TextEncoder().encode(script).length), 'Cache-Control': 'no-store, max-age=0', 'X-Navspot-Version': VERSION } })
      }
      // Other template types
      let templateId: string
      let isStandalone = false
      switch (scriptType) {
        case 'sync-raw': templateId = 'sync'; break
        case 'guardian-raw': templateId = 'guardian'; break
        case 'sync-standalone': templateId = 'sync-standalone'; isStandalone = true; break
        case 'guardian-standalone': templateId = 'guardian-standalone'; isStandalone = true; break
        default: templateId = 'installer'; break
      }
      let innerContent = ''
      if (isStandalone) {
        const innerTemplateId = scriptType === 'sync-standalone' ? 'sync' : 'guardian'
        const { data: innerTpl } = await supabaseServe.from('script_templates').select('content').eq('id', innerTemplateId).single()
        if (innerTpl) {
          innerContent = innerTpl.content
            .replace(/\{\{VERSION\}\}/g, VERSION).replace(/\{\{SYNC_TOKEN\}\}/g, syncToken || '')
            .replace(/\{\{SYNC_URL\}\}/g, syncUrl || '').replace(/\{\{RECOVERY_URL\}\}/g, recoveryUrl || '')
            .replace(/\{\{API_BASE\}\}/g, apiBase || '').replace(/\{\{DEPLOYED_AT\}\}/g, DEPLOYED_AT)
            .replace(/\{\{ROS_VERSION\}\}/g, effRos || '').replace(/\{\{SYNC_INTERVAL\}\}/g, String(syncMin))
          innerContent = innerContent.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\r\\n')
        }
      }
      const { data: tpl, error: tplError } = await supabaseServe.from('script_templates').select('content').eq('id', templateId).single()
      if (tplError || !tpl) {
        return new Response('# Error: Template not found', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Navspot-Version': VERSION } })
      }
      let script = tpl.content
        .replace(/\{\{VERSION\}\}/g, VERSION).replace(/\{\{SYNC_TOKEN\}\}/g, syncToken || '')
        .replace(/\{\{SYNC_URL\}\}/g, syncUrl || '').replace(/\{\{RECOVERY_URL\}\}/g, recoveryUrl || '')
        .replace(/\{\{API_BASE\}\}/g, apiBase || '').replace(/\{\{DEPLOYED_AT\}\}/g, DEPLOYED_AT)
        .replace(/\{\{ROS_VERSION\}\}/g, effRos || '').replace(/\{\{SYNC_INTERVAL\}\}/g, String(syncMin))
        .replace(/\{\{FETCH_DELAY\}\}/g, String(rosConfig.delayAfterFetch))
        .replace(/\{\{WRITE_DELAY\}\}/g, String(rosConfig.delayAfterFileWrite))
        .replace(/\{\{MAX_RETRIES\}\}/g, String(rosConfig.contentRetryCount))
      if (isStandalone && innerContent) {
        script = script.replace(/\{\{SYNC_SOURCE\}\}/g, innerContent).replace(/\{\{GUARDIAN_SOURCE\}\}/g, innerContent)
      }
      console.log(`[serve ${VERSION}] type=${scriptType} tpl=${templateId} (${script.length}b)`)
      return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(new TextEncoder().encode(script).length), 'Cache-Control': 'no-store, max-age=0', 'X-Navspot-Version': VERSION } })
    }
    // POST: Generate bootstrap (authenticated)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { hotspot_id } = await req.json()
    if (!hotspot_id) {
      return new Response(JSON.stringify({ success: false, error: 'hotspot_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    console.log(`[script-generator ${VERSION}] Generating bootstrap for hotspot: ${hotspot_id}`)
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, nome, interface_wifi, wan_interface, wan_type, rede, sync_token, sync_interval_minutes, max_usuarios, ros_version, script_versao, embarcacoes!inner(id, nome, empresa_id)')
      .eq('id', hotspot_id).single()
    if (hotspotError || !hotspot) {
      return new Response(JSON.stringify({ success: false, error: 'Hotspot not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const networkValidation = isBlockedNetwork(hotspot.rede)
    if (networkValidation.blocked) {
      return new Response(JSON.stringify({ success: false, error: networkValidation.reason }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const embarcacao = hotspot.embarcacoes as unknown as Embarcacao
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: tpl, error: tplError } = await supabaseService.from('script_templates').select('content').eq('id', 'bootstrap').single()
    if (tplError || !tpl) {
      return new Response(JSON.stringify({ success: false, error: 'Bootstrap template not found' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const vars = deriveBootstrapVars(hotspot as unknown as Hotspot, embarcacao, supabaseUrl)
    let bootstrapScript = applyPlaceholders(tpl.content, vars)
    bootstrapScript = normalizeNewlines(bootstrapScript)
    validateBalance(bootstrapScript)
    validateRouterOSScript(bootstrapScript, 'script-generator')
    const { error: updateError } = await supabase.from('hotspots').update({ script_gerado: bootstrapScript, script_versao: hotspot.script_versao ? hotspot.script_versao + 1 : 1 }).eq('id', hotspot_id)
    if (updateError) { console.error(`[script-generator ${VERSION}] Failed to save:`, updateError) }
    if (!bootstrapScript.includes('/tool fetch') || !bootstrapScript.includes('/import $tmpFile')) {
      throw new Error('Bootstrap nao contem fetch+import pattern')
    }
    let sanitized = bootstrapScript.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '  ').replace(/\n{3,}/g, '\n\n')
    console.log(`[script-generator ${VERSION}] Bootstrap generated for ${hotspot.nome} (${sanitized.length}b)`)
    return new Response(sanitized, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="navspot-bootstrap-v${VERSION}.rsc"`, 'X-Navspot-Version': VERSION, 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error(`[script-generator ${VERSION}] Error:`, error)
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
