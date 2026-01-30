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
  registered_users_csv?: string  // v6.9.7: Lista completa de usuários cadastrados no MikroTik
  registered_profiles_csv?: string  // v6.9.9: Lista de perfis do MikroTik para reconciliação
  executed_actions?: string[]
  user_device_counts?: { user: string; count: number; macs: string[] }[]
}

interface PendingAction {
  id: string
  type: string
  payload: Record<string, unknown>
}

// v6.9.7: Metadata for synced users tracking
interface SyncedUserMeta {
  login: string
  last_seen: string | null      // Última vez visto em active_users
  last_synced_at: string | null // Última vez que enviamos create_user
  miss_count: number            // Syncs consecutivos sem aparecer em registered_users
}

// v6.9.7: Constants for reconciliation
const MISS_THRESHOLD = 2        // Syncs faltando antes de re-criar
const SYNC_COOLDOWN_MS = 5 * 60 * 1000  // 5 min cooldown entre re-syncs

interface DeviceViolation {
  user: string
  max_allowed: number
  current_count: number
  macs_to_kick: string[]
}

interface BlockedDevice {
  mac: string
  reason: string
}

// v6.9.10: Parse active_users_csv from MikroTik into ActiveUser array
function parseActiveUsersCsv(csv: string): ActiveUser[] {
  if (!csv || csv.trim().length === 0) {
    return []
  }
  
  const users: ActiveUser[] = []
  
  // Format: "user,mac,bytes_in,bytes_out;user2,mac2,bytes_in2,bytes_out2;"
  const entries = csv.split(';').filter(e => e.trim().length > 0)
  
  for (const entry of entries) {
    const parts = entry.split(',').map(p => p.trim())
    
    if (parts.length >= 4) {
      users.push({
        user: parts[0],
        mac: parts[1],
        uptime: '0', // MikroTik doesn't send uptime in current CSV format
        bytes_in: parseInt(parts[2], 10) || 0,
        bytes_out: parseInt(parts[3], 10) || 0,
        ip: parts[4] || undefined // Optional 5th field
      })
    }
  }
  
  return users
}

// Helper to get week number for semanal quota
function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  return Math.ceil((days + startOfYear.getDay() + 1) / 7)
}

// Convert UTC date to local timezone date
function toLocalDate(utcDate: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  const parts = formatter.formatToParts(utcDate)
  const values: Record<string, string> = {}
  parts.forEach(part => {
    values[part.type] = part.value
  })
  
  return new Date(
    parseInt(values.year),
    parseInt(values.month) - 1,
    parseInt(values.day),
    parseInt(values.hour),
    parseInt(values.minute),
    parseInt(values.second)
  )
}

