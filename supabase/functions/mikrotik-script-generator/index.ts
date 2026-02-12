// Orchestrator — NO esm.sh imports to avoid bundler timeout
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const VERSION = "7.8.1"
const DEPLOYED_AT = new Date().toISOString()

function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  if (cidr.split('/')[0].trim().replace(/\.\d+$/, '') === '192.168.88') {
    return { blocked: true, reason: 'Rede 192.168.88.0/24 reservada para gerencia MikroTik.' }
  }
  return { blocked: false, reason: '' }
}

function buildMigrationCommands(ports: string[]): string {
  const lines: string[] = []
  for (const p of [...ports].sort((a, b) => b.localeCompare(a))) {
    lines.push(":do { /interface bridge port remove [find interface=" + p + "] } on-error={}")
    lines.push(":do { /interface bridge port add bridge=bridge1 interface=" + p + " comment=\"navspot-lan\" } on-error={}")
    lines.push(":log info \"NAVSPOT: " + p + " migrada\"")
    lines.push(":delay 500ms")
    lines.push("")
  }
  return lines.join('\n')
}

function buildWanConfig(t: string, w: string): string {
  if (t === 'dhcp') return ":do { /ip dhcp-client remove [find interface=" + w + "] } on-error={}\n/ip dhcp-client add interface=" + w + " disabled=no comment=\"navspot-wan\"\n:log info \"NAVSPOT: DHCP client em " + w + "\""
  return ":log info \"NAVSPOT: WAN " + w + " configurada como " + t + " (manual)\""
}

function deriveVars(h: any, e: any, url: string): Record<string, string> {
  const nb = h.rede.split('/')[0].replace(/\.\d+$/, '')
  const w = h.wan_interface || 'ether1', wt = h.wan_type || 'dhcp'
  const sm = h.sync_interval_minutes || 5
  const ros = h.ros_version === 'auto' ? '7' : (h.ros_version || '7')
  const lp = ['ether3','ether4','ether5'].filter(p => p !== w)
  const rc = ros === '7' ? {f:500,w:300,r:1} : {f:2500,w:1500,r:3}
  return {
    '{{VERSION}}': VERSION, '{{DEPLOYED_AT}}': DEPLOYED_AT,
    '{{WAN_INTERFACE}}': w, '{{WAN_CONFIG}}': buildWanConfig(wt, w), '{{WAN_TYPE}}': wt,
    '{{NETWORK_BASE}}': nb, '{{NETWORK_CIDR}}': h.rede.includes('/') ? h.rede : h.rede+'/24',
    '{{GATEWAY}}': nb+'.1', '{{POOL_START}}': nb+'.10', '{{POOL_END}}': nb+'.254',
    '{{EMBARCACAO_NOME}}': e.nome, '{{MIGRATION_COMMANDS}}': buildMigrationCommands(lp),
    '{{SCRIPTS_URL}}': url+'/functions/v1/mikrotik-script-generator?mode=serve',
    '{{SYNC_TOKEN}}': h.sync_token, '{{SUPABASE_HOST}}': new URL(url).hostname,
    '{{SYNC_URL}}': url+'/functions/v1/mikrotik-sync',
    '{{RECOVERY_URL}}': url+'/functions/v1/mikrotik-recovery-download',
    '{{API_BASE}}': url+'/functions/v1',
    '{{SYNC_INTERVAL}}': String(sm), '{{ROS_VERSION}}': ros,
    '{{FETCH_DELAY}}': String(rc.f), '{{WRITE_DELAY}}': String(rc.w), '{{MAX_RETRIES}}': String(rc.r),
  }
}

// Raw fetch helpers (no SDK needed)
async function sbGet(url: string, path: string, token: string, params: Record<string,string> = {}) {
  const qs = new URLSearchParams(params).toString()
  const r = await fetch(url + '/rest/v1/' + path + (qs ? '?' + qs : ''), {
    headers: { 'apikey': token, 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.pgrst.object+json' }
  })
  if (!r.ok) return { data: null, error: await r.text() }
  return { data: await r.json(), error: null }
}

async function sbUpdate(url: string, path: string, token: string, body: any, params: Record<string,string>) {
  const qs = new URLSearchParams(params).toString()
  await fetch(url + '/rest/v1/' + path + '?' + qs, {
    method: 'PATCH', headers: { 'apikey': token, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
}

async function sbUpload(url: string, serviceKey: string, bucket: string, filePath: string, content: Uint8Array) {
  const r = await fetch(url + '/storage/v1/object/' + bucket + '/' + filePath, {
    method: 'PUT', headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'text/plain; charset=utf-8', 'x-upsert': 'true' },
    body: content,
  })
  if (!r.ok) throw new Error('Upload failed: ' + filePath + ' ' + r.status)
}

async function sbSignedUrl(url: string, serviceKey: string, bucket: string, filePath: string): Promise<string> {
  const r = await fetch(url + '/storage/v1/object/sign/' + bucket, {
    method: 'POST', headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 900, paths: [filePath] }),
  })
  if (!r.ok) throw new Error('SignedUrl failed: ' + filePath)
  const arr = await r.json()
  return url + '/storage/v1' + arr[0].signedURL
}

async function getUser(url: string, anonKey: string, authHeader: string) {
  const r = await fetch(url + '/auth/v1/user', {
    headers: { 'apikey': anonKey, 'Authorization': authHeader }
  })
  if (!r.ok) return null
  return await r.json()
}

async function render(templateId: string, vars: Record<string, string>): Promise<string> {
  const r = await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/mikrotik-render-template', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    body: JSON.stringify({ template_id: templateId, vars }),
  })
  if (!r.ok) throw new Error('Render failed (' + templateId + '): ' + await r.text())
  return await r.text()
}

