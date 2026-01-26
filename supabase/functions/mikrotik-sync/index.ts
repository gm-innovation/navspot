import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ActiveUser {
  user: string
  mac: string
  uptime: string
  bytes_in: number
  bytes_out: number
  ip?: string
}

interface SyncPayload {
  sync_token: string
  active_users?: ActiveUser[]
  executed_actions?: string[]
  // New: device count per user for limit validation
  user_device_counts?: { user: string; count: number; macs: string[] }[]
}

interface PendingAction {
  id: string
  type: string
  payload: Record<string, unknown>
}

interface DeviceViolation {
  user: string
  max_allowed: number
  current_count: number
  macs_to_kick: string[]
}

// Helper to create alerts without duplicating recent ones
async function createAlertIfNotRecent(
  supabase: ReturnType<typeof createClient>,
  alertData: {
    tipo: string
    severidade: string
    mensagem: string
    hotspot_id?: string
    embarcacao_id?: string
    empresa_id?: string
    tripulante_id?: string
  },
  dedupeMinutes: number = 30
) {
  // Check for recent duplicate
  const cutoff = new Date(Date.now() - dedupeMinutes * 60 * 1000).toISOString()
  
  const { data: existing } = await supabase
    .from('alertas')
    .select('id')
    .eq('tipo', alertData.tipo)
    .eq('resolvido', false)
    .gte('created_at', cutoff)
    .eq('hotspot_id', alertData.hotspot_id || null)
    .eq('tripulante_id', alertData.tripulante_id || null)
    .maybeSingle()

  if (existing) {
    console.log(`[mikrotik-sync] Alert already exists, skipping: ${alertData.tipo}`)
    return null
  }

  const { data, error } = await supabase
    .from('alertas')
    .insert(alertData)
    .select()
    .single()

  if (error) {
    console.error('[mikrotik-sync] Failed to create alert:', error)
    return null
  }

  console.log(`[mikrotik-sync] Created alert: ${alertData.tipo} - ${alertData.mensagem}`)
  return data
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Parse request body
    const payload: SyncPayload = await req.json()
    console.log('[mikrotik-sync] Received sync request:', JSON.stringify(payload))

    // Validate sync_token
    if (!payload.sync_token) {
      console.error('[mikrotik-sync] Missing sync_token')
      return new Response(
        JSON.stringify({ success: false, error: 'sync_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find hotspot by sync_token
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, embarcacao_id, nome, status')
      .eq('sync_token', payload.sync_token)
      .single()

    if (hotspotError || !hotspot) {
      console.error('[mikrotik-sync] Invalid sync_token:', hotspotError)
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid sync_token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[mikrotik-sync] Hotspot found: ${hotspot.nome} (${hotspot.id})`)

    // Get embarcacao for empresa_id
    const { data: embarcacao } = await supabase
      .from('embarcacoes')
      .select('id, empresa_id')
      .eq('id', hotspot.embarcacao_id)
      .single()

    // If hotspot was offline, auto-resolve offline alerts and mark as back online
    if (hotspot.status === 'offline') {
      console.log('[mikrotik-sync] Hotspot was offline, resolving offline alerts')
      await supabase
        .from('alertas')
        .update({ resolvido: true, resolvido_at: new Date().toISOString() })
        .eq('hotspot_id', hotspot.id)
        .eq('tipo', 'hotspot_offline')
        .eq('resolvido', false)
    }

    // Update hotspot status and last sync time
    const { error: updateError } = await supabase
      .from('hotspots')
      .update({
        status: 'online',
        ultima_sincronizacao: new Date().toISOString()
      })
      .eq('id', hotspot.id)

    if (updateError) {
      console.error('[mikrotik-sync] Failed to update hotspot status:', updateError)
    }

    // Process executed actions (mark as completed)
    if (payload.executed_actions && payload.executed_actions.length > 0) {
      console.log(`[mikrotik-sync] Processing ${payload.executed_actions.length} executed actions`)
      
      const { error: actionsError } = await supabase
        .from('acoes_pendentes')
        .update({
          status: 'executado',
          executed_at: new Date().toISOString()
        })
        .in('id', payload.executed_actions)
        .eq('hotspot_id', hotspot.id)

      if (actionsError) {
        console.error('[mikrotik-sync] Failed to update executed actions:', actionsError)
      }
    }

    // Track device violations for kick actions
    const deviceViolations: DeviceViolation[] = []

    // Process active users - update sessions, consumption, and device tracking
    if (payload.active_users && payload.active_users.length > 0) {
      console.log(`[mikrotik-sync] Processing ${payload.active_users.length} active users`)

      // Group users by login to count devices
      const userDeviceCounts = new Map<string, string[]>()
      for (const activeUser of payload.active_users) {
        const macs = userDeviceCounts.get(activeUser.user) || []
        macs.push(activeUser.mac)
        userDeviceCounts.set(activeUser.user, macs)
      }

      for (const activeUser of payload.active_users) {
        // Find tripulante by login_wifi with perfil for device limits and quota
        const { data: tripulante } = await supabase
          .from('tripulantes')
          .select(`
            id, bytes_consumidos, perfil_id, nome,
            perfis_velocidade(id, nome, max_dispositivos, limite_dados_mb)
          `)
          .eq('login_wifi', activeUser.user)
          .eq('embarcacao_id', hotspot.embarcacao_id)
          .single()

        if (tripulante) {
          const perfil = tripulante.perfis_velocidade as { 
            id: string; 
            nome: string; 
            max_dispositivos: number;
            limite_dados_mb: number | null;
          } | null
          const maxDevices = perfil?.max_dispositivos || 1
          const userMacs = userDeviceCounts.get(activeUser.user) || []
          
          // Check device limit violation
          if (userMacs.length > maxDevices) {
            // Find if we already have a violation for this user
            let violation = deviceViolations.find(v => v.user === activeUser.user)
            if (!violation) {
              // Kick excess devices (keep the oldest ones based on order received)
              const macsToKick = userMacs.slice(maxDevices)
              violation = {
                user: activeUser.user,
                max_allowed: maxDevices,
                current_count: userMacs.length,
                macs_to_kick: macsToKick
              }
              deviceViolations.push(violation)
              console.log(`[mikrotik-sync] Device limit violation: ${activeUser.user} has ${userMacs.length} devices, max ${maxDevices}`)

              // Create device limit alert
              await createAlertIfNotRecent(supabase, {
                tipo: 'device_limit',
                severidade: 'warning',
                mensagem: `${tripulante.nome || activeUser.user} excedeu limite: ${userMacs.length}/${maxDevices} dispositivos`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              })
            }
          }

          // Check quota limits
          if (perfil?.limite_dados_mb) {
            const limitBytes = perfil.limite_dados_mb * 1024 * 1024
            const totalBytes = activeUser.bytes_in + activeUser.bytes_out
            const newTotal = tripulante.bytes_consumidos + totalBytes
            const percentage = (newTotal / limitBytes) * 100

            if (percentage >= 100) {
              // Quota exceeded
              await createAlertIfNotRecent(supabase, {
                tipo: 'quota_exceeded',
                severidade: 'critical',
                mensagem: `${tripulante.nome || activeUser.user} excedeu 100% da quota (${Math.round(percentage)}%)`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              }, 60) // Dedupe for 1 hour
            } else if (percentage >= 80) {
              // Quota warning at 80%
              await createAlertIfNotRecent(supabase, {
                tipo: 'quota_warning',
                severidade: 'warning',
                mensagem: `${tripulante.nome || activeUser.user} atingiu ${Math.round(percentage)}% da quota`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              }, 120) // Dedupe for 2 hours
            }
          }

          // Update tripulante consumption and last login
          const totalBytes = activeUser.bytes_in + activeUser.bytes_out
          await supabase
            .from('tripulantes')
            .update({
              bytes_consumidos: tripulante.bytes_consumidos + totalBytes,
              ultimo_login: new Date().toISOString()
            })
            .eq('id', tripulante.id)

          // Register/update device
          const { data: existingDevice } = await supabase
            .from('dispositivos_registrados')
            .select('id, bytes_consumidos')
            .eq('mac_address', activeUser.mac)
            .maybeSingle()

          if (existingDevice) {
            // Update existing device
            await supabase
              .from('dispositivos_registrados')
              .update({
                bytes_consumidos: existingDevice.bytes_consumidos + totalBytes,
                ultimo_uso: new Date().toISOString()
              })
              .eq('id', existingDevice.id)
          } else {
            // Auto-register new device
            await supabase
              .from('dispositivos_registrados')
              .insert({
                tripulante_id: tripulante.id,
                mac_address: activeUser.mac,
                nome: `Dispositivo de ${activeUser.user}`,
                tipo: 'outro',
                autorizado: true,
                bytes_consumidos: totalBytes,
                ultimo_uso: new Date().toISOString()
              })
              .then(res => {
                if (res.error) {
                  console.log(`[mikrotik-sync] Device ${activeUser.mac} might already exist`)
                }
              })
          }

          // Check for active session or create new one
          const { data: activeSession } = await supabase
            .from('sessoes_wifi')
            .select('id, bytes_in, bytes_out')
            .eq('tripulante_id', tripulante.id)
            .eq('hotspot_id', hotspot.id)
            .eq('mac_address', activeUser.mac)
            .eq('status', 'ativa')
            .maybeSingle()

          // Get device ID for session
          const { data: device } = await supabase
            .from('dispositivos_registrados')
            .select('id')
            .eq('mac_address', activeUser.mac)
            .maybeSingle()

          if (activeSession) {
            // Update existing session
            await supabase
              .from('sessoes_wifi')
              .update({
                bytes_in: activeUser.bytes_in,
                bytes_out: activeUser.bytes_out,
                ip_address: activeUser.ip || null,
                dispositivo_id: device?.id || null
              })
              .eq('id', activeSession.id)
          } else {
            // Create new session
            await supabase
              .from('sessoes_wifi')
              .insert({
                tripulante_id: tripulante.id,
                hotspot_id: hotspot.id,
                mac_address: activeUser.mac,
                ip_address: activeUser.ip || '0.0.0.0',
                bytes_in: activeUser.bytes_in,
                bytes_out: activeUser.bytes_out,
                status: 'ativa',
                dispositivo_id: device?.id || null
              })
          }
        }
      }

      // Close sessions for users no longer active
      const activeLogins = payload.active_users.map(u => u.user)
      
      const { data: tripulantesAtivos } = await supabase
        .from('tripulantes')
        .select('id')
        .eq('embarcacao_id', hotspot.embarcacao_id)
        .in('login_wifi', activeLogins)

      const tripulanteIds = tripulantesAtivos?.map(t => t.id) || []

      if (tripulanteIds.length > 0) {
        // Close sessions that are not in the active list
        await supabase
          .from('sessoes_wifi')
          .update({
            status: 'finalizada',
            fim: new Date().toISOString()
          })
          .eq('hotspot_id', hotspot.id)
          .eq('status', 'ativa')
          .not('tripulante_id', 'in', `(${tripulanteIds.join(',')})`)
      }
    }

    // Fetch pending actions for this hotspot
    const { data: pendingActions, error: pendingError } = await supabase
      .from('acoes_pendentes')
      .select('id, tipo, payload')
      .eq('hotspot_id', hotspot.id)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(50)

    if (pendingError) {
      console.error('[mikrotik-sync] Failed to fetch pending actions:', pendingError)
    }

    // Format pending actions for MikroTik
    const formattedActions: PendingAction[] = (pendingActions || []).map(action => ({
      id: action.id,
      type: action.tipo,
      payload: action.payload as Record<string, unknown>
    }))

    // Add kick actions for device violations
    for (const violation of deviceViolations) {
      for (const mac of violation.macs_to_kick) {
        formattedActions.push({
          id: `auto-kick-${violation.user}-${mac}`,
          type: 'kick_device',
          payload: {
            user: violation.user,
            mac: mac,
            reason: `Limite de ${violation.max_allowed} dispositivo(s) excedido`
          }
        })
      }
    }

    // Fetch active access rules for this hotspot (compiled firewall rules)
    let firewallRules: { action: string; domains: string[]; apps: string[] }[] = []
    
    if (embarcacao) {
      const { data: regras } = await supabase
        .from('regras_acesso')
        .select(`
          acao, prioridade,
          listas_acesso(dominios, aplicativos, tipo)
        `)
        .eq('empresa_id', embarcacao.empresa_id)
        .eq('ativo', true)
        .or(`hotspot_id.eq.${hotspot.id},hotspot_id.is.null`)
        .order('prioridade', { ascending: true })

      if (regras) {
        firewallRules = regras.map(regra => {
          const lista = regra.listas_acesso as { dominios: string[]; aplicativos: string[]; tipo: string } | null
          return {
            action: regra.acao,
            domains: (lista?.dominios || []) as string[],
            apps: (lista?.aplicativos || []) as string[]
          }
        })
      }
    }

    // Increment attempt count for returned actions
    if (formattedActions.length > 0) {
      const actionIds = formattedActions
        .filter(a => !a.id.startsWith('auto-'))
        .map(a => a.id)
      
      if (actionIds.length > 0) {
        await supabase
          .from('acoes_pendentes')
          .update({ tentativas: 1 })
          .in('id', actionIds)
          .then(() => console.log(`[mikrotik-sync] Incremented attempts for ${actionIds.length} actions`))
      }
    }

    console.log(`[mikrotik-sync] Returning ${formattedActions.length} pending actions, ${firewallRules.length} firewall rules`)

    return new Response(
      JSON.stringify({
        success: true,
        pending_actions: formattedActions,
        firewall_rules: firewallRules,
        device_violations: deviceViolations,
        server_time: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[mikrotik-sync] Unexpected error:', error)
    
    // Create sync failure alert if we can identify the hotspot
    // Note: Can't easily do this without the hotspot context from the failed request
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
