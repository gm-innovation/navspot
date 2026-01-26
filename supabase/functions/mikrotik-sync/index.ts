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
}

interface PendingAction {
  id: string
  type: string
  payload: Record<string, unknown>
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

    // Process active users - update sessions and consumption
    if (payload.active_users && payload.active_users.length > 0) {
      console.log(`[mikrotik-sync] Processing ${payload.active_users.length} active users`)

      for (const activeUser of payload.active_users) {
        // Find tripulante by login_wifi
        const { data: tripulante } = await supabase
          .from('tripulantes')
          .select('id, bytes_consumidos')
          .eq('login_wifi', activeUser.user)
          .eq('embarcacao_id', hotspot.embarcacao_id)
          .single()

        if (tripulante) {
          // Update tripulante consumption and last login
          const totalBytes = activeUser.bytes_in + activeUser.bytes_out
          await supabase
            .from('tripulantes')
            .update({
              bytes_consumidos: tripulante.bytes_consumidos + totalBytes,
              ultimo_login: new Date().toISOString()
            })
            .eq('id', tripulante.id)

          // Check for active session or create new one
          const { data: activeSession } = await supabase
            .from('sessoes_wifi')
            .select('id, bytes_in, bytes_out')
            .eq('tripulante_id', tripulante.id)
            .eq('hotspot_id', hotspot.id)
            .eq('status', 'ativa')
            .single()

          if (activeSession) {
            // Update existing session
            await supabase
              .from('sessoes_wifi')
              .update({
                bytes_in: activeUser.bytes_in,
                bytes_out: activeUser.bytes_out,
                mac_address: activeUser.mac,
                ip_address: activeUser.ip || null
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
                status: 'ativa'
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

    // Increment attempt count for returned actions
    if (formattedActions.length > 0) {
      const actionIds = formattedActions.map(a => a.id)
      await supabase.rpc('increment_action_attempts', { action_ids: actionIds })
        .then(() => console.log(`[mikrotik-sync] Incremented attempts for ${actionIds.length} actions`))
        .catch(() => {
          // RPC might not exist yet, update manually
          supabase
            .from('acoes_pendentes')
            .update({ tentativas: 1 }) // Simple increment, could be improved with raw SQL
            .in('id', actionIds)
        })
    }

    console.log(`[mikrotik-sync] Returning ${formattedActions.length} pending actions`)

    return new Response(
      JSON.stringify({
        success: true,
        pending_actions: formattedActions,
        server_time: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[mikrotik-sync] Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
