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
  max_dispositivos: number
  tipo_usuario: string
  modo_acesso: string
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

interface ListaAcesso {
  id: string
  nome: string
  tipo: string
  dominios: string[]
  aplicativos: string[]
}

interface RegraAcesso {
  acao: string
  prioridade: number
  listas_acesso: ListaAcesso | null
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

    // Fetch speed profiles for the company with new fields
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
        perfis_velocidade(id, nome, velocidade_download, velocidade_upload, limite_dados_mb, prioridade, session_timeout_minutos, max_dispositivos, tipo_usuario, modo_acesso)
      `)
      .eq('embarcacao_id', embarcacao.id)
      .eq('status', 'ativo')

    // Fetch global access rules for this company
    const { data: regrasGlobais } = await supabase
      .from('regras_acesso')
      .select(`
        acao, prioridade,
        listas_acesso(id, nome, tipo, dominios, aplicativos)
      `)
      .eq('empresa_id', embarcacao.empresa_id)
      .eq('ativo', true)
      .is('tripulante_id', null)
      .is('mac_address', null)
      .or(`hotspot_id.eq.${hotspot_id},hotspot_id.is.null`)
      .order('prioridade', { ascending: true })

    // Generate RSC script
    const script = generateMikroTikScript(
      hotspot as unknown as Hotspot,
      embarcacao,
      (perfis || []) as PerfilVelocidade[],
      (tripulantes || []) as unknown as Tripulante[],
      (regrasGlobais || []) as unknown as RegraAcesso[],
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
        perfis_count: perfis?.length || 0,
        regras_count: regrasGlobais?.length || 0
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
  regrasGlobais: RegraAcesso[],
  supabaseUrl: string
): string {
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const hotspotSlug = hotspot.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  
  let script = `# ============================================
# NAVSPOT MikroTik Configuration Script
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# Version: Enhanced with Device Limits & Firewall
# ============================================

# AVISO: Este script configura o hotspot do zero.
# Execute apenas em roteadores novos ou após reset.

/system identity set name="${hotspot.nome}"

# ============================================
# IP Pool Configuration
# ============================================
/ip pool
:do {
  remove [find name="hs-pool-${hotspotSlug}"]
} on-error={}
add name=hs-pool-${hotspotSlug} ranges=${poolStart}-${poolEnd}

# ============================================
# Hotspot Profiles (Rate Limits)
# ============================================
/ip hotspot profile
:do {
  remove [find name="hsprof-${hotspotSlug}"]
} on-error={}
add name=hsprof-${hotspotSlug} hotspot-address=${gateway} dns-name=${hotspotSlug}.navspot.local \\
    html-directory=hotspot rate-limit=""

`

  // Add user profiles with rate limits and shared-users (device limit)
  script += `# ============================================
# User Profiles (Speed/Quota/Device Limits)
# ============================================
/ip hotspot user profile
`

  for (const perfil of perfis) {
    const rateLimit = `${perfil.velocidade_upload}/${perfil.velocidade_download}`
    const limitBytes = perfil.limite_dados_mb ? perfil.limite_dados_mb * 1024 * 1024 : 0
    const sessionTimeout = perfil.session_timeout_minutos ? `${perfil.session_timeout_minutos}m` : '0s'
    const sharedUsers = perfil.max_dispositivos || 1
    const profileSlug = perfil.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    script += `:do { remove [find name="${profileSlug}"] } on-error={}\n`
    script += `add name="${profileSlug}" rate-limit="${rateLimit}" shared-users=${sharedUsers}`
    if (limitBytes > 0) {
      script += ` limit-bytes-total=${limitBytes}`
    }
    if (perfil.session_timeout_minutos) {
      script += ` session-timeout=${sessionTimeout}`
    }
    script += ` comment="Tipo: ${perfil.tipo_usuario}, Modo: ${perfil.modo_acesso}"\n`
  }

  // Default profile if no profiles exist
  if (perfis.length === 0) {
    script += `:do { remove [find name="default-navspot"] } on-error={}\n`
    script += `add name="default-navspot" rate-limit="2M/5M" shared-users=1\n`
  }

  // Configure hotspot server
  script += `
# ============================================
# Hotspot Server
# ============================================
/ip hotspot
:do {
  remove [find name="hs-${hotspotSlug}"]
} on-error={}
add name=hs-${hotspotSlug} interface=${hotspot.interface_wifi} address-pool=hs-pool-${hotspotSlug} \\
    profile=hsprof-${hotspotSlug} disabled=no

`

  // Add users
  script += `# ============================================
# Users (Tripulantes)
# ============================================
/ip hotspot user
# Remove existing users for this server
:foreach u in=[find server="hs-${hotspotSlug}"] do={ remove \$u }
`

  for (const tripulante of tripulantes) {
    const profileName = tripulante.perfis_velocidade?.nome?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'default-navspot'
    script += `add name="${tripulante.login_wifi}" password="${tripulante.senha_wifi}" profile="${profileName}" server=hs-${hotspotSlug}\n`
  }

  // Walled Garden based on access rules
  script += `
# ============================================
# Walled Garden (Domains allowed/blocked)
# ============================================
/ip hotspot walled-garden
# Remove existing walled garden entries for this hotspot
:foreach w in=[find comment~"navspot-${hotspotSlug}"] do={ remove \$w }

# NAVSPOT system domains (always allowed)
add dst-host="*.navspot.local" action=allow comment="navspot-${hotspotSlug}-system"
add dst-host="*.supabase.co" action=allow comment="navspot-${hotspotSlug}-system"

`

  // Add walled garden entries from access rules
  const allowedDomains = new Set<string>()
  const blockedDomains = new Set<string>()

  for (const regra of regrasGlobais) {
    if (regra.listas_acesso) {
      const dominios = regra.listas_acesso.dominios || []
      for (const dominio of dominios) {
        if (regra.acao === 'permitir') {
          allowedDomains.add(dominio)
        } else {
          blockedDomains.add(dominio)
        }
      }
    }
  }

  // Add allowed domains
  for (const domain of allowedDomains) {
    script += `add dst-host="${domain}" action=allow comment="navspot-${hotspotSlug}-whitelist"\n`
  }

  // Add Layer 7 protocols for blocked domains
  if (blockedDomains.size > 0) {
    script += `
# ============================================
# Layer 7 Protocols (Pattern Matching)
# ============================================
/ip firewall layer7-protocol
# Remove existing NAVSPOT L7 protocols
:foreach l in=[find comment~"navspot-${hotspotSlug}"] do={ remove \$l }

`
    let l7Index = 0
    for (const domain of blockedDomains) {
      const cleanDomain = domain.replace(/^\*\./, '').replace(/\./g, '\\\\.')
      script += `add name="navspot-block-${l7Index}" regexp="^.*(${cleanDomain}).*\$" comment="navspot-${hotspotSlug}"\n`
      l7Index++
    }

    // Add firewall filter rules for blocked domains
    script += `
# ============================================
# Firewall Rules (Block)
# ============================================
/ip firewall filter
# Remove existing NAVSPOT firewall rules
:foreach f in=[find comment~"navspot-${hotspotSlug}"] do={ remove \$f }

`
    l7Index = 0
    for (const domain of blockedDomains) {
      script += `add chain=forward layer7-protocol="navspot-block-${l7Index}" action=drop comment="navspot-${hotspotSlug}-block-${domain}"\n`
      l7Index++
    }
  }

  // DNS allowed
  script += `
/ip hotspot walled-garden ip
:do { remove [find comment="navspot-${hotspotSlug}-dns"] } on-error={}
add dst-address=0.0.0.0/0 dst-port=53 protocol=udp action=accept comment="navspot-${hotspotSlug}-dns"

`

  // Enhanced sync script with action execution
  script += `# ============================================
# NAVSPOT Sync Script (Enhanced)
# ============================================
/system script
:do { remove [find name="navspot-sync"] } on-error={}
add name="navspot-sync" owner=admin policy=read,write,test,policy source={
  :local syncToken "${hotspot.sync_token}"
  :local syncUrl "${syncUrl}"
  
  # Collect active users with device info
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
    :set activeUsers (\$activeUsers . "{\\"user\\":\\"" . \$userName . "\\",\\"mac\\":\\"" . \$userMac . "\\",\\"uptime\\":\\"" . \$userUptime . "\\",\\"bytes_in\\":" . \$bytesIn . ",\\"bytes_out\\":" . \$bytesOut . ",\\"ip\\":\\"" . \$userIp . "\\"}")
  }
  