function json(d: any, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Navspot-Version': VERSION } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const u = new URL(req.url), mode = u.searchParams.get('mode')
    const SU = Deno.env.get('SUPABASE_URL')!, SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, AK = Deno.env.get('SUPABASE_ANON_KEY')!

    if (req.method === 'GET' && mode === 'health') return json({ version: VERSION, status: 'ok', deployed_at: DEPLOYED_AT, storage_first: true })

    if (req.method === 'GET' && mode === 'serve') {
      const st = u.searchParams.get('type') || 'all', tk = u.searchParams.get('token')
      if (!tk) return new Response('# Error: token required', { status: 400, headers: corsHeaders })
      const { data: h } = await sbGet(SU, 'hotspots', SK, { select: 'id,nome,sync_token,sync_interval_minutes,ros_version,wan_interface,wan_type,rede,embarcacoes!inner(id,nome,empresa_id)', sync_token: 'eq.' + tk })
      if (!h) return new Response('# Error: Invalid token', { status: 404, headers: corsHeaders })
      const vars = deriveVars(h, h.embarcacoes, SU)
      const tm: Record<string,string> = { infra:'infra', bootstrap:'bootstrap', 'sync-raw':'sync', 'guardian-raw':'guardian', 'sync-standalone':'sync-standalone', 'guardian-standalone':'guardian-standalone' }
      const script = await render(tm[st] || 'installer', vars)
      return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Navspot-Version': VERSION } })
    }

    const ah = req.headers.get('Authorization')
    if (!ah || !ah.startsWith('Bearer ')) return json({ success: false, error: 'Unauthorized' }, 401)
    const user = await getUser(SU, AK, ah)
    if (!user) return json({ success: false, error: 'Invalid token' }, 401)
    const { hotspot_id } = await req.json()
    if (!hotspot_id) return json({ success: false, error: 'hotspot_id required' }, 400)

    const { data: h } = await sbGet(SU, 'hotspots', ah.split(' ')[1], {
      select: 'id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)',
      id: 'eq.' + hotspot_id
    })
    if (!h) return json({ success: false, error: 'Hotspot not found' }, 404)
    const nv = isBlockedNetwork(h.rede)
    if (nv.blocked) return json({ success: false, error: nv.reason }, 400)

    const vars = deriveVars(h, h.embarcacoes, SU)
    const [infra, sync, guardian, bootstrap] = await Promise.all([
      render('infra', vars), render('sync-standalone', vars),
      render('guardian-standalone', vars), render('bootstrap', vars),
    ])

    const sp = hotspot_id + '/' + VERSION
    const enc = (s: string) => new TextEncoder().encode(s)
    await Promise.all([
      sbUpload(SU, SK, 'hotspot-scripts', sp+'/infra.rsc', enc(infra)),
      sbUpload(SU, SK, 'hotspot-scripts', sp+'/sync.rsc', enc(sync)),
      sbUpload(SU, SK, 'hotspot-scripts', sp+'/guardian.rsc', enc(guardian)),
      sbUpload(SU, SK, 'hotspot-scripts', sp+'/bootstrap.rsc', enc(bootstrap)),
    ])

    const [iu, su2, gu, bu] = await Promise.all([
      sbSignedUrl(SU, SK, 'hotspot-scripts', sp+'/infra.rsc'),
      sbSignedUrl(SU, SK, 'hotspot-scripts', sp+'/sync.rsc'),
      sbSignedUrl(SU, SK, 'hotspot-scripts', sp+'/guardian.rsc'),
      sbSignedUrl(SU, SK, 'hotspot-scripts', sp+'/bootstrap.rsc'),
    ])

    await sbUpdate(SU, 'hotspots', ah.split(' ')[1], {
      scripts_version: VERSION, scripts_generated_at: new Date().toISOString(),
      scripts_storage_path: sp, script_gerado: bootstrap,
      script_versao: h.script_versao ? h.script_versao + 1 : 1,
    }, { id: 'eq.' + hotspot_id })

    return json({ success: true, version: VERSION, infra_url: iu, sync_url: su2, guardian_url: gu, bootstrap_url: bu, expires_in_seconds: 900, storage_path: sp })
  } catch (e) {
    console.error('[gen ' + VERSION + ']', e)
    return json({ success: false, error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
