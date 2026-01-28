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
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const hotspotSlug = hotspot.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const interfaceWifi = hotspot.interface_wifi || 'wlan1'
  
  let script = `# ============================================
# NAVSPOT MikroTik Configuration Script
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# Version: 3.2 - Fixed Walled-Garden Logic (use lista.tipo)
# ============================================

# AVISO: Este script configura o hotspot do zero.
# Execute apenas em roteadores novos ou após reset.

/system identity set name="${hotspot.nome}"

# ============================================
# Interface Verification with Fallback
# ============================================
:local targetIf "${interfaceWifi}"
:if ([/interface find name=\$targetIf] = "") do={
  :log error "NAVSPOT: Interface \$targetIf nao encontrada!"
  :log info "NAVSPOT: Tentando wlan1..."
  :set targetIf "wlan1"
  :if ([/interface find name=\$targetIf] = "") do={
    :log error "NAVSPOT: Nenhuma interface WiFi encontrada. Tentando ether1..."
    :set targetIf "ether1"
    :if ([/interface find name=\$targetIf] = "") do={
      :log error "NAVSPOT: ERRO CRITICO - Nenhuma interface disponivel. Abortando."
      :error "Interface nao encontrada"
    }
  }
}
:log info ("NAVSPOT: Usando interface " . \$targetIf)

# Save interface to global variable for use throughout script
:global navspotInterface \$targetIf

# ============================================
# IP Address Configuration
# ============================================
/ip address
:do { remove [find interface=\$targetIf comment~"navspot"] } on-error={}
:do { remove [find address="${gateway}/24"] } on-error={}
add address=${gateway}/24 interface=\$targetIf comment="navspot-${hotspotSlug}"

# ============================================
# IP Pool Configuration
# ============================================
/ip pool
:do { remove [find name="hs-pool-${hotspotSlug}"] } on-error={}
add name=hs-pool-${hotspotSlug} ranges=${poolStart}-${poolEnd}

# ============================================
# DHCP Server Network
# ============================================
/ip dhcp-server network
:do { remove [find comment~"navspot-${hotspotSlug}"] } on-error={}
:do { remove [find gateway="${gateway}"] } on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

# ============================================
# DHCP Server
# ============================================
/ip dhcp-server
:do { remove [find name="dhcp-${hotspotSlug}"] } on-error={}
add name="dhcp-${hotspotSlug}" interface=\$targetIf address-pool=hs-pool-${hotspotSlug} disabled=no

# ============================================
# DNS Server (local cache)
# ============================================
/ip dns
set allow-remote-requests=yes

# ============================================
# Hotspot Profile (with Security Settings)
# ============================================
/ip hotspot profile
:do { remove [find name="hsprof-${hotspotSlug}"] } on-error={}
add name=hsprof-${hotspotSlug} hotspot-address=${gateway} dns-name=${hotspotSlug}.navspot.local \\
    html-directory=hotspot login-by=http-chap,http-pap \\
    http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""

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
:do { remove [find name="hs-${hotspotSlug}"] } on-error={}
add name=hs-${hotspotSlug} interface=\$targetIf address-pool=hs-pool-${hotspotSlug} \\
    profile=hsprof-${hotspotSlug} disabled=no

`

  // Users section - Users are now managed via API actions, not embedded in script
  script += `# ============================================
# Users (Tripulantes)
# ============================================
# Users are managed via API actions (create_user, remove_user, etc.)
# When you add tripulantes in the admin panel, they are synced automatically.
# Run /system script run navspot-sync to process pending actions.
/ip hotspot user
# Note: Users are NOT pre-populated in this script.
# They will be created on first sync after adding via admin panel.

`

  // Walled Garden based on access rules
  // IMPORTANT: Walled Garden controls access BEFORE login
  // - action=allow: Allows access without authentication (captive portal bypass)
  // - action=reject: Blocks access even before login
  // Only system domains should have action=allow
  // Blacklisted domains should have action=reject
  // Whitelisted domains don't need walled-garden entries (accessible after login by default)
  
  script += `
# ============================================
# Walled Garden (APENAS sistema e bloqueios)
# ============================================
/ip hotspot walled-garden
# Remove existing walled garden entries for this hotspot
:foreach w in=[find comment~"navspot-${hotspotSlug}"] do={ remove \$w }

# NAVSPOT system domains (APENAS estes com action=allow)
add dst-host="*.navspot.local" action=allow comment="navspot-${hotspotSlug}-system"
add dst-host="*.supabase.co" action=allow comment="navspot-${hotspotSlug}-system"

`

  // Collect blocked domains from BLACKLISTS (using lista.tipo, not regra.acao)
  const blockedDomains = new Set<string>()

  for (const regra of regrasGlobais) {
    if (regra.listas_acesso) {
      // Use lista.tipo to determine behavior - blacklists should be blocked
      if (regra.listas_acesso.tipo === 'blacklist') {
        const dominios = regra.listas_acesso.dominios || []
        for (const dominio of dominios) {
          blockedDomains.add(dominio)
        }
      }
      // Whitelists don't need walled-garden entries
      // After login, hotspot allows all access by default
    }
  }

  // Add blocked domains with action=reject (block even before login)
  if (blockedDomains.size > 0) {
    script += `# Blocked domains (blacklists - reject even before login)\n`
    for (const domain of blockedDomains) {
      script += `add dst-host="${domain}" action=reject comment="navspot-${hotspotSlug}-block"\n`
    }
    script += `\n`
  }

  // Walled Garden IP (essential traffic before auth)
  script += `
# ============================================
# Walled Garden IP (Essential Traffic)
# ============================================
/ip hotspot walled-garden ip
:do { remove [find comment~"navspot-${hotspotSlug}"] } on-error={}

# DNS (UDP + TCP)
add dst-address=0.0.0.0/0 dst-port=53 protocol=udp action=accept comment="navspot-${hotspotSlug}-dns"
add dst-address=0.0.0.0/0 dst-port=53 protocol=tcp action=accept comment="navspot-${hotspotSlug}-dns-tcp"

# DHCP
add dst-address=0.0.0.0/0 dst-port=67-68 protocol=udp action=accept comment="navspot-${hotspotSlug}-dhcp"

# NTP (time sync)
add dst-address=0.0.0.0/0 dst-port=123 protocol=udp action=accept comment="navspot-${hotspotSlug}-ntp"

# ICMP (ping for diagnostics)
add protocol=icmp action=accept comment="navspot-${hotspotSlug}-icmp"

`

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
# Firewall Rules (Block Domains)
# ============================================
/ip firewall filter
# Remove existing NAVSPOT block rules
:foreach f in=[find comment~"navspot-${hotspotSlug}-block"] do={ remove \$f }

