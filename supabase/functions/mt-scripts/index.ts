import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERSION = "7.5.2"
const DEPLOYED_AT = new Date().toISOString()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ROSConfig { delayAfterFetch: number; delayAfterFileWrite: number; contentRetryCount: number }
const ROS_CONFIGS: Record<string, ROSConfig> = {
  '6': { delayAfterFetch: 2500, delayAfterFileWrite: 1500, contentRetryCount: 3 },
  '7': { delayAfterFetch: 500, delayAfterFileWrite: 300, contentRetryCount: 1 },
}
function getROSConfig(v: string): ROSConfig { return ROS_CONFIGS[v] || ROS_CONFIGS['6'] }
function maskToken(t: string): string { if (!t || t.length < 10) return '***'; return `${t.slice(0,4)}...${t.slice(-4)}` }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const url = new URL(req.url)
    const scriptType = url.searchParams.get('type') || 'all'

    if (scriptType === 'health') {
      return new Response(JSON.stringify({ version: VERSION, status: "ok", deployed_at: DEPLOYED_AT }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const syncToken = url.searchParams.get('token')
    const rosVersion = url.searchParams.get('ros_version') || '6'
    if (!syncToken) return new Response('# Error: token required', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })

    console.log(`[mt-scripts ${VERSION}] type=${scriptType}, token=${maskToken(syncToken)}, ros=${rosVersion}`)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, nome, sync_token, sync_interval_minutes, ros_version, embarcacoes!inner(id, nome, empresa_id)')
      .eq('sync_token', syncToken)
      .single()

    if (hotspotError || !hotspot) return new Response('# Error: Invalid sync token', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })

    const effRos = hotspot.ros_version === 'auto' ? rosVersion : (hotspot.ros_version || rosVersion)
    const rosConfig = getROSConfig(effRos)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
    const recoveryUrl = `${supabaseUrl}/functions/v1/mikrotik-recovery-download`
    const apiBase = `${supabaseUrl}/functions/v1`
    const syncMin = hotspot.sync_interval_minutes || 5

    // Map type to template id
    const templateId = scriptType === 'sync-raw' ? 'sync'
      : scriptType === 'guardian-raw' ? 'guardian' : 'installer'

    // Fetch template from database
    const { data: tpl, error: tplError } = await supabase
      .from('script_templates')
      .select('content')
      .eq('id', templateId)
      .single()

    if (tplError || !tpl) {
      console.error(`[mt-scripts ${VERSION}] Template not found: ${templateId}`, tplError)
      return new Response('# Error: Template not found', { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    // Replace placeholders (with fallback to "" for undefined)
    const script = tpl.content
      .replace(/\{\{VERSION\}\}/g, VERSION)
      .replace(/\{\{SYNC_TOKEN\}\}/g, syncToken || '')
      .replace(/\{\{SYNC_URL\}\}/g, syncUrl || '')
      .replace(/\{\{RECOVERY_URL\}\}/g, recoveryUrl || '')
      .replace(/\{\{API_BASE\}\}/g, apiBase || '')
      .replace(/\{\{DEPLOYED_AT\}\}/g, DEPLOYED_AT)
      .replace(/\{\{ROS_VERSION\}\}/g, effRos || '')
      .replace(/\{\{SYNC_INTERVAL\}\}/g, String(syncMin))
      .replace(/\{\{FETCH_DELAY\}\}/g, String(rosConfig.delayAfterFetch))
      .replace(/\{\{WRITE_DELAY\}\}/g, String(rosConfig.delayAfterFileWrite))
      .replace(/\{\{MAX_RETRIES\}\}/g, String(rosConfig.contentRetryCount))

    console.log(`[mt-scripts ${VERSION}] ${scriptType} (${script.length}b)`)

    return new Response(script, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(new TextEncoder().encode(script).length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

  } catch (error) {
    console.error(`[mt-scripts ${VERSION}] Error:`, error)
    return new Response(`# Error: ${error instanceof Error ? error.message : 'Internal server error'}`, { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } })
  }
})
