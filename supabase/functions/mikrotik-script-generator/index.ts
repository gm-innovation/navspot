import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PerfilVelocidade {
  id: string
  nome: string
  velocidade_download: string
  velocidade_upload: string
  limite_dados_mb: number | null
  prioridade: number
  session_timeout_minutos: number | null
}

interface Tripulante {
  login_wifi: string
  senha_wifi: string
  status: string
  perfis_velocidade: PerfilVelocidade | null
}

interface Hotspot {
  id: string
  nome: string
  interface_wifi: string
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

    console.log(`[script-generator] Generating script for hotspot: ${hotspot_id}`)

    // Fetch hotspot with embarcacao
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`
        id, nome, interface_wifi, rede, sync_token, sync_interval_minutes, max_usuarios,
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

    // Fetch speed profiles for the company
    const { data: perfis } = await supabase
      .from('perfis_velocidade')
      .select('*')
      .eq('empresa_id', embarcacao.empresa_id)
      .order('prioridade', { ascending: true })

    // Fetch tripulantes for the embarcacao
    const { data: tripulantes } = await supabase
      .from('tripulantes')
      .select(`
        login_wifi, senha_wifi, status,
        perfis_velocidade(id, nome, velocidade_download, velocidade_upload, limite_dados_mb, prioridade, session_timeout_minutos)
      `)
      .eq('embarcacao_id', embarcacao.id)
      .eq('status', 'ativo')

    // Generate RSC script
    const script = generateMikroTikScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      perfis || [],
      (tripulantes || []) as unknown as Tripulante[],
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

    console.log(`[script-generator] Script generated successfully for ${hotspot.nome}`)

    return new Response(
      JSON.stringify({
        success: true,
        script,
        hotspot_name: hotspot.nome,
        tripulantes_count: tripulantes?.length || 0,
        perfis_count: perfis?.length || 0
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

function generateMikroTikScript(
  hotspot: Hotspot,
  embarcacao: Embarcacao,
  perfis: PerfilVelocidade[],
  tripulantes: Tripulante[],
  supabaseUrl: string
): string {
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  
  let script = `# ============================================
# NAVSPOT MikroTik Configuration Script
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# ============================================

# AVISO: Este script configura o hotspot do zero.
# Execute apenas em roteadores novos ou após reset.

/system identity set name="${hotspot.nome}"

# ============================================
# IP Pool Configuration
# ============================================
/ip pool
add name=hs-pool-${hotspot.nome} ranges=${poolStart}-${poolEnd}

# ============================================
# DHCP Server (if not already configured)
# ============================================
:do {
  /ip dhcp-server add name=dhcp-hs address-pool=hs-pool-${hotspot.nome} interface=${hotspot.interface_wifi} disabled=no
} on-error={:log warning "DHCP server may already exist"}

# ============================================
# Hotspot Profiles (Rate Limits)
# ============================================
/ip hotspot profile
add name=hsprof-${hotspot.nome} hotspot-address=${gateway} dns-name=${hotspot.nome.toLowerCase().replace(/\s+/g, '-')}.navspot.local \\
    html-directory=hotspot rate-limit=""

`

  // Add user profiles with rate limits
  script += `# ============================================
# User Profiles (Speed/Quota)
# ============================================
/ip hotspot user profile
`

  for (const perfil of perfis) {
    const rateLimit = `${perfil.velocidade_upload}/${perfil.velocidade_download}`
    const limitBytes = perfil.limite_dados_mb ? perfil.limite_dados_mb * 1024 * 1024 : 0
    const sessionTimeout = perfil.session_timeout_minutos ? `${perfil.session_timeout_minutos}m` : '0s'
    
    script += `add name="${perfil.nome}" rate-limit="${rateLimit}" `
    if (limitBytes > 0) {
      script += `limit-bytes-total=${limitBytes} `
    }
    if (perfil.session_timeout_minutos) {
      script += `session-timeout=${sessionTimeout} `
    }
    script += `shared-users=1\n`
  }

  // Default profile if no profiles exist
  if (perfis.length === 0) {
    script += `add name="default" rate-limit="2M/5M" shared-users=1\n`
  }

  // Configure hotspot server
  script += `
# ============================================
# Hotspot Server
# ============================================
/ip hotspot
add name=hs-${hotspot.nome} interface=${hotspot.interface_wifi} address-pool=hs-pool-${hotspot.nome} \\
    profile=hsprof-${hotspot.nome} disabled=no

`

  // Add users
  script += `# ============================================
# Users (Tripulantes)
# ============================================
/ip hotspot user
`

  for (const tripulante of tripulantes) {
    const profileName = tripulante.perfis_velocidade?.nome || 'default'
    script += `add name="${tripulante.login_wifi}" password="${tripulante.senha_wifi}" profile="${profileName}" server=hs-${hotspot.nome}\n`
  }

  // Walled Garden
  script += `
# ============================================
# Walled Garden (Domains allowed without auth)
# ============================================
/ip hotspot walled-garden
add dst-host="*.navspot.local" action=allow
add dst-host="*.supabase.co" action=allow

/ip hotspot walled-garden ip
add dst-address=0.0.0.0/0 dst-port=53 protocol=udp action=accept comment="Allow DNS"

`

  // Sync script
  script += `# ============================================
# NAVSPOT Sync Script
# ============================================
/system script
add name="navspot-sync" owner=admin policy=read,write,test source={
  :local syncToken "${hotspot.sync_token}"
  :local syncUrl "${syncUrl}"
  
  # Collect active users
  :local activeUsers ""
  :foreach user in=[/ip hotspot active find] do={
    :local userName [/ip hotspot active get \$user user]
    :local userMac [/ip hotspot active get \$user mac-address]
    :local userUptime [/ip hotspot active get \$user uptime]
    :local bytesIn [/ip hotspot active get \$user bytes-in]
    :local bytesOut [/ip hotspot active get \$user bytes-out]
    :local userIp [/ip hotspot active get \$user address]
    
    :if (\$activeUsers != "") do={
      :set activeUsers (\$activeUsers . ",")
    }
    :set activeUsers (\$activeUsers . "{\\"user\\":\\"" . \$userName . "\\",\\"mac\\":\\"" . \$userMac . "\\",\\"uptime\\":\\"" . \$uptime . "\\",\\"bytes_in\\":" . \$bytesIn . ",\\"bytes_out\\":" . \$bytesOut . ",\\"ip\\":\\"" . \$userIp . "\\"}")
  }
  
  :local payload "{\\"sync_token\\":\\"" . \$syncToken . "\\",\\"active_users\\":[" . \$activeUsers . "],\\"executed_actions\\":[]}"
  
  :log info "NAVSPOT: Syncing..."
  
  :do {
    /tool fetch url=\$syncUrl mode=https http-method=post http-data=\$payload http-header-field="Content-Type: application/json" output=user as-value
    :log info "NAVSPOT: Sync completed"
  } on-error={
    :log warning "NAVSPOT: Sync failed - will retry"
  }
}

# ============================================
# Scheduler for Auto-Sync
# ============================================
/system scheduler
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" \\
    start-time=startup policy=read,write,test

# ============================================
# Initial Sync
# ============================================
:delay 5s
/system script run navspot-sync

:log info "NAVSPOT: Configuration completed for ${hotspot.nome}"
`

  return script
}
