import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "7.8.1"
const DEPLOYED_AT = new Date().toISOString()

function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  const net = cidr.split('/')[0].trim()
  const base = net.replace(/\.\d+$/, '')
  if (base === '192.168.88' || net === '192.168.88.0' || net.startsWith('192.168.88.')) {
    return { blocked: true, reason: 'Rede 192.168.88.0/24 e reservada para gerencia do MikroTik. Use outra rede.' }
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
  script_versao?: number
}

interface Embarcacao {
  id: string
  nome: string
  empresa_id: string
}

function buildMigrationCommands(allLanPorts: string[]): string {
  const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))
  const lines: string[] = []
  for (const port of migrationOrder) {
    lines.push(":do { /interface bridge port remove [find interface=" + port + "] } on-error={}")
    lines.push(":do { /interface bridge port add bridge=bridge1 interface=" + port + " comment=\"navspot-lan\" } on-error={}")
    lines.push(":log info \"NAVSPOT: " + port + " migrada\"")
    lines.push(":delay 500ms")
    lines.push("")
  }
  return lines.join('\n')
}

function buildWanConfig(wanType: string, wanInterface: string): string {
  if (wanType === 'dhcp') {
    return ":do { /ip dhcp-client remove [find interface=" + wanInterface + "] } on-error={}\n" +
      "/ip dhcp-client add interface=" + wanInterface + " disabled=no comment=\"navspot-wan\"\n" +
      ":log info \"NAVSPOT: DHCP client em " + wanInterface + "\""
  }
  return ":log info \"NAVSPOT: WAN " + wanInterface + " configurada como " + wanType + " (manual)\""
}

function deriveVars(hotspot: Hotspot, embarcacao: Embarcacao, supabaseUrl: string): Record<string, string> {
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const wanInterface = hotspot.wan_interface || 'ether1'
  const wanType = hotspot.wan_type || 'dhcp'
  const syncMin = hotspot.sync_interval_minutes || 5
  const effRos = hotspot.ros_version === 'auto' ? '7' : (hotspot.ros_version || '7')
  const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
  const rosConfig = effRos === '7'
    ? { delayAfterFetch: 500, delayAfterFileWrite: 300, contentRetryCount: 1 }
    : { delayAfterFetch: 2500, delayAfterFileWrite: 1500, contentRetryCount: 3 }

  return {
    '{{VERSION}}': VERSION,
    '{{DEPLOYED_AT}}': DEPLOYED_AT,
    '{{WAN_INTERFACE}}': wanInterface,
    '{{WAN_CONFIG}}': buildWanConfig(wanType, wanInterface),
    '{{WAN_TYPE}}': wanType,
    '{{NETWORK_BASE}}': networkBase,
    '{{NETWORK_CIDR}}': hotspot.rede.includes('/') ? hotspot.rede : hotspot.rede + '/24',
    '{{GATEWAY}}': networkBase + '.1',
    '{{POOL_START}}': networkBase + '.10',
    '{{POOL_END}}': networkBase + '.254',
    '{{EMBARCACAO_NOME}}': embarcacao.nome,
    '{{MIGRATION_COMMANDS}}': buildMigrationCommands(allLanPorts),
    '{{SCRIPTS_URL}}': supabaseUrl + '/functions/v1/mikrotik-script-generator?mode=serve',
    '{{SYNC_TOKEN}}': hotspot.sync_token,
    '{{SUPABASE_HOST}}': new URL(supabaseUrl).hostname,
    '{{SYNC_URL}}': supabaseUrl + '/functions/v1/mikrotik-sync',
    '{{RECOVERY_URL}}': supabaseUrl + '/functions/v1/mikrotik-recovery-download',
    '{{API_BASE}}': supabaseUrl + '/functions/v1',
    '{{SYNC_INTERVAL}}': String(syncMin),
    '{{ROS_VERSION}}': effRos,
    '{{FETCH_DELAY}}': String(rosConfig.delayAfterFetch),
    '{{WRITE_DELAY}}': String(rosConfig.delayAfterFileWrite),
    '{{MAX_RETRIES}}': String(rosConfig.contentRetryCount),
  }
}

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value)
  }
  if (result.includes('{{')) {
    const remaining = result.match(/\{\{[A-Z_]+\}\}/g) || []
    throw new Error('Unreplaced placeholders: ' + remaining.join(', '))
  }
  return result
}

