// navspot-script-gen — Orchestrator with inline rendering (zero SDK imports)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const VERSION = "7.8.2"
const DEPLOYED_AT = new Date().toISOString()
const VALID_TEMPLATES = ['infra', 'sync-standalone', 'guardian-standalone', 'bootstrap', 'installer', 'sync', 'guardian', 'sync-raw', 'guardian-raw']
const MAX_SCRIPT_SIZE = 65536 // 64KB safety limit for router

// --- Helpers ---

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 2): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() }
    catch (e) {
      if (i === maxRetries) throw e
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
      console.warn(`[retry:${label}] attempt ${i + 1}`)
    }
  }
  throw new Error('unreachable')
}

function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  if (cidr.split('/')[0].trim().replace(/\.\d+$/, '') === '192.168.88') {
    return { blocked: true, reason: 'Rede 192.168.88.0/24 reservada para gerencia MikroTik.' }
  }
  return { blocked: false, reason: '' }
}

function isValidCIDR(cidr: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/.test(cidr)
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function applyPlaceholders(tpl: string, vars: Record<string, string>): string {
  let r = tpl
  for (const [k, v] of Object.entries(vars)) r = r.replaceAll(k, v)
  if (r.includes('{{')) {
    const remaining = r.match(/\{\{[A-Z_]+\}\}/g) || []
    throw new Error('Unreplaced placeholders: ' + remaining.join(', '))
  }
  return r
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
  const lp = ['ether3', 'ether4', 'ether5'].filter(p => p !== w)
  const rc = ros === '7' ? { f: 500, w: 300, r: 1 } : { f: 2500, w: 1500, r: 3 }
  return {
    '{{VERSION}}': VERSION, '{{DEPLOYED_AT}}': DEPLOYED_AT,
    '{{WAN_INTERFACE}}': w, '{{WAN_CONFIG}}': buildWanConfig(wt, w), '{{WAN_TYPE}}': wt,
    '{{NETWORK_BASE}}': nb, '{{NETWORK_CIDR}}': h.rede.includes('/') ? h.rede : h.rede + '/24',
    '{{GATEWAY}}': nb + '.1', '{{POOL_START}}': nb + '.10', '{{POOL_END}}': nb + '.254',
    '{{EMBARCACAO_NOME}}': e.nome, '{{MIGRATION_COMMANDS}}': buildMigrationCommands(lp),
    '{{SCRIPTS_URL}}': url + '/functions/v1/navspot-script-gen?mode=serve',
    '{{SYNC_TOKEN}}': h.sync_token, '{{SUPABASE_HOST}}': new URL(url).hostname,
    '{{SYNC_URL}}': url + '/functions/v1/mikrotik-sync',
    '{{RECOVERY_URL}}': url + '/functions/v1/mikrotik-recovery-download',
    '{{API_BASE}}': url + '/functions/v1',
    '{{SYNC_INTERVAL}}': String(sm), '{{ROS_VERSION}}': ros,
    '{{FETCH_DELAY}}': String(rc.f), '{{WRITE_DELAY}}': String(rc.w), '{{MAX_RETRIES}}': String(rc.r),
  }
}

// --- Raw fetch helpers (no SDK) ---

async function sbGet(url: string, path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  const r = await fetch(url + '/rest/v1/' + path + (qs ? '?' + qs : ''), {
    headers: { 'apikey': token, 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.pgrst.object+json' }
  })
  if (!r.ok) return { data: null, error: await r.text() }
  return { data: await r.json(), error: null }
}

async function sbUpdate(url: string, path: string, token: string, body: any, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  await fetch(url + '/rest/v1/' + path + '?' + qs, {
    method: 'PATCH', headers: { 'apikey': token, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  })
}

async function fetchTemplate(url: string, sk: string, templateId: string): Promise<string> {
  const r = await fetch(url + '/rest/v1/script_templates?id=eq.' + templateId + '&select=content', {
    headers: { 'apikey': sk, 'Authorization': 'Bearer ' + sk, 'Accept': 'application/vnd.pgrst.object+json' }
  })
  if (!r.ok) throw new Error('Template fetch failed: ' + r.status)
  const tpl = await r.json()
  if (!tpl?.content) throw new Error('Template not found: ' + templateId)
  console.log(`[template:fetch] ${templateId} ok`)
  return tpl.content
}

async function renderTemplate(url: string, sk: string, templateId: string, vars: Record<string, string>): Promise<string> {
  const content = await withRetry(() => fetchTemplate(url, sk, templateId), 'tpl:' + templateId)
  const script = normalizeNewlines(applyPlaceholders(content, vars))
  if (script.length > MAX_SCRIPT_SIZE) {
    throw new Error(`Script ${templateId} exceeds ${MAX_SCRIPT_SIZE} bytes (${script.length})`)
  }
  return script
}

async function sbUpload(url: string, sk: string, bucket: string, filePath: string, content: Uint8Array) {
  const r = await fetch(url + '/storage/v1/object/' + bucket + '/' + filePath, {
    method: 'PUT', headers: { 'apikey': sk, 'Authorization': 'Bearer ' + sk, 'Content-Type': 'text/plain; charset=utf-8', 'x-upsert': 'true' },
    body: content,
  })
  if (!r.ok) throw new Error('Upload failed: ' + filePath + ' ' + r.status)
  console.log(`[upload:ok] ${filePath}`)
}

async function sbSignedUrl(url: string, sk: string, bucket: string, filePath: string): Promise<string> {
  const r = await fetch(url + '/storage/v1/object/sign/' + bucket + '/' + filePath, {
    method: 'POST', headers: { 'apikey': sk, 'Authorization': 'Bearer ' + sk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 900 }),
  })
  if (!r.ok) throw new Error('SignedUrl failed: ' + filePath + ' ' + r.status)
  const data = await r.json()
  console.log(`[sign:ok] ${filePath}`)
  return url + '/storage/v1' + data.signedURL
}

async function getUser(url: string, anonKey: string, authHeader: string) {
  const r = await fetch(url + '/auth/v1/user', {
    headers: { 'apikey': anonKey, 'Authorization': authHeader }
  })
  if (!r.ok) return null
  return await r.json()
}

function json(d: any, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Navspot-Version': VERSION } })
}

function truncToken(t: string): string { return t ? t.slice(0, 4) + '...' : '(empty)' }

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const u = new URL(req.url), mode = u.searchParams.get('mode')
    const SU = Deno.env.get('SUPABASE_URL')!, SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, AK = Deno.env.get('SUPABASE_ANON_KEY')!

    // Health check
    if (req.method === 'GET' && mode === 'health') {
      return json({ version: VERSION, status: 'ok', deployed_at: DEPLOYED_AT, storage_first: true, function: 'navspot-script-gen' })
    }

    // Legacy serve mode (routers fetch scripts by token)
    if (req.method === 'GET' && mode === 'serve') {
      const st = u.searchParams.get('type') || 'all', tk = u.searchParams.get('token')
      if (!tk) return new Response('# Error: token required', { status: 400, headers: corsHeaders })
      console.log(`[serve] type=${st} token=${truncToken(tk)}`)
      const { data: h } = await sbGet(SU, 'hotspots', SK, { select: 'id,nome,sync_token,sync_interval_minutes,ros_version,wan_interface,wan_type,rede,embarcacoes!inner(id,nome,empresa_id)', sync_token: 'eq.' + tk })
      if (!h) return new Response('# Error: Invalid token', { status: 404, headers: corsHeaders })
      const vars = deriveVars(h, h.embarcacoes, SU)
      const tm: Record<string, string> = { infra: 'infra', bootstrap: 'bootstrap', 'sync-raw': 'sync', 'guardian-raw': 'guardian', 'sync-standalone': 'sync-standalone', 'guardian-standalone': 'guardian-standalone' }
      const tplId = tm[st] || 'installer'
      if (!VALID_TEMPLATES.includes(tplId)) return new Response('# Error: invalid template type', { status: 400, headers: corsHeaders })
      const script = await renderTemplate(SU, SK, tplId, vars)
      return new Response(script, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Navspot-Version': VERSION } })
    }

    // POST: generate all scripts + upload + signed URLs
    const ah = req.headers.get('Authorization')
    if (!ah || !ah.startsWith('Bearer ')) return json({ success: false, error: 'Unauthorized' }, 401)
    const user = await getUser(SU, AK, ah)
    if (!user) return json({ success: false, error: 'Invalid token' }, 401)
    const { hotspot_id } = await req.json()
    if (!hotspot_id) return json({ success: false, error: 'hotspot_id required' }, 400)

    console.log(`[generate:start] hotspot=${hotspot_id}`)

    const { data: h, error: hErr } = await sbGet(SU, 'hotspots', SK, {
      select: 'id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)',
      id: 'eq.' + hotspot_id
    })
    if (!h || hErr) {
      console.error('[generate] hotspot fetch failed:', hErr)
      return json({ success: false, error: 'Hotspot not found' }, 404)
    }

    // Validations
    const nv = isBlockedNetwork(h.rede)
    if (nv.blocked) return json({ success: false, error: nv.reason }, 400)
    if (!h.sync_token) return json({ success: false, error: 'sync_token ausente no hotspot' }, 400)
    if (!isValidCIDR(h.rede)) return json({ success: false, error: 'Formato de rede invalido: ' + h.rede }, 400)

    console.log(`[generate:validated] hotspot=${h.nome} token=${truncToken(h.sync_token)}`)

    const vars = deriveVars(h, h.embarcacoes, SU)

    // Render all 4 templates in parallel
    const [infra, sync, guardian, bootstrap] = await Promise.all([
      renderTemplate(SU, SK, 'infra', vars),
      renderTemplate(SU, SK, 'sync-standalone', vars),
      renderTemplate(SU, SK, 'guardian-standalone', vars),
      renderTemplate(SU, SK, 'bootstrap', vars),
    ])

    const sp = hotspot_id + '/' + VERSION
    const enc = (s: string) => new TextEncoder().encode(s)

    // Upload all 4 scripts with retry
    await Promise.all([
      withRetry(() => sbUpload(SU, SK, 'hotspot-scripts', sp + '/infra.rsc', enc(infra)), 'up:infra'),
      withRetry(() => sbUpload(SU, SK, 'hotspot-scripts', sp + '/sync.rsc', enc(sync)), 'up:sync'),
      withRetry(() => sbUpload(SU, SK, 'hotspot-scripts', sp + '/guardian.rsc', enc(guardian)), 'up:guardian'),
      withRetry(() => sbUpload(SU, SK, 'hotspot-scripts', sp + '/bootstrap.rsc', enc(bootstrap)), 'up:bootstrap'),
    ])

    // Sign all 4 URLs with retry
    const [iu, su2, gu, bu] = await Promise.all([
      withRetry(() => sbSignedUrl(SU, SK, 'hotspot-scripts', sp + '/infra.rsc'), 'sign:infra'),
      withRetry(() => sbSignedUrl(SU, SK, 'hotspot-scripts', sp + '/sync.rsc'), 'sign:sync'),
      withRetry(() => sbSignedUrl(SU, SK, 'hotspot-scripts', sp + '/guardian.rsc'), 'sign:guardian'),
      withRetry(() => sbSignedUrl(SU, SK, 'hotspot-scripts', sp + '/bootstrap.rsc'), 'sign:bootstrap'),
    ])

    // Update hotspot metadata only after everything succeeded
    await sbUpdate(SU, 'hotspots', SK, {
      scripts_version: VERSION, scripts_generated_at: new Date().toISOString(),
      scripts_storage_path: sp, script_gerado: bootstrap,
      script_versao: h.script_versao ? h.script_versao + 1 : 1,
    }, { id: 'eq.' + hotspot_id })
    console.log(`[db:update] hotspot=${hotspot_id} version=${VERSION}`)

    return json({ success: true, version: VERSION, infra_url: iu, sync_url: su2, guardian_url: gu, bootstrap_url: bu, expires_in_seconds: 900, storage_path: sp })
  } catch (e) {
    console.error('[navspot-script-gen ' + VERSION + ']', e)
    return json({ success: false, error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