// Check if quota should be reset based on period and timezone
function shouldResetQuota(
  quotaResetAt: string | null,
  quotaPeriodo: string,
  timezone: string
): boolean {
  if (!quotaResetAt) return true // First time
  
  const now = new Date()
  const lastReset = new Date(quotaResetAt)
  
  // Convert to local timezone
  const nowLocal = toLocalDate(now, timezone)
  const lastResetLocal = toLocalDate(lastReset, timezone)
  
  switch (quotaPeriodo) {
    case 'hora':
      // Reset if hour changed
      return nowLocal.getHours() !== lastResetLocal.getHours() ||
             nowLocal.getDate() !== lastResetLocal.getDate() ||
             nowLocal.getMonth() !== lastResetLocal.getMonth()
    
    case 'diario':
      // Reset if passed midnight
      return nowLocal.getDate() !== lastResetLocal.getDate() ||
             nowLocal.getMonth() !== lastResetLocal.getMonth() ||
             nowLocal.getFullYear() !== lastResetLocal.getFullYear()
    
    case 'semanal':
      // Reset if week number changed (week starts Monday)
      return getWeekNumber(nowLocal) !== getWeekNumber(lastResetLocal) ||
             nowLocal.getFullYear() !== lastResetLocal.getFullYear()
    
    case 'mensal':
      // Reset if month changed
      return nowLocal.getMonth() !== lastResetLocal.getMonth() ||
             nowLocal.getFullYear() !== lastResetLocal.getFullYear()
    
    default:
      return false // Unknown period, don't reset
  }
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

// v6.9.8: Reconcile users - detect missing and auto-sync
// CRITICAL FIX: Early return if MikroTik not sending registered_users_csv
async function reconcileUsers(
  supabase: ReturnType<typeof createClient>,
  hotspot: { id: string; embarcacao_id: string; synced_users: SyncedUserMeta[] },
  activeUsers: ActiveUser[],
  registeredUsersCsv: string,
  formattedActions: PendingAction[]
): Promise<void> {
  // v6.9.8: Validate if we have reliable data from MikroTik
  if (!registeredUsersCsv || registeredUsersCsv.trim().length === 0) {
    console.warn(`[mikrotik-sync] v6.9.8: WARNING - MikroTik not sending registered_users_csv. Script update required.`)
    console.warn(`[mikrotik-sync] v6.9.8: Skipping user reconciliation to prevent false positives/loops`)
    return
  }
  
  // Parse registered users from MikroTik (lista COMPLETA de cadastrados)
  const registeredUsersSet = new Set(
    registeredUsersCsv
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0)
  )
  
  console.log(`[mikrotik-sync] v6.9.8: Registered users from MikroTik: ${registeredUsersSet.size} (${Array.from(registeredUsersSet).slice(0, 5).join(', ')}${registeredUsersSet.size > 5 ? '...' : ''})`)
  
  // Build set of currently active (online) users
  const activeUsersSet = new Set(activeUsers.map(u => u.user))
  
  // Load synced users metadata from DB
  const syncedUsersMap = new Map<string, SyncedUserMeta>(
    (hotspot.synced_users || []).map(u => [u.login, { ...u }])
  )
  
  // Fetch all active tripulantes for this embarcacao
  const { data: tripulantes } = await supabase
    .from('tripulantes')
    .select(`
      login_wifi, senha_wifi, perfil_id, status,
      perfis_velocidade(nome)
    `)
    .eq('embarcacao_id', hotspot.embarcacao_id)
    .in('status', ['ativo', 'pendente_cadastro'])
  
  if (!tripulantes || tripulantes.length === 0) {
    console.log('[mikrotik-sync] v6.9.8: No active tripulantes to reconcile')
    return
  }
  
  const newActionsToInject: PendingAction[] = []
  const now = new Date().toISOString()
  const nowMs = Date.now()
  
  console.log(`[mikrotik-sync] v6.9.8: Reconciling ${tripulantes.length} tripulantes`)
  
  for (const tripulante of tripulantes) {
    const login = tripulante.login_wifi
    
    // Initialize metadata if new user
    if (!syncedUsersMap.has(login)) {
      syncedUsersMap.set(login, {
        login,
        last_seen: null,
        last_synced_at: null,
        miss_count: 0
      })
    }
    
    const meta = syncedUsersMap.get(login)!
    
    // Check if user exists in MikroTik registered users
    if (registeredUsersSet.has(login)) {
      // User EXISTS in MikroTik - reset counters, everything is OK
      meta.miss_count = 0
      
      // Update last_seen if also active (online)
      if (activeUsersSet.has(login)) {
        meta.last_seen = now
      }
      
      console.log(`[mikrotik-sync] v6.9.8: User confirmed in MikroTik: ${login}`)
      continue
    }
    
    // User NOT in registered_users - confirmed missing from MikroTik
    // v6.9.8 FIX: Only increment if we have valid data (already validated above)
    meta.miss_count = (meta.miss_count || 0) + 1
    console.log(`[mikrotik-sync] v6.9.8: User confirmed missing, miss_count=${meta.miss_count}: ${login}`)
    
    // Decide if we should re-sync
    const neverSynced = !meta.last_synced_at
    const exceededThreshold = meta.miss_count >= MISS_THRESHOLD
    
    // Cooldown check: don't re-sync too frequently
    const lastSyncTime = meta.last_synced_at ? new Date(meta.last_synced_at).getTime() : 0
    const cooldownElapsed = (nowMs - lastSyncTime) > SYNC_COOLDOWN_MS
    
    // v6.9.8: Log decision factors for debugging
    console.log(`[mikrotik-sync] v6.9.8: Decision for ${login}: neverSynced=${neverSynced}, exceeded=${exceededThreshold}, cooldown=${cooldownElapsed}`)
    
    if ((neverSynced || exceededThreshold) && cooldownElapsed) {
      // Generate create_user action
      const perfilNome = (tripulante.perfis_velocidade as { nome?: string } | null)?.nome || ''
      const profileSlug = perfilNome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'default'
      
      const actionId = `auto-user-${login}`
      
      newActionsToInject.push({
        id: actionId,
        type: 'create_user',
        payload: {
          user: login,
          password: tripulante.senha_wifi,
          profile: profileSlug
        }
      })
      
      // Update metadata to record sync and reset counter
      meta.last_synced_at = now
      meta.miss_count = 0
      
      console.log(`[mikrotik-sync] v6.9.8: Re-syncing user (neverSynced=${neverSynced}, exceeded=${exceededThreshold}): ${login}`)
    }
  }
  
  // Append new actions AFTER profiles (profiles come first in the array)
  if (newActionsToInject.length > 0) {
    formattedActions.push(...newActionsToInject)
    console.log(`[mikrotik-sync] v6.9.8: Injecting ${newActionsToInject.length} user actions`)
  }
  
  // Persist updated metadata
  const updatedSyncedUsers = Array.from(syncedUsersMap.values())
  await supabase
    .from('hotspots')
    .update({ synced_users: updatedSyncedUsers })
    .eq('id', hotspot.id)
  
  console.log(`[mikrotik-sync] v6.9.8: Saved synced_users metadata for ${updatedSyncedUsers.length} users`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const payload: SyncPayload = await req.json()
    console.log('[mikrotik-sync] Received sync request:', JSON.stringify(payload))

    // v6.9.10: Parse active_users_csv if provided as CSV string instead of array
    if (!payload.active_users && (payload as any).active_users_csv) {
      const csvData = (payload as any).active_users_csv as string
      payload.active_users = parseActiveUsersCsv(csvData)
      console.log(`[mikrotik-sync] v6.9.10: Parsed ${payload.active_users.length} active users from CSV`)
    }

    if (!payload.sync_token) {
      console.error('[mikrotik-sync] Missing sync_token')
      return new Response(
        JSON.stringify({ success: false, error: 'sync_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // v6.9.7: Include synced_profiles and synced_users for tracking
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, embarcacao_id, nome, status, synced_profiles, synced_users')
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

    const { data: embarcacao } = await supabase
      .from('embarcacoes')
      .select('id, empresa_id, timezone')
      .eq('id', hotspot.embarcacao_id)
      .single()

    // Use timezone from embarcacao only (no empresa fallback)
    const effectiveTimezone = embarcacao?.timezone || 'America/Sao_Paulo'
    console.log(`[mikrotik-sync] Using timezone: ${effectiveTimezone}`)

    if (hotspot.status === 'offline') {
      console.log('[mikrotik-sync] Hotspot was offline, resolving offline alerts')
      await supabase
        .from('alertas')
        .update({ resolvido: true, resolvido_at: new Date().toISOString() })
        .eq('hotspot_id', hotspot.id)
        .eq('tipo', 'hotspot_offline')
        .eq('resolvido', false)
    }

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

    const deviceViolations: DeviceViolation[] = []
    const blockedDevices: BlockedDevice[] = []

    // Fetch all blocked devices for this embarcacao to include in response
    const { data: allBlockedDevices } = await supabase
      .from('dispositivos_registrados')
      .select('mac_address, bloqueio_motivo')
      .eq('autorizado', false)

    if (allBlockedDevices) {
      for (const bd of allBlockedDevices) {
        blockedDevices.push({
          mac: bd.mac_address,
          reason: bd.bloqueio_motivo || 'Dispositivo bloqueado'
        })
      }
    }

    if (payload.active_users && payload.active_users.length > 0) {
      console.log(`[mikrotik-sync] Processing ${payload.active_users.length} active users`)

      const userDeviceCounts = new Map<string, string[]>()
      for (const activeUser of payload.active_users) {
        const macs = userDeviceCounts.get(activeUser.user) || []
        macs.push(activeUser.mac)
        userDeviceCounts.set(activeUser.user, macs)
      }

      for (const activeUser of payload.active_users) {
        // v6.9.10: Include status to enable auto-activation
        const { data: tripulante } = await supabase
          .from('tripulantes')
          .select(`
            id, bytes_consumidos, perfil_id, nome, login_wifi, quota_reset_at, status,
            perfis_velocidade(id, nome, max_dispositivos, limite_dados_mb, quota_periodo)
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
            quota_periodo: string;
          } | null
          const maxDevices = perfil?.max_dispositivos || 1
          const userMacs = userDeviceCounts.get(activeUser.user) || []

          // Check if quota should be reset based on period and timezone
          if (perfil?.limite_dados_mb && perfil.quota_periodo) {
            const quotaResetAt = (tripulante as any).quota_reset_at as string | null
            if (shouldResetQuota(quotaResetAt, perfil.quota_periodo, effectiveTimezone)) {
              console.log(`[mikrotik-sync] Resetting quota for ${tripulante.nome} (period: ${perfil.quota_periodo}, tz: ${effectiveTimezone})`)
              
              await supabase
                .from('tripulantes')
                .update({
                  bytes_consumidos: 0,
                  quota_reset_at: new Date().toISOString()
                })
                .eq('id', tripulante.id)

              // Update local reference so the percentage calculation is correct
              tripulante.bytes_consumidos = 0
            }
          }
          
          if (userMacs.length > maxDevices) {
            let violation = deviceViolations.find(v => v.user === activeUser.user)
            if (!violation) {
              const macsToKick = userMacs.slice(maxDevices)
              violation = {
                user: activeUser.user,
                max_allowed: maxDevices,
                current_count: userMacs.length,
                macs_to_kick: macsToKick
              }
              deviceViolations.push(violation)
              console.log(`[mikrotik-sync] Device limit violation: ${activeUser.user} has ${userMacs.length} devices, max ${maxDevices}`)

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

          // v6.9.11: Fetch active session BEFORE updating consumption to calculate delta
          const { data: preUpdateSession } = await supabase
            .from('sessoes_wifi')
            .select('id, bytes_in, bytes_out')
            .eq('tripulante_id', tripulante.id)
            .eq('hotspot_id', hotspot.id)
            .eq('mac_address', activeUser.mac)
            .eq('status', 'ativa')
            .maybeSingle()

          // v6.9.11: Calculate DELTA (difference) since last sync
          const previousBytesIn = preUpdateSession?.bytes_in || 0
          const previousBytesOut = preUpdateSession?.bytes_out || 0
          
          // Detect session reset (reconnection): if current < previous, it's a new session
          const deltaIn = activeUser.bytes_in < previousBytesIn 
            ? activeUser.bytes_in  // New session, count all
            : activeUser.bytes_in - previousBytesIn
          
          const deltaOut = activeUser.bytes_out < previousBytesOut
            ? activeUser.bytes_out
            : activeUser.bytes_out - previousBytesOut
          
          const deltaBytes = deltaIn + deltaOut
          
          console.log(`[mikrotik-sync] v6.9.11: Delta for ${activeUser.user}: ${deltaBytes} bytes (in: ${deltaIn}, out: ${deltaOut}, prevIn: ${previousBytesIn}, prevOut: ${previousBytesOut})`)

          // v6.9.11: Variable to track if we need to kick user for quota
          let shouldKickForQuota = false

          if (perfil?.limite_dados_mb) {
            const limitBytes = perfil.limite_dados_mb * 1024 * 1024
            // v6.9.11: Use delta for new total calculation
            const newTotal = tripulante.bytes_consumidos + deltaBytes
            const percentage = (newTotal / limitBytes) * 100

            if (percentage >= 100) {
              await createAlertIfNotRecent(supabase, {
                tipo: 'quota_exceeded',
                severidade: 'critical',
                mensagem: `${tripulante.nome || activeUser.user} excedeu 100% da quota (${Math.round(percentage)}%)`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              }, 60)
              
              // v6.9.11: Mark for kick when quota >= 100%
              shouldKickForQuota = true
              console.log(`[mikrotik-sync] v6.9.11: User ${activeUser.user} exceeded quota (${Math.round(percentage)}%), will be kicked`)
            } else if (percentage >= 80) {
              await createAlertIfNotRecent(supabase, {
                tipo: 'quota_warning',
                severidade: 'warning',
                mensagem: `${tripulante.nome || activeUser.user} atingiu ${Math.round(percentage)}% da quota`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              }, 120)
            }
          }

          // v6.9.11: Update consumption with DELTA (not absolute value)
          await supabase
            .from('tripulantes')
            .update({
              bytes_consumidos: tripulante.bytes_consumidos + deltaBytes,
              ultimo_login: new Date().toISOString()
            })
            .eq('id', tripulante.id)

          // v6.9.10: Auto-activate user on first successful login
          if ((tripulante as any).status === 'pendente_cadastro') {
            await supabase
              .from('tripulantes')
              .update({ status: 'ativo' })
              .eq('id', tripulante.id)
            
            console.log(`[mikrotik-sync] v6.9.10: Auto-activated user ${tripulante.nome} on first login`)
          }

          // Check for device sharing - MAC already registered to ANOTHER tripulante
          const { data: existingDevice } = await supabase
            .from('dispositivos_registrados')
            .select('id, tripulante_id, autorizado, bloqueio_motivo, nome')
            .eq('mac_address', activeUser.mac)
            .maybeSingle()

          if (existingDevice) {
            // Device exists - check if belongs to same tripulante
            if (existingDevice.tripulante_id && existingDevice.tripulante_id !== tripulante.id) {
              // ALERT: MAC registered to another tripulante - potential credential sharing!
              const { data: originalOwner } = await supabase
                .from('tripulantes')
                .select('nome, login_wifi')
                .eq('id', existingDevice.tripulante_id)
                .single()

              console.log(`[mikrotik-sync] DEVICE SHARING DETECTED: MAC ${activeUser.mac} registered to ${originalOwner?.nome} being used by ${tripulante.nome}`)

              await createAlertIfNotRecent(supabase, {
                tipo: 'device_sharing',
                severidade: 'critical',
                mensagem: `Dispositivo ${activeUser.mac} (${existingDevice.nome || 'Sem nome'}) registrado para ${originalOwner?.nome || originalOwner?.login_wifi} está sendo usado por ${tripulante.nome || activeUser.user}. Possível compartilhamento de credenciais!`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: existingDevice.tripulante_id // Alert references original owner
              }, 60)
            }

            // Check if device is blocked
            if (!existingDevice.autorizado) {
              console.log(`[mikrotik-sync] Blocked device attempted connection: ${activeUser.mac}`)
              
              // Add to kick actions (will be handled below)
              blockedDevices.push({
                mac: activeUser.mac,
                reason: existingDevice.bloqueio_motivo || 'Dispositivo bloqueado pelo administrador'
              })

              await createAlertIfNotRecent(supabase, {
                tipo: 'blocked_device_attempt',
                severidade: 'warning',
                mensagem: `Tentativa de conexão com dispositivo bloqueado: ${activeUser.mac} (${existingDevice.nome || 'Sem nome'})`,
                hotspot_id: hotspot.id,
                embarcacao_id: hotspot.embarcacao_id,
                empresa_id: embarcacao?.empresa_id,
                tripulante_id: tripulante.id
              }, 15)
            } else {
              // v6.9.11: Update existing device consumption with DELTA (fixed operator precedence)
              await supabase
                .from('dispositivos_registrados')
                .update({
                  bytes_consumidos: ((existingDevice as { bytes_consumidos?: number }).bytes_consumidos || 0) + deltaBytes,
                  ultimo_uso: new Date().toISOString()
                })
                .eq('id', existingDevice.id)
            }
          } else {
            // Auto-register new device for this tripulante
            // v6.9.11: Use deltaBytes for new device
            await supabase
              .from('dispositivos_registrados')
              .insert({
                tripulante_id: tripulante.id,
                mac_address: activeUser.mac,
                nome: `Dispositivo de ${tripulante.nome || activeUser.user}`,
                tipo: 'outro',
                autorizado: true,
                bytes_consumidos: deltaBytes,
                ultimo_uso: new Date().toISOString()
              })
              .then(res => {
                if (res.error) {
                  console.log(`[mikrotik-sync] Device ${activeUser.mac} might already exist`)
                } else {
                  console.log(`[mikrotik-sync] Auto-registered device ${activeUser.mac} for ${tripulante.nome}`)
                }
              })
          }

          // v6.9.11: Add kick action if quota exceeded
          if (shouldKickForQuota) {
            // This will be pushed to formattedActions later
            blockedDevices.push({
              mac: activeUser.mac,
              reason: 'Quota de dados excedida'
            })
          }

          // Session management
          const { data: activeSession } = await supabase
            .from('sessoes_wifi')
            .select('id, bytes_in, bytes_out')
            .eq('tripulante_id', tripulante.id)
            .eq('hotspot_id', hotspot.id)
            .eq('mac_address', activeUser.mac)
            .eq('status', 'ativa')
            .maybeSingle()

          const { data: device } = await supabase
            .from('dispositivos_registrados')
            .select('id')
            .eq('mac_address', activeUser.mac)
            .maybeSingle()

          if (activeSession) {
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

    // Add kick actions for blocked devices currently connected
    if (payload.active_users) {
      for (const activeUser of payload.active_users) {
        const blocked = blockedDevices.find(bd => bd.mac === activeUser.mac)
        if (blocked) {
          formattedActions.push({
            id: `auto-kick-blocked-${activeUser.mac}`,
            type: 'kick_device',
            payload: {
              user: activeUser.user,
              mac: activeUser.mac,
              reason: blocked.reason
            }
          })
        }
      }
    }

    // Fetch active access rules for this hotspot
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
            // Use lista.tipo instead of regra.acao - blacklist means block, whitelist means allow
            action: lista?.tipo === 'blacklist' ? 'block' : 'allow',
            domains: (lista?.dominios || []) as string[],
            apps: (lista?.aplicativos || []) as string[]
          }
        })
      }
    }

    // v6.9.9: Ensure all company profiles are synced with MikroTik data validation
    if (embarcacao) {
      const { data: perfis } = await supabase
        .from('perfis_velocidade')
        .select('nome, velocidade_download, velocidade_upload, max_dispositivos, limite_dados_mb')
        .eq('empresa_id', embarcacao.empresa_id)

      if (perfis && perfis.length > 0) {
        // v6.9.5: Normalizar rate-limit - remover "B" e forçar maiúsculas
        // RouterOS aceita: k (kbit), M (megabit), G (gigabit) - SEM o "B"
        const normalizeRateLimit = (value: string | null | undefined): string => {
          return String(value || '2M')
            .toUpperCase()
            .replace(/MB/g, 'M')  // 3MB -> 3M
            .replace(/KB/g, 'K')  // 512KB -> 512K
            .replace(/GB/g, 'G')  // 1GB -> 1G
            .trim()
        }

        // v6.9.9: Parse registered profiles from MikroTik (source of truth)
        const registeredProfilesCsv = payload.registered_profiles_csv || ''
        const registeredProfilesSet = new Set(
          registeredProfilesCsv
            .split(',')
            .map(p => p.trim().toLowerCase())
            .filter(p => p.length > 0)
        )
        
        console.log(`[mikrotik-sync] v6.9.9: Registered profiles from MikroTik: ${registeredProfilesSet.size} (${Array.from(registeredProfilesSet).slice(0, 5).join(', ')}${registeredProfilesSet.size > 5 ? '...' : ''})`)
        
        // v6.9.9: Get cached synced profiles (fallback for older scripts)
        const syncedProfiles = ((hotspot as Record<string, unknown>).synced_profiles || []) as string[]
        const newProfilesToSync: string[] = []

        const profileActions = perfis
          .map(p => {
            const slug = p.nome.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
            
            // v6.9.9: Primary check - does profile exist in MikroTik?
            // Only trust registeredProfilesSet if MikroTik sent data
            if (registeredProfilesCsv.length > 0) {
              if (registeredProfilesSet.has(slug)) {
                console.log(`[mikrotik-sync] v6.9.9: Profile confirmed in MikroTik: ${slug}`)
                return null
              }
              // Profile NOT in MikroTik - needs sync
              console.log(`[mikrotik-sync] v6.9.9: Profile missing from MikroTik, will sync: ${slug}`)
            } else {
              // v6.9.9: Fallback - MikroTik didn't send profiles (old script)
              // Use cached synced_profiles but log warning
              if (syncedProfiles.includes(slug)) {
                console.log(`[mikrotik-sync] v6.9.9: Profile in cache (no MikroTik data), skipping: ${slug}`)
                return null
              }
              console.warn(`[mikrotik-sync] v6.9.9: No MikroTik profile data, will sync: ${slug}`)
            }
            
            newProfilesToSync.push(slug)
            
            // v6.9.5: Normalizar rate-limit para compatibilidade RouterOS
            const uploadRate = normalizeRateLimit(p.velocidade_upload)
            const downloadRate = normalizeRateLimit(p.velocidade_download)
            const rateLimit = `${uploadRate}/${downloadRate}`
            const quota = p.limite_dados_mb || 0
            const shared = p.max_dispositivos || 1
            
            return {
              id: `auto-profile-${slug}`,
              type: 'add_user_profile' as const,
              payload: {
                name: slug,
                rate_limit: rateLimit,
                shared_users: shared,
                limit_bytes: quota * 1024 * 1024
              }
            }
          })
          .filter(Boolean) as PendingAction[]

        // Prepend to ensure profiles exist before users
        if (profileActions.length > 0) {
          formattedActions.unshift(...profileActions)
          console.log(`[mikrotik-sync] v6.9.9: Injecting ${profileActions.length} profile actions for sync`)
          
          // v6.9.9: Update synced profiles list (will be validated next sync)
          const updatedSyncedProfiles = [...new Set([...syncedProfiles, ...newProfilesToSync])]
          await supabase
            .from('hotspots')
            .update({ synced_profiles: updatedSyncedProfiles })
            .eq('id', hotspot.id)
            .then(() => console.log(`[mikrotik-sync] v6.9.9: Updated synced_profiles cache: ${newProfilesToSync.join(', ')}`))
        } else {
          console.log(`[mikrotik-sync] v6.9.9: All profiles confirmed synced`)
        }
      }
    }

    // v6.9.7: Reconcile users - detect missing and re-sync
    if (embarcacao) {
      await reconcileUsers(
        supabase,
        {
          id: hotspot.id,
          embarcacao_id: hotspot.embarcacao_id,
          synced_users: ((hotspot as Record<string, unknown>).synced_users || []) as SyncedUserMeta[]
        },
        payload.active_users || [],
        payload.registered_users_csv || '',
        formattedActions
      )
    }

    // v6.9: Expand domain-based actions to individual commands
    const expandedActions: typeof formattedActions = []

    for (const action of formattedActions) {
      const p = action.payload as Record<string, unknown>
      
      // Expand walled garden with multiple domains
      if (action.type === 'add_walled_garden' && Array.isArray(p.dominios)) {
        for (const domain of p.dominios as string[]) {
          if (domain) {
            expandedActions.push({
              id: `${action.id}-${domain.replace(/[^a-z0-9]/gi, '')}`,
              type: (p.tipo === 'blacklist' ? 'add_blacklist_domain' : 'add_whitelist_domain') as string,
              payload: { list_name: String(p.lista_name || 'default'), domain }
            })
          }
        }
      } 
      // Expand firewall filter rules
      else if (action.type === 'add_firewall_filter' && Array.isArray(p.dominios)) {
        for (const domain of p.dominios as string[]) {
          if (domain) {
            expandedActions.push({
              id: `${action.id}-${domain.replace(/[^a-z0-9]/gi, '')}`,
              type: 'add_blacklist_domain' as string,
              payload: { list_name: String(p.lista_name || 'regra'), domain }
            })
          }
        }
      } 
      else {
        expandedActions.push(action)
      }
    }

    // v6.9: Auto-mark as executed after 1 delivery (fire-and-forget pattern)
    if (expandedActions.length > 0) {
      const actionIds = expandedActions
        .filter(a => !a.id.startsWith('auto-'))
        .map(a => a.id)
      
      if (actionIds.length > 0) {
        await supabase
          .from('acoes_pendentes')
          .update({ 
            status: 'executado', 
            executed_at: new Date().toISOString() 
          })
          .in('id', actionIds)
          .then(() => console.log(`[mikrotik-sync] v6.9: Marked ${actionIds.length} actions as executed`))
      }
    }

    // v6.9: Generate pipe-delimited format for RouterOS parsing
    // Format: cmd|param1|param2;cmd2|param1|param2;
    // Wrapped in [[ ]] markers for extraction by navspot-sync script
    const pipeDelimitedActions = expandedActions.map(action => {
      const p = action.payload
      
      switch (action.type) {
        case 'kick_session':
        case 'kick_device':
          return `kick_session|${p.user || ''}|${p.mac || ''}`
        case 'disable_user':
          return `disable_user|${p.user || ''}`
        case 'enable_user':
          return `enable_user|${p.user || ''}`
        case 'remove_user':
          return `remove_user|${p.user || ''}`
        case 'update_password':
          return `update_password|${p.user || ''}|${p.password || ''}`
        case 'add_user':
        case 'create_user':
          return `create_user|${p.user || ''}|${p.password || ''}|${p.profile || 'default-navspot'}`
        case 'update_profile':
        case 'update_user_profile':
          // Update profile is handled via create_user with updated profile
          return `create_user|${p.user || ''}||${p.profile || ''}`
        case 'add_user_profile':
          // v6.9.5: Create profile with normalized rate-limit (remove B suffix)
          const normalizeRate = (v: string): string => String(v || '2M/5M')
            .toUpperCase()
            .replace(/MB/g, 'M').replace(/KB/g, 'K').replace(/GB/g, 'G').trim()
          const rateLimit = normalizeRate(String(p.rate_limit || '2M/5M'))
          return `create_profile|${p.name || ''}|${rateLimit}|${p.shared_users || 1}|${p.limit_bytes || 0}`
        case 'remove_user_profile':
          return `remove_profile|${p.name || ''}`
        case 'add_walled_garden':
        case 'add_whitelist_domain':
          // v6.9: One domain per command for robustness
          return `create_whitelist_domain|${p.list_name || 'default'}|${p.domain || p.dst_host || ''}`
        case 'remove_walled_garden':
          return `remove_whitelist_domain|${p.dst_host || ''}`
        case 'add_firewall_filter':
        case 'add_blacklist_domain':
          // v6.9: Blacklist as separate domain command
          return `create_blacklist_domain|${p.list_name || 'default'}|${p.domain || ''}`
        case 'add_firewall_l7':
          return `create_firewall_rule|${p.order || 0}|${p.list || ''}|${p.type || ''}|${p.profile || ''}|${p.schedule || ''}|${p.action || ''}`
        case 'update_profile_quota':
          return `update_profile_quota|${p.profile || ''}|${p.quota_mb || 0}`
        default:
          // Fallback: type|param1|param2|...
          return [action.type, ...Object.values(p).map(String)].join('|')
      }
    }).join(';')

    // v6.9.5: Wrap em [[ ]] SEM espaços extras para extração limpa
    const formattedPipe = pipeDelimitedActions ? `[[${pipeDelimitedActions};]]` : ''

    console.log(`[mikrotik-sync] v6.9: Returning ${expandedActions.length} pending actions, ${firewallRules.length} firewall rules, ${blockedDevices.length} blocked devices`)

    return new Response(
      JSON.stringify({
        success: true,
        pending_actions: expandedActions,
        pending_actions_pipe: formattedPipe,  // v6.5: [[ cmd|p1;cmd2|p1; ]]
        firewall_rules: firewallRules,
        device_violations: deviceViolations,
        blocked_devices: blockedDevices,
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