async function renderTemplate(
  supabase: any, templateId: string, vars: Record<string, string>
): Promise<string> {
  const { data: tpl, error } = await supabase
    .from('script_templates')
    .select('content')
    .eq('id', templateId)
    .single()
  if (error || !tpl) throw new Error("Template '" + templateId + "' not found")
  const script = applyPlaceholders(tpl.content, vars)
  return normalizeNewlines(script)
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
        JSON.stringify({ version: VERSION, status: 'ok', deployed_at: DEPLOYED_AT, storage_first: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Navspot-Version': VERSION } }
      )
    }

    // Legacy serve mode
    if (req.method === 'GET' && mode === 'serve') {
      const scriptType = url.searchParams.get('type') || 'all'
      const syncToken = url.searchParams.get('token')
      if (!syncToken) {
        return new Response('# Error: token required', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      console.log('[serve-legacy ' + VERSION + '] type=' + scriptType + ', token=' + syncToken.slice(0, 4) + '...')
      const supabaseService = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: hotspot, error: hErr } = await supabaseService
        .from('hotspots')
        .select('id, nome, sync_token, sync_interval_minutes, ros_version, wan_interface, wan_type, rede, embarcacoes!inner(id, nome, empresa_id)')
        .eq('sync_token', syncToken)
        .single()
      if (hErr || !hotspot) {
        return new Response('# Error: Invalid sync token', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      const embarcacao = (hotspot as any).embarcacoes as Embarcacao
      const vars = deriveVars(hotspot as unknown as Hotspot, embarcacao, Deno.env.get('SUPABASE_URL')!)

      let templateId: string
      switch (scriptType) {
        case 'infra': templateId = 'infra'; break
        case 'bootstrap': templateId = 'bootstrap'; break
        case 'sync-raw': templateId = 'sync'; break
        case 'guardian-raw': templateId = 'guardian'; break
        case 'sync-standalone': templateId = 'sync-standalone'; break
        case 'guardian-standalone': templateId = 'guardian-standalone'; break
        default: templateId = 'installer'; break
      }
      const script = await renderTemplate(supabaseService, templateId, vars)
      console.log('[serve-legacy ' + VERSION + '] type=' + scriptType + ' (' + script.length + 'b)')
      return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Navspot-Version': VERSION } })
    }

    // POST: Generate + upload to storage + return signed URLs
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const body = await req.json()
    const hotspot_id = body.hotspot_id
    if (!hotspot_id) {
      return new Response(JSON.stringify({ success: false, error: 'hotspot_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    console.log('[generate ' + VERSION + '] hotspot: ' + hotspot_id)

    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, nome, interface_wifi, wan_interface, wan_type, rede, sync_token, sync_interval_minutes, max_usuarios, ros_version, script_versao, embarcacoes!inner(id, nome, empresa_id)')
      .eq('id', hotspot_id)
      .single()
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
    const vars = deriveVars(hotspot as unknown as Hotspot, embarcacao, supabaseUrl)

    // Render all 4 scripts in parallel
    const [infraScript, syncScript, guardianScript, bootstrapScript] = await Promise.all([
      renderTemplate(supabaseService, 'infra', vars),
      renderTemplate(supabaseService, 'sync-standalone', vars),
      renderTemplate(supabaseService, 'guardian-standalone', vars),
      renderTemplate(supabaseService, 'bootstrap', vars),
    ])

    // Upload to storage
    const storagePath = hotspot_id + '/' + VERSION
    const uploads = [
      { path: storagePath + '/infra.rsc', content: infraScript },
      { path: storagePath + '/sync.rsc', content: syncScript },
      { path: storagePath + '/guardian.rsc', content: guardianScript },
      { path: storagePath + '/bootstrap.rsc', content: bootstrapScript },
    ]

    for (const upload of uploads) {
      const { error: uploadError } = await supabaseService.storage
        .from('hotspot-scripts')
        .upload(upload.path, new TextEncoder().encode(upload.content), {
          contentType: 'text/plain; charset=utf-8',
          upsert: true,
        })
      if (uploadError) {
        console.error('[generate ' + VERSION + '] Upload failed ' + upload.path + ':', uploadError)
        throw new Error('Upload failed: ' + upload.path)
      }
    }
    console.log('[generate ' + VERSION + '] Uploaded 4 scripts to ' + storagePath)

    // Generate signed URLs (15 min TTL)
    const signedUrls: Record<string, string> = {}
    for (const upload of uploads) {
      const { data: signedData, error: signError } = await supabaseService.storage
        .from('hotspot-scripts')
        .createSignedUrl(upload.path, 900)
      if (signError || !signedData) {
        throw new Error('Signed URL failed: ' + upload.path)
      }
      const filename = upload.path.split('/').pop()!.replace('.rsc', '')
      signedUrls[filename + '_url'] = signedData.signedUrl
    }

    // Update hotspot metadata
    const { error: updateError } = await supabase.from('hotspots').update({
      scripts_version: VERSION,
      scripts_generated_at: new Date().toISOString(),
      scripts_storage_path: storagePath,
      script_gerado: bootstrapScript,
      script_versao: hotspot.script_versao ? hotspot.script_versao + 1 : 1,
    }).eq('id', hotspot_id)
    if (updateError) {
      console.error('[generate ' + VERSION + '] Metadata update failed:', updateError)
    }

    console.log('[generate ' + VERSION + '] Done for ' + hotspot.nome)

    return new Response(JSON.stringify({
      success: true,
      version: VERSION,
      ...signedUrls,
      expires_in_seconds: 900,
      storage_path: storagePath,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Navspot-Version': VERSION },
    })
  } catch (error) {
    console.error('[generate ' + VERSION + '] Error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