`
    l7Index = 0
    for (const domain of blockedDomains) {
      script += `add chain=forward layer7-protocol="navspot-block-${l7Index}" action=drop comment="navspot-${hotspotSlug}-block-${domain}"\n`
      l7Index++
    }
  }

  // Security firewall rules - Optimized with in-interface for robustness
  script += `
# ============================================
# Firewall Rules (Security) - Optimized
# ============================================
/ip firewall filter
# Remove existing NAVSPOT security rules
:foreach f in=[find comment~"navspot-security"] do={ remove \$f }

# Accept established/related connections
add chain=input action=accept connection-state=established,related \\
    comment="navspot-security-established"

# Allow DNS (UDP/TCP) from hotspot interface - works before login
add chain=input action=accept in-interface=\$navspotInterface \\
    dst-port=53 protocol=udp comment="navspot-security-dns"
add chain=input action=accept in-interface=\$navspotInterface \\
    dst-port=53 protocol=tcp comment="navspot-security-dns-tcp"

# Allow WinBox from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} \\
    dst-port=8291 protocol=tcp comment="navspot-security-winbox"

# Allow SSH from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} \\
    dst-port=22 protocol=tcp comment="navspot-security-ssh"

# Allow ICMP from hotspot interface
add chain=input action=accept in-interface=\$navspotInterface \\
    protocol=icmp comment="navspot-security-ping"

# Allow DHCP (discover, renew, release)
add chain=input action=accept dst-port=67-68 protocol=udp comment="navspot-security-dhcp"

# CRITICAL: Allow hotspot HTTP redirect (portal capture)
add chain=input action=accept in-interface=\$navspotInterface \\
    dst-port=80,443,8080 protocol=tcp comment="navspot-security-hotspot-http"

# Drop all other input from hotspot interface
add chain=input action=drop in-interface=\$navspotInterface \\
    comment="navspot-security-drop-other"

# Client Isolation - prevent clients from reaching each other directly
add chain=forward action=drop src-address=${networkCidr} dst-address=${networkCidr} \\
    comment="navspot-security-client-isolation"

`

  // IP Binding for administrative access bypass
  script += `
# ============================================
# IP Binding (Administrative Access Bypass)
# ============================================
/ip hotspot ip-binding
:do { remove [find comment~"navspot-admin-bypass"] } on-error={}