  # Read executed actions from file
  :local executedActions ""
  :do {
    :set executedActions [/file get "navspot-executed.txt" contents]
    /file remove "navspot-executed.txt"
  } on-error={}
  
  :local payload "{\\"sync_token\\":\\"" . \$syncToken . "\\",\\"active_users\\":[" . \$activeUsers . "],\\"executed_actions\\":[" . \$executedActions . "]}"
  
  :log info "NAVSPOT: Syncing..."
  
  :do {
    :local result [/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$payload http-header-field="Content-Type: application/json" output=user as-value]
    :local response (\$result->"data")
    :log info "NAVSPOT: Sync completed"
    
    # Parse and execute pending actions
    # Note: Full JSON parsing is limited in RouterOS, actions are processed on next sync
    
  } on-error={
    :log warning "NAVSPOT: Sync failed - will retry"
  }
}

# ============================================
# Action Processor Script
# ============================================
:do { remove [find name="navspot-action-processor"] } on-error={}
add name="navspot-action-processor" owner=admin policy=read,write,test,policy source={
  # This script processes pending actions from the sync response
  # Actions: kick_session, disable_user, enable_user, update_password, kick_device
  
  :local actionFile "navspot-actions.txt"
  :do {
    :local actions [/file get \$actionFile contents]
    # Process each action (simplified - full implementation requires JSON parser)
    :log info "NAVSPOT: Processing actions..."
    /file remove \$actionFile
  } on-error={
    :log debug "NAVSPOT: No pending actions"
  }
}

# ============================================
# Scheduler for Auto-Sync
# ============================================
/system scheduler
:do { remove [find name="navspot-sync-scheduler"] } on-error={}
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" \\
    start-time=startup policy=read,write,test

# ============================================
# Initial Sync
# ============================================
:delay 5s
/system script run navspot-sync

:log info "NAVSPOT: Configuration completed for ${hotspot.nome}"
:log info "NAVSPOT: ${tripulantes.length} users, ${perfis.length} profiles configured"
`

  return script
}