# Bypass hotspot authentication for local network (administrative access)
# This allows WinBox/SSH access without hotspot login requirement
add address=${networkCidr} type=bypassed comment="navspot-admin-bypass"

`

  // Token stored in separate file for security (with increased delay)
  script += `# ============================================
# Sync Token (Stored Securely)
# ============================================
/file
:do { remove [find name="navspot-token.txt"] } on-error={}
:delay 500ms
# Create file with contents (try direct method first, fallback for newer firmwares)
:do {
  /file add name="navspot-token.txt" contents="${hotspot.sync_token}"
} on-error={
  /file print file="navspot-token" where name=""
  :delay 1s
  /file set "navspot-token.txt" contents="${hotspot.sync_token}"
}
:log info "NAVSPOT: Token salvo em arquivo"

`

  // Enhanced sync script with proper JSON parsing for pipe-delimited actions
  script += `# ============================================
# NAVSPOT Sync Script (v3 - Fixed JSON Parsing)
# ============================================
/system script
:do { remove [find name="navspot-sync"] } on-error={}
add name="navspot-sync" owner=admin policy=read,write,test,policy source={
  :local syncToken [/file get "navspot-token.txt" contents]
  :local syncUrl "${syncUrl}"
  
  # Collect active users with device info
  :local activeUsers ""
  :local userCount 0
  :foreach session in=[/ip hotspot active find] do={
    :local userName [/ip hotspot active get \$session user]
    :local userMac [/ip hotspot active get \$session mac-address]
    :local userUptime [/ip hotspot active get \$session uptime]
    :local bytesIn [/ip hotspot active get \$session bytes-in]
    :local bytesOut [/ip hotspot active get \$session bytes-out]
    :local userIp [/ip hotspot active get \$session address]
    
    :if (\$activeUsers != "") do={
      :set activeUsers (\$activeUsers . ",")
    }
    :set activeUsers (\$activeUsers . "{\\"user\\":\\"" . \$userName . "\\",\\"mac\\":\\"" . \$userMac . "\\",\\"uptime\\":\\"" . \$userUptime . "\\",\\"bytes_in\\":" . \$bytesIn . ",\\"bytes_out\\":" . \$bytesOut . ",\\"ip\\":\\"" . \$userIp . "\\"}")
    :set userCount (\$userCount + 1)
  }
  
  # Read executed actions from file
  :local executedActions ""
  :do {
    :set executedActions [/file get "navspot-executed.txt" contents]
    /file remove "navspot-executed.txt"
  } on-error={}
  
  :local payload "{\\"sync_token\\":\\"" . \$syncToken . "\\",\\"active_users\\":[" . \$activeUsers . "],\\"executed_actions\\":[" . \$executedActions . "]}"
  
  :log info ("NAVSPOT: Syncing " . \$userCount . " active sessions...")
  
  :do {
    :local result [/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$payload http-header-field="Content-Type: application/json" output=user as-value]
    :local response (\$result->"data")
    :log info "NAVSPOT: Sync completed successfully"
    
    # Extract pending_actions_pipe from JSON response
    # Format in response: "pending_actions_pipe":"id|type|p1\\nid2|type2|p2"
    :local marker "pending_actions_pipe\\":\\""
    :local pipeStart [:find \$response \$marker]
    
    :if (\$pipeStart > 0) do={
      :local contentStart (\$pipeStart + [:len \$marker])
      :local contentEnd [:find \$response "\\"" \$contentStart]
      
      :if (\$contentEnd > \$contentStart) do={
        :local pipeContent [:pick \$response \$contentStart \$contentEnd]
        
        # Convert \\n to actual newlines for processing
        :local cleanContent ""
        :local i 0
        :while (\$i < [:len \$pipeContent]) do={
          :local char [:pick \$pipeContent \$i (\$i+1)]
          :if (\$char = "\\\\" && ([:pick \$pipeContent (\$i+1) (\$i+2)] = "n")) do={
            :set cleanContent (\$cleanContent . "\\n")
            :set i (\$i + 2)
          } else={
            :set cleanContent (\$cleanContent . \$char)
            :set i (\$i + 1)
          }
        }
        
        :if ([:len \$cleanContent] > 2) do={
          /file print file="navspot-actions" where name=""
          :delay 1s
          /file set "navspot-actions.txt" contents=\$cleanContent
          :log info ("NAVSPOT: " . [:len \$cleanContent] . " bytes of actions to process")
          /system script run navspot-action-processor
        }
      }
    }
    
  } on-error={
    :log warning "NAVSPOT: Sync failed - will retry on next interval"
  }
}

# ============================================
# Action Processor Script (v3 - Manual Parsing)
# ============================================
:do { remove [find name="navspot-action-processor"] } on-error={}
add name="navspot-action-processor" owner=admin policy=read,write,test,policy source={
  :local actionFile "navspot-actions.txt"
  :local executedFile "navspot-executed.txt"
  
  :do {
    :local content [/file get \$actionFile contents]
    
    # Initialize executed list
    :local executed ""
    :do {
      :set executed [/file get \$executedFile contents]
    } on-error={
      :set executed ""
    }
    
    # Process line by line (manual parsing - no :toarray with separator)
    :local remaining \$content
    :while ([:len \$remaining] > 0) do={
      # Find end of line
      :local lineEnd [:find \$remaining "\\n"]
      :local line ""
      :if (\$lineEnd > 0) do={
        :set line [:pick \$remaining 0 \$lineEnd]
        :set remaining [:pick \$remaining (\$lineEnd+1) [:len \$remaining]]
      } else={
        :set line \$remaining
        :set remaining ""
      }
      
      :if ([:len \$line] > 5) do={
        # Manual parsing: extract fields separated by |
        # Format: actionId|actionType|param1|param2|param3
        :local pos1 [:find \$line "|"]
        :if (\$pos1 > 0) do={
          :local actionId [:pick \$line 0 \$pos1]
          :local rest [:pick \$line (\$pos1+1) [:len \$line]]
          
          :local pos2 [:find \$rest "|"]
          :local actionType ""
          :local rest2 ""
          :if (\$pos2 > 0) do={
            :set actionType [:pick \$rest 0 \$pos2]
            :set rest2 [:pick \$rest (\$pos2+1) [:len \$rest]]
          } else={
            :set actionType \$rest
            :set rest2 ""
          }
          
          :local pos3 [:find \$rest2 "|"]
          :local param1 ""
          :local param2 ""
          :local param3 ""
          :if (\$pos3 > 0) do={
            :set param1 [:pick \$rest2 0 \$pos3]
            :local rest3 [:pick \$rest2 (\$pos3+1) [:len \$rest2]]
            :local pos4 [:find \$rest3 "|"]
            :if (\$pos4 > 0) do={
              :set param2 [:pick \$rest3 0 \$pos4]
              :set param3 [:pick \$rest3 (\$pos4+1) [:len \$rest3]]
            } else={
              :set param2 \$rest3
            }
          } else={
            :set param1 \$rest2
          }
          
          # Validate action type before processing
          :if ([:len \$actionType] = 0) do={
            :log warning ("NAVSPOT: Action " . \$actionId . " has empty type, skipping")
          } else={
            :log info ("NAVSPOT: Action " . \$actionId . " type " . \$actionType)
            
            # Execute action based on type (with parameter validation)
            :if (\$actionType = "kick_session" || \$actionType = "kick_device") do={
              :if ([:len \$param1] > 0 || [:len \$param2] > 0) do={
                :do {
                  :if ([:len \$param2] > 0) do={
                    /ip hotspot active remove [find mac-address=\$param2]
                  } else={
                    /ip hotspot active remove [find user=\$param1]
                  }
                  :log info ("NAVSPOT: Kicked " . \$param1)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: kick action missing params")
              }
            }
            
            :if (\$actionType = "disable_user") do={
              :if ([:len \$param1] > 0) do={
                :do {
                  /ip hotspot user set [find name=\$param1] disabled=yes
                  :log info ("NAVSPOT: Disabled user " . \$param1)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: disable_user missing username")
              }
            }
            
            :if (\$actionType = "enable_user") do={
              :if ([:len \$param1] > 0) do={
                :do {
                  /ip hotspot user set [find name=\$param1] disabled=no
                  :log info ("NAVSPOT: Enabled user " . \$param1)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: enable_user missing username")
              }
            }
            
            :if (\$actionType = "update_password") do={
              :if ([:len \$param1] > 0 && [:len \$param2] > 0) do={
                :do {
                  /ip hotspot user set [find name=\$param1] password=\$param2
                  :log info ("NAVSPOT: Updated password for " . \$param1)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: update_password missing params")
              }
            }
            
            :if (\$actionType = "add_user" || \$actionType = "create_user") do={
              :if ([:len \$param1] > 0 && [:len \$param2] > 0) do={
                :do {
                  :local profile \$param3
                  :if ([:len \$profile] = 0) do={ 
                    # Use first available profile or MikroTik default
                    :local firstProfile [/ip hotspot user profile find where name!="default" limit=1]
                    :if ([:len \$firstProfile] > 0) do={
                      :set profile [/ip hotspot user profile get \$firstProfile name]
                    } else={
                      :set profile "default"
                    }
                  }
                  /ip hotspot user add name=\$param1 password=\$param2 profile=\$profile server=hs-${hotspotSlug}
                  :log info ("NAVSPOT: Added user " . \$param1 . " with profile " . \$profile)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={
                  :log warning ("NAVSPOT: User " . \$param1 . " might already exist")
                }
              } else={
                :log warning ("NAVSPOT: add_user missing username or password")
              }
            }
            
            :if (\$actionType = "remove_user") do={
              :if ([:len \$param1] > 0) do={
                :do {
                  /ip hotspot user remove [find name=\$param1]
                  :log info ("NAVSPOT: Removed user " . \$param1)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: remove_user missing username")
              }
            }
            
            :if (\$actionType = "update_profile" || \$actionType = "update_user_profile") do={
              :if ([:len \$param1] > 0 && [:len \$param2] > 0) do={
                :do {
                  /ip hotspot user set [find name=\$param1] profile=\$param2
                  :log info ("NAVSPOT: Updated profile for " . \$param1 . " to " . \$param2)
                  :set executed (\$executed . "\\"" . \$actionId . "\\",")
                } on-error={}
              } else={
                :log warning ("NAVSPOT: update_profile missing params")
              }
            }
          }
        }
      }
    }
    
    # Save executed actions for next sync
    :if ([:len \$executed] > 0) do={
      /file print file="navspot-executed" where name=""
      :delay 1s
      /file set "navspot-executed.txt" contents=\$executed
    }
    
    # Clean up action file
    :do { /file remove \$actionFile } on-error={}
    
  } on-error={
    :log debug "NAVSPOT: No pending actions to process"
  }
}

# ============================================
# Health Check Script
# ============================================
:do { remove [find name="navspot-health"] } on-error={}
add name="navspot-health" owner=admin policy=read,write,test source={
  :local hotspotName "hs-${hotspotSlug}"
  :local dhcpName "dhcp-${hotspotSlug}"
  :local issues 0
  
  # Check if hotspot is enabled
  :if ([/ip hotspot find name=\$hotspotName disabled=no] = "") do={
    :log warning "NAVSPOT: Hotspot desativado, reativando..."
    :do { /ip hotspot enable \$hotspotName } on-error={}
    :set issues (\$issues + 1)
  }
  
  # Check if DHCP is enabled
  :if ([/ip dhcp-server find name=\$dhcpName disabled=no] = "") do={
    :log warning "NAVSPOT: DHCP desativado, reativando..."
    :do { /ip dhcp-server enable \$dhcpName } on-error={}
    :set issues (\$issues + 1)
  }
  
  # Check sync scheduler
  :if ([/system scheduler find name="navspot-sync-scheduler" disabled=no] = "") do={
    :log warning "NAVSPOT: Scheduler desativado, reativando..."
    :do { /system scheduler enable "navspot-sync-scheduler" } on-error={}
    :set issues (\$issues + 1)
  }
  
  :if (\$issues = 0) do={
    :log info "NAVSPOT: Health check OK"
  } else={
    :log warning ("NAVSPOT: Health check corrigiu " . \$issues . " problema(s)")
  }
}

# ============================================
# Schedulers
# ============================================
/system scheduler
:do { remove [find name="navspot-sync-scheduler"] } on-error={}
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" \\
    start-time=startup policy=read,write,test

:do { remove [find name="navspot-health-scheduler"] } on-error={}
add name="navspot-health-scheduler" interval=1h on-event="/system script run navspot-health" \\
    start-time=startup policy=read,write,test

# ============================================
# Initial Delay and First Sync
# ============================================
:delay 5s
/system script run navspot-sync
/system script run navspot-health

:log info "============================================"
:log info "NAVSPOT: Configuracao completa para ${hotspot.nome}"
:log info "NAVSPOT: ${tripulantes.length} usuarios, ${perfis.length} perfis"
:log info ("NAVSPOT: Interface: " . \$navspotInterface . ", Gateway: ${gateway}")
:log info "NAVSPOT: Sync a cada ${hotspot.sync_interval_minutes} minutos"
:log info "============================================"
`

  return script
}
