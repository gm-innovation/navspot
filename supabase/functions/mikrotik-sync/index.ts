import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// v7.1.51: Reverted cleanup to stable format (unquoted values)
const VERSION = "7.1.65"

// v7.1.50: Required portal profile version - only marked after telemetry confirms
const REQUIRED_PORTAL_VERSION = "7.1.50-http-pap"

// v7.1.23: Sanitize pipe string for safe /file set contents in RouterOS
// Removes characters that cause truncation or parsing errors
// CRITICAL: Do NOT replace backslash - it breaks \$(mac) placeholders
// Enhanced: Trim leading/trailing semicolons, strip CR
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // Remove control characters
    .replace(/\r/g, '')             // Strip CR
    .replace(/;{2,}/g, ';')         // Collapse multiple semicolons
    .replace(/(^;|;$)/g, '')        // Trim leading/trailing semicolons
    .replace(/\|\|+/g, '|')         // Collapse multiple pipes
    .replace(/"/g, "'")             // Double quotes -> single (safer in MikroTik)
    // PRESERVED: backslash - needed for \$(mac) placeholders
}

// v7.0: Sanitize pipe delimiter in URLs
function sanitizeForPipe(value: string): string {
  return value.replace(/\|/g, '%7C')
}

// v7.1.59b: Tokenize RouterOS runtime placeholders to avoid JSON.stringify double-escaping
// $(mac) -> __NAVSPOT_DOLLAR__mac) - neutral token that JSON.stringify won't touch
// Post-stringify, we replace __NAVSPOT_DOLLAR__ with \$( in the raw text
const PLACEHOLDER_TOKEN = '__NAVSPOT_DOLLAR__'
function tokenizePlaceholders(value: string): string {
  return value.replace(/\$\(([^)]+)\)/g, `${PLACEHOLDER_TOKEN}$1)`)
}

// v6.9.15: Simple hash function for firewall rules change detection
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// v7.1.60: Check if telemetry data from the router is reliable enough to make repair decisions
function telemetryIsReliable(loginBy: string | null, loginUrl: string | null): boolean {
  if (!loginBy || loginBy.trim() === '') return false
  if (!loginUrl || loginUrl.trim() === '') return false
  const lb = loginBy.trim().toLowerCase()
  if (lb === 'cookie') return false
  if (lb.includes('http-pap') || lb.includes('http-chap') || lb.includes(',')) return true
  return false
}

// v6.9.15: Normalize domain for firewall rules (remove wildcards, clean up)
function normalizeDomain(domain: string): string {
  if (!domain) return ''
  return domain
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')  // Remove leading *.
    .replace(/\*/g, '')    // Remove any remaining *
    .replace(/^\./, '')    // Remove leading dot
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
const SYNC_COOLDOWN_MS = 2 * 60 * 1000  // v7.0.1: Reduced from 5min to 2min cooldown

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

// v6.9.21: Reset expired quotas for ALL tripulantes, not just active ones
// v7.1.64: Returns both resetCount and IDs of unblocked tripulantes for unblock_quota injection
async function resetExpiredQuotas(
  supabase: ReturnType<typeof createClient>,
  embarcacaoId: string,
  timezone: string
): Promise<{ resetCount: number; unblockedTripulanteIds: string[] }> {
  const now = new Date().toISOString()
  
  // Fetch tripulantes with consumption that might need reset
  const { data: tripulantes, error } = await supabase
    .from('tripulantes')
    .select(`
      id, bytes_consumidos, quota_reset_at, status, bloqueio_motivo,
      perfis_velocidade(limite_dados_mb, quota_periodo)
    `)
    .eq('embarcacao_id', embarcacaoId)
    .gt('bytes_consumidos', 0) // Only check those with consumption
  
  if (error || !tripulantes || tripulantes.length === 0) {
    return { resetCount: 0, unblockedTripulanteIds: [] }
  }
  
  let resetCount = 0
  const unblockedTripulanteIds: string[] = []
  
  for (const t of tripulantes) {
    const perfil = t.perfis_velocidade as { limite_dados_mb: number | null; quota_periodo: string } | null
    if (!perfil?.limite_dados_mb || !perfil.quota_periodo) continue
    
    if (shouldResetQuota(t.quota_reset_at, perfil.quota_periodo, timezone)) {
      // If blocked due to quota, reactivate
      if (t.status === 'bloqueado' && t.bloqueio_motivo === 'quota_exceeded') {
        await supabase
          .from('tripulantes')
          .update({
            bytes_consumidos: 0,
            quota_reset_at: now,
            status: 'ativo',
            bloqueio_motivo: null,
            bloqueado_at: null
          })
          .eq('id', t.id)
        
        unblockedTripulanteIds.push(t.id)
        console.log(`[mikrotik-sync] v7.1.64: Reset quota AND reactivated blocked user: ${t.id}`)
      } else {
        // Just reset consumption
        await supabase
          .from('tripulantes')
          .update({
            bytes_consumidos: 0,
            quota_reset_at: now
          })
          .eq('id', t.id)
        
        console.log(`[mikrotik-sync] v6.9.21: Reset quota for user: ${t.id}`)
      }
      
      resetCount++
    }
  }
  
  return { resetCount, unblockedTripulanteIds }
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
  // v7.1.29: Diferenciar "campo ausente" (script antigo) vs "lista vazia" (roteador limpo)
  if (registeredUsersCsv === undefined || registeredUsersCsv === null) {
    // Script antigo que não envia o campo - pular reconciliação
    console.warn(`[mikrotik-sync] v7.1.29: WARNING - MikroTik not sending registeredUsersCsv field (script update required)`)
    return
  }
  // v7.1.63: If registered_users_csv is empty BUT active_users exist,
  // the script doesn't send registered users properly — skip reconciliation to avoid reset loop
  if (registeredUsersCsv.trim().length === 0 && activeUsers.length > 0) {
    console.log(`[mikrotik-sync] v7.1.63: registered_users_csv empty but ${activeUsers.length} active users exist — skipping reconciliation (script does not collect registered users)`)
    return
  }
  // Se chegou aqui com string vazia e sem active users, significa roteador limpo - CONTINUAR
  console.log(`[mikrotik-sync] v7.1.29: MikroTik has ${registeredUsersCsv.trim().length === 0 ? '0' : 'some'} registered users`)
  
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
    
    // v7.1.63: If user is active (online), they ARE registered — no need to check registered_users
    if (activeUsersSet.has(login)) {
      meta.miss_count = 0
      meta.last_seen = now
      console.log(`[mikrotik-sync] v7.1.63: User confirmed active (online): ${login}`)
      continue
    }
    
    // Check if user exists in MikroTik registered users
    if (registeredUsersSet.has(login)) {
      // User EXISTS in MikroTik - reset counters, everything is OK
      meta.miss_count = 0
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // v6.9.12: Healthcheck for GET requests (avoid misleading 500 errors)
  if (req.method === 'GET') {
    console.log('[mikrotik-sync] GET healthcheck request')
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: VERSION
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // v7.1.58b: Robust first-JSON extraction (handles duplicated payloads from RouterOS)
    function extractFirstJsonObject(s: string): string | null {
      const start = s.indexOf('{');
      if (start < 0) return null;
      let inString = false;
      let escape = false;
      let depth = 0;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
        }
      }
      return null;
    }

    let payload: SyncPayload
    let rawBody = ''
    try {
      rawBody = await req.text()
      
      // v7.1.58c: Try parse first, fallback to extraction if duplicated payload
      try {
        payload = JSON.parse(rawBody)
      } catch (parseErr) {
        // Attempt robust extraction of first JSON object
        const first = extractFirstJsonObject(rawBody)
        if (first) {
          console.warn('[mikrotik-sync] Sanitized payload, original length:', rawBody.length, 'extracted length:', first.length)
          payload = JSON.parse(first)
        } else {
          throw parseErr // re-throw original error
        }
      }
    } catch (jsonError) {
      console.error('[mikrotik-sync] Invalid JSON body:', jsonError)
      // Mask sync_token in raw preview for security
      const maskedPreview = rawBody.substring(0, 300).replace(/"sync_token"\s*:\s*"[^"]*"/g, '"sync_token":"***"')
      console.error('[mikrotik-sync] Raw body preview (masked, 300 chars):', maskedPreview)
      console.error('[mikrotik-sync] Raw body length:', rawBody.length)
      if (rawBody.length > 225) {
        const around = rawBody.substring(220, 250)
        const codes = Array.from(around).map((c: string) => c.charCodeAt(0))
        console.error('[mikrotik-sync] Chars 220-250:', JSON.stringify(around), 'codes:', codes)
      }
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON body. Expected: {"sync_token": "...", ...}' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // v6.9.13: Mask sensitive data in logs
    const safePayload = { 
      ...payload, 
      sync_token: payload.sync_token ? `${payload.sync_token.slice(0, 4)}...${payload.sync_token.slice(-4)}` : undefined 
    };
    console.log('[mikrotik-sync] Received sync request:', JSON.stringify(safePayload))

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

// v7.1.42: Include portal_profile_version for rollout mechanism
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, embarcacao_id, nome, status, synced_profiles, synced_users, firewall_rules_hash, initial_config_sent, portal_profile_version, telemetry_failures')
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
    
    // v6.9.21: Reset expired quotas for ALL tripulantes (not just active ones)
    // v7.1.64: Collect unblocked tripulante IDs for unblock_quota injection
    const earlyUnblockActions: PendingAction[] = []
    if (embarcacao) {
      const { resetCount, unblockedTripulanteIds } = await resetExpiredQuotas(supabase, hotspot.embarcacao_id, effectiveTimezone)
      if (resetCount > 0) {
        console.log(`[mikrotik-sync] v7.1.64: Reset quota for ${resetCount} tripulante(s) in ${effectiveTimezone}`)
      }
      // v7.1.64: Inject unblock_quota for reactivated tripulantes
      if (unblockedTripulanteIds.length > 0) {
        const { data: devices } = await supabase
          .from('dispositivos_registrados')
          .select('mac_address')
          .in('tripulante_id', unblockedTripulanteIds)
        
        for (const d of devices || []) {
          earlyUnblockActions.push({
            id: 'auto-unblock-quota-' + d.mac_address.replace(/:/g, ''),
            type: 'unblock_quota',
            payload: { mac: d.mac_address }
          })
        }
        console.log(`[mikrotik-sync] v7.1.64: Injecting ${earlyUnblockActions.length} unblock_quota actions for ${unblockedTripulanteIds.length} reactivated tripulante(s)`)
      }
    }
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
              
              // v6.9.14: Update tripulante status with block reason
              await supabase
                .from('tripulantes')
                .update({
                  status: 'bloqueado',
                  bloqueio_motivo: 'quota_exceeded',
                  bloqueado_at: new Date().toISOString()
                })
                .eq('id', tripulante.id)
              
              // v6.9.11: Mark for kick when quota >= 100%
              shouldKickForQuota = true
              console.log(`[mikrotik-sync] v6.9.14: User ${activeUser.user} exceeded quota (${Math.round(percentage)}%), blocked and will be kicked`)
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

          // v7.1.64: Block quota exceeded — use block_quota (triple block) instead of kick_session
          if (shouldKickForQuota) {
            // Will be injected into formattedActions after it's created
            earlyUnblockActions.push({
              id: 'auto-block-quota-' + activeUser.mac.replace(/:/g, ''),
              type: 'block_quota',
              payload: { mac: activeUser.mac, user: activeUser.user }
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
          type: 'kick_session',
          payload: { user: violation.user, mac }
        })
      }
    }

    // Add kick actions for blocked devices
    for (const bd of blockedDevices) {
      formattedActions.push({
        id: `auto-kick-blocked-${bd.mac}`,
        type: 'kick_session',
        payload: { user: '', mac: bd.mac }
      })
    }

    // v7.1.64: Inject early actions (block_quota / unblock_quota) into formattedActions
    if (earlyUnblockActions.length > 0) {
      formattedActions.push(...earlyUnblockActions)
      console.log(`[mikrotik-sync] v7.1.64: Injected ${earlyUnblockActions.length} quota block/unblock actions`)
    }

    // v7.0: First-sync detection - inject initial configuration
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const backendHost = new URL(supabaseUrl).hostname
    
    if (!hotspot.initial_config_sent) {
      console.log('[mikrotik-sync] v7.0: First sync detected - injecting initial configuration')
      
      // 1. Configure hotspot profile (login-url + dns-name)
      const hotspotSlug = hotspot.nome.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
      const dnsName = `${hotspotSlug}.navspot.local`
      
      // Inject as FIRST action (use unshift for highest priority)
      formattedActions.unshift({
        id: 'initial-config-profile',
        type: 'configure_hotspot_profile',
        payload: { login_url: loginUrl, dns_name: dnsName }
      })
      
      // 2. Inject essential walled garden domains (explicit, NO wildcards)
      const essentialDomains = [
        // Portal
        'navspot.lovable.app',
        // Backend
        backendHost,
        // Android CPD
        'connectivitycheck.gstatic.com',
        'clients3.google.com',
        // Apple CPD  
        'captive.apple.com',
        'www.apple.com',
        // Windows CPD
        'msftconnecttest.com',
        'www.msftconnecttest.com',
        'msftncsi.com',
        'www.msftncsi.com'
      ]
      
      for (const domain of essentialDomains) {
        formattedActions.push({
          id: `initial-wg-${domain.replace(/[^a-z0-9]/gi, '')}`,
          type: 'add_whitelist_domain',
          payload: { list_name: 'essential', domain }
        })
      }
      
      // 3. Mark as configured (will not repeat on next sync)
      await supabase
        .from('hotspots')
        .update({ initial_config_sent: true })
        .eq('id', hotspot.id)
      
      console.log(`[mikrotik-sync] v7.0: Injected initial config for ${hotspot.nome}`)
    }

    // v7.1.61: Re-inject portal config if never confirmed (breaks deadlock)
    if (hotspot.initial_config_sent && !(hotspot as any).portal_profile_version) {
      console.log(`[mikrotik-sync] v7.1.61: portal_profile_version=null, re-injecting portal config for ${hotspot.nome}`)
      
      const hotspotSlugRetry = hotspot.nome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const retryLoginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
      const retryDnsName = `${hotspotSlugRetry}.navspot.local`
      
      const alreadyHasConfig = formattedActions.some((a: any) => a.type === 'configure_hotspot_profile')
      if (!alreadyHasConfig) {
        formattedActions.unshift({
          id: 'retry-config-profile',
          type: 'configure_hotspot_profile',
          payload: { login_url: retryLoginUrl, dns_name: retryDnsName }
        })
        
        // Also inject essential CPD walled garden entries
        const backendHost = new URL(Deno.env.get('SUPABASE_URL')!).hostname
        const essentialDomainsRetry = [
          'navspot.lovable.app', backendHost,
          'connectivitycheck.gstatic.com', 'clients3.google.com',
          'captive.apple.com', 'www.apple.com',
          'msftconnecttest.com', 'www.msftconnecttest.com'
        ]
        for (const domain of essentialDomainsRetry) {
          formattedActions.push({
            id: `retry-wg-${domain.replace(/[^a-z0-9]/gi, '')}`,
            type: 'add_whitelist_domain',
            payload: { list_name: 'essential', domain }
          })
        }
      }
      
      // Reset telemetry_failures + last_force_repair_at atomically
      await supabase
        .from('hotspots')
        .update({ telemetry_failures: 0, last_force_repair_at: null })
        .eq('id', hotspot.id)
      
      console.log(`[mikrotik-sync] v7.1.61: Injected ${formattedActions.length} actions for deadlock recovery`)
    }

    // v7.1.60: State Reconciliation with telemetry reliability check
    const hotspotLoginBy = (payload as any).hotspot_login_by || ''
    const hotspotLoginUrl = (payload as any).hotspot_login_url || ''

    console.log(`[mikrotik-sync] v7.1.60: Telemetry - login_by="${hotspotLoginBy}", login_url="${hotspotLoginUrl.slice(0, 50)}..."`)

    const hasChap = hotspotLoginBy.includes('http-chap')
    const hasPap = hotspotLoginBy.includes('http-pap')
    const hasValidUrl = hotspotLoginUrl.length >= 10

    const reliable = telemetryIsReliable(hotspotLoginBy, hotspotLoginUrl)

    if (!reliable) {
      // Increment failure counter
      const currentFailures = (hotspot as any).telemetry_failures || 0
      const newFailures = currentFailures + 1
      await supabase
        .from('hotspots')
        .update({ telemetry_failures: newFailures })
        .eq('id', hotspot.id)

      console.log(`[mikrotik-sync] v7.1.60: Skipping portal repair - telemetry unreliable (login_by="${hotspotLoginBy}", failures=${newFailures})`)

      // v7.8.6: Only force repair if portal was NEVER configured
      const currentPPV = (hotspot as any).portal_profile_version
      if (newFailures >= 3 && !currentPPV) {
        console.warn(`[mikrotik-sync] v7.1.61: FORCE REPAIR - ${newFailures} consecutive telemetry failures, injecting portal config to break deadlock (hotspot=${hotspot.nome})`)

        const hotspotSlug = hotspot.nome.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
        const forceLoginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
        const forceDnsName = `${hotspotSlug}.navspot.local`

        formattedActions.unshift({
          id: 'force-repair-whitelist',
          type: 'create_whitelist_domain',
          payload: { domain: new URL(Deno.env.get('SUPABASE_URL')!).hostname }
        })
        formattedActions.unshift({
          id: 'force-repair-config-profile',
          type: 'configure_hotspot_profile',
          payload: { login_url: forceLoginUrl, dns_name: forceDnsName }
        })

        const { error: resetError } = await supabase
          .from('hotspots')
          .update({ telemetry_failures: 0, last_force_repair_at: new Date().toISOString() })
          .eq('id', hotspot.id)

        if (resetError) {
          console.error(`[mikrotik-sync] v7.1.60d: Failed to reset telemetry_failures: ${resetError.message}`)
        } else {
          console.log(`[mikrotik-sync] v7.1.60d: Reset telemetry_failures to 0, last_force_repair_at set after force repair (portal_profile_version preserved)`)
        }
      } else if (newFailures >= 3) {
        // Portal already configured - just reset counter, don't inject broken action
        console.log(`[mikrotik-sync] v7.8.6: Skipping force repair - portal already configured (version=${currentPPV}), resetting counter`)
        await supabase
          .from('hotspots')
          .update({ telemetry_failures: 0 })
          .eq('id', hotspot.id)
      }
    } else {
      // Telemetry reliable -- reset counter if needed
      if ((hotspot as any).telemetry_failures > 0) {
        await supabase
          .from('hotspots')
          .update({ telemetry_failures: 0 })
          .eq('id', hotspot.id)
        console.log(`[mikrotik-sync] v7.1.60: Telemetry restored for ${hotspot.nome} - reset failure counter`)
      }
    }

    // v7.1.60: Only repair if telemetry is reliable; skip when data is missing/failed
    const needsPortalRepair = reliable
      ? (hasChap || !hasPap || !hasValidUrl)
      : false

    if (needsPortalRepair) {
      console.log(`[mikrotik-sync] v7.1.46: Portal repair needed - hasChap=${hasChap}, hasPap=${hasPap}, hasValidUrl=${hasValidUrl}`)
      
      // Inject configure_hotspot_profile at TOP of actions
      const hotspotSlug = hotspot.nome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
      const dnsName = `${hotspotSlug}.navspot.local`
      
      formattedActions.unshift({
        id: 'rollout-config-profile',
        type: 'configure_hotspot_profile',
        payload: { login_url: loginUrl, dns_name: dnsName }
      })
      
      // v7.1.46: Do NOT update portal_profile_version - wait for confirmation
      // If it was already marked, reset to force recheck next sync
      const currentVersion = (hotspot as any).portal_profile_version
      if (currentVersion === REQUIRED_PORTAL_VERSION) {
        await supabase
          .from('hotspots')
          .update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
          .eq('id', hotspot.id)
        console.log(`[mikrotik-sync] v7.1.46: Kept portal_profile_version as ${REQUIRED_PORTAL_VERSION} (repair injected but version preserved)`)
      }
      
      console.log(`[mikrotik-sync] v7.1.46: Injected configure_hotspot_profile for ${hotspot.nome}`)
    } else if (reliable) {
      // v7.1.60d: Only confirm when telemetry is reliable AND no recent force-repair
      const FORCE_REPAIR_COOLDOWN_MS = 120_000 // 2 minutes
      const lastForceRepair = (hotspot as any).last_force_repair_at
      const forceRecent = lastForceRepair &&
        (Date.now() - new Date(lastForceRepair).getTime()) < FORCE_REPAIR_COOLDOWN_MS

      if (forceRecent) {
        console.log(`[mikrotik-sync] v7.1.60d: Skipping portal confirmation - force-repair cooldown active (hotspot=${hotspot.nome})`)
      } else {
        const currentVersion = (hotspot as any).portal_profile_version
        if (currentVersion !== REQUIRED_PORTAL_VERSION) {
          await supabase
            .from('hotspots')
            .update({
              portal_profile_version: REQUIRED_PORTAL_VERSION,
              last_force_repair_at: null
            })
            .eq('id', hotspot.id)
          console.log(`[mikrotik-sync] v7.1.60d: Portal configuration confirmed via telemetry - marked as ${REQUIRED_PORTAL_VERSION}`)
        }
      }
    } else {
      console.log(`[mikrotik-sync] v7.1.60d: Skipping portal confirmation - telemetry unreliable (hotspot=${hotspot.nome})`)
    }

    // Fetch and process firewall rules for this empresa
    let firewallRules: { action: string; domains: string[]; apps: string[] }[] = []
    
    // v6.9.17: Track if we have any profiles with restrictive modes
    let hasRestrictiveProfile = false
    let restrictiveWhitelistDomains: string[] = []

    if (embarcacao) {
      // Check for profiles with bloquear_tudo mode
      const { data: restrictiveProfiles } = await supabase
        .from('perfis_velocidade')
        .select('id, modo_acesso')
        .eq('empresa_id', embarcacao.empresa_id)
        .eq('modo_acesso', 'bloquear_tudo')
      
      if (restrictiveProfiles && restrictiveProfiles.length > 0) {
        hasRestrictiveProfile = true
        console.log(`[mikrotik-sync] v6.9.17: Found ${restrictiveProfiles.length} profile(s) with bloquear_tudo mode`)
        
        // Get whitelist domains for these profiles (from regras_acesso linked to the profile)
        const perfilIds = restrictiveProfiles.map(p => p.id)
        const { data: whitelistRegras } = await supabase
          .from('regras_acesso')
          .select(`
            lista_id,
            listas_acesso(dominios, tipo)
          `)
          .eq('empresa_id', embarcacao.empresa_id)
          .eq('ativo', true)
          .in('perfil_id', perfilIds)

        if (whitelistRegras) {
          for (const regra of whitelistRegras) {
            const lista = regra.listas_acesso as { dominios: string[]; tipo: string } | null
            if (lista?.tipo === 'whitelist' && lista.dominios) {
              for (const domain of lista.dominios) {
                const normalized = normalizeDomain(domain)
                if (normalized && !restrictiveWhitelistDomains.includes(normalized)) {
                  restrictiveWhitelistDomains.push(normalized)
                }
              }
            }
          }
        }
        
        console.log(`[mikrotik-sync] v6.9.17: Collected ${restrictiveWhitelistDomains.length} whitelist domains for restrictive profiles`)
      }
      
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
      
      // v6.9.15: Hash-based caching to prevent infinite loop
      // Only inject firewall/walled-garden actions if rules have changed
      if (firewallRules.length > 0 || hasRestrictiveProfile) {
        // Normalize and sort all domains for deterministic hash
        const allDomains: string[] = []
        for (const rule of firewallRules) {
          for (const domain of rule.domains) {
            const normalized = normalizeDomain(domain)
            if (normalized) {
              allDomains.push(`${rule.action}:${normalized}`)
            }
          }
        }
        
        // v6.9.17: Include restrictive whitelist domains in hash
        for (const domain of restrictiveWhitelistDomains) {
          allDomains.push(`restrictive-allow:${domain}`)
        }
        
        allDomains.sort()
        
        // Calculate hash of current firewall rules
        const rulesString = allDomains.join('|')
        const newHash = await hashString(rulesString)
        const currentHash = (hotspot as any).firewall_rules_hash || null
        
        console.log(`[mikrotik-sync] v6.9.17: Firewall rules hash - current: ${currentHash?.slice(0, 8) || 'null'}, new: ${newHash.slice(0, 8)}`)
        
        if (currentHash !== newHash) {
          // Rules changed - inject actions
          console.log(`[mikrotik-sync] v6.9.17: Firewall rules changed, injecting ${allDomains.length} domain actions`)
          
          for (const rule of firewallRules) {
            if (rule.action === 'block' && rule.domains.length > 0) {
              for (const domain of rule.domains) {
                const normalized = normalizeDomain(domain)
                if (normalized) {
                  // Walled Garden (pré-login) - use original domain for pattern matching
                  formattedActions.push({
                    id: `auto-blacklist-${normalized.replace(/[^a-z0-9]/gi, '')}`,
                    type: 'add_blacklist_domain',
                    payload: { list_name: 'blacklist', domain: domain.trim() }
                  })
                  
                  // Firewall Filter (pós-login) - use NORMALIZED domain for IP resolution
                  formattedActions.push({
                    id: `auto-firewall-${normalized.replace(/[^a-z0-9]/gi, '')}`,
                    type: 'add_firewall_block',
                    payload: { domain: normalized }
                  })
                }
              }
            } else if (rule.action === 'allow' && rule.domains.length > 0) {
              for (const domain of rule.domains) {
                const normalized = normalizeDomain(domain)
                if (normalized) {
                  formattedActions.push({
                    id: `auto-whitelist-${normalized.replace(/[^a-z0-9]/gi, '')}`,
                    type: 'add_whitelist_domain',
                    payload: { list_name: 'whitelist', domain: domain.trim() }
                  })
                }
              }
            }
          }
          
          // v6.9.17: Inject firewall allow rules for restrictive profiles
          if (hasRestrictiveProfile && restrictiveWhitelistDomains.length > 0) {
            console.log(`[mikrotik-sync] v6.9.17: Injecting ${restrictiveWhitelistDomains.length} firewall allow rules for bloquear_tudo mode`)
            
            for (const domain of restrictiveWhitelistDomains) {
              formattedActions.push({
                id: `auto-fw-allow-${domain.replace(/[^a-z0-9]/gi, '')}`,
                type: 'add_firewall_allow',
                payload: { domain: domain }
              })
            }
          }
          
          // Update hash in database
          await supabase
            .from('hotspots')
            .update({ 
              firewall_rules_hash: newHash,
              firewall_rules_updated_at: new Date().toISOString()
            })
            .eq('id', hotspot.id)
          
          console.log(`[mikrotik-sync] v6.9.17: Updated firewall_rules_hash`)
        } else {
          console.log(`[mikrotik-sync] v6.9.17: Firewall rules unchanged, skipping injection (loop prevention)`)
        }
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

        // v7.8.7: Invalidate cache when router reports 0 profiles but cache is non-empty
        // This means a previous action was sent but never processed by the router
        if (registeredProfilesCsv.length === 0 && syncedProfiles.length > 0) {
          console.warn(`[mikrotik-sync] v7.8.7: Cache/router mismatch - cache has ${syncedProfiles.length} profiles but router reports 0. Clearing cache to force re-sync`)
          syncedProfiles.length = 0 // Clear in-memory to force re-injection below
          await supabase
            .from('hotspots')
            .update({ synced_profiles: [] })
            .eq('id', hotspot.id)
        }

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
              // v7.8.6: Revert to cache check - always inject was too aggressive
              if (syncedProfiles.includes(slug)) {
                console.log(`[mikrotik-sync] v7.8.6: Profile in cache, skipping: ${slug}`)
                return null
              }
              console.log(`[mikrotik-sync] v7.8.6: Profile not in cache, will sync: ${slug}`)
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

    // v7.1.29: Auto-repair portal config
    // Inject configure_hotspot_profile if not in first-sync AND no pending config action AND has user actions
    const hasPendingPortalConfig = formattedActions.some(a => a.type === 'configure_hotspot_profile')
    const hasUserActions = formattedActions.some(a => 
      a.type === 'create_user' || a.type === 'add_user_profile' || a.type === 'add_user'
    )
    
    if (!hasPendingPortalConfig && hotspot.initial_config_sent && hasUserActions && reliable) {
      const supabaseUrlForRepair = Deno.env.get('SUPABASE_URL')!
      const portalHost = 'navspot.lovable.app'
      const hotspotSlug = hotspot.nome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      
      // v7.1.58d: Store raw URL - escape happens once in pipe generation
      const loginUrl = `https://${portalHost}/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
      const dnsName = `${hotspotSlug}.navspot.local`
      
      // Inject at the beginning (before profiles and users)
      formattedActions.unshift({
        id: 'repair-config-profile',
        type: 'configure_hotspot_profile',
        payload: { login_url: loginUrl, dns_name: dnsName }
      })
      
      // Also ensure essential walled garden (portal + backend)
      formattedActions.unshift({
        id: 'repair-wg-portal',
        type: 'add_whitelist_domain',
        payload: { domain: portalHost }
      })
      
      const backendHostForRepair = new URL(supabaseUrlForRepair).hostname
      formattedActions.unshift({
        id: 'repair-wg-backend',
        type: 'add_whitelist_domain',
        payload: { domain: backendHostForRepair }
      })
      
      console.log(`[mikrotik-sync] v7.1.60b: Injected portal repair config with user actions (telemetry reliable)`)
    } else if (!reliable && hasUserActions) {
      console.log(`[mikrotik-sync] v7.1.60b: Skipping auto-repair - telemetry unreliable (hotspot=${hotspot.nome}, pendingUserActions=${formattedActions.filter(a => a.type === 'create_user' || a.type === 'create_profile').length})`)
    }
    // PRIORITY ORDER: Firewall rules FIRST (most critical for bloquear_tudo mode)
    // to prevent buffer truncation from losing them
    const expandedActions: typeof formattedActions = []
    
    // v6.9.18: Separate actions by priority
    const configureProfileActions: typeof formattedActions = [] // v7.0: Highest priority
    const firewallAllowActions: typeof formattedActions = []
    const firewallBlockActions: typeof formattedActions = []
    const profileActions: typeof formattedActions = []
    const userActions: typeof formattedActions = []
    const walledGardenActions: typeof formattedActions = []
    const otherActions: typeof formattedActions = []

    for (const action of formattedActions) {
      const p = action.payload as Record<string, unknown>
      
      // v7.0: Configure hotspot profile (highest priority)
      if (action.type === 'configure_hotspot_profile') {
        configureProfileActions.push(action)
      }
      // Expand walled garden with multiple domains
      else if (action.type === 'add_walled_garden' && Array.isArray(p.dominios)) {
        for (const domain of p.dominios as string[]) {
          if (domain) {
            walledGardenActions.push({
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
            walledGardenActions.push({
              id: `${action.id}-${domain.replace(/[^a-z0-9]/gi, '')}`,
              type: 'add_blacklist_domain' as string,
              payload: { list_name: String(p.lista_name || 'regra'), domain }
            })
          }
        }
      }
      // v6.9.18: Categorize by priority
      else if (action.type === 'add_firewall_allow') {
        firewallAllowActions.push(action)
      }
      else if (action.type === 'add_firewall_block') {
        firewallBlockActions.push(action)
      }
      // v7.1.64: Quota enforcement actions — high priority (same as firewall)
      else if (action.type === 'block_quota' || action.type === 'unblock_quota') {
        firewallBlockActions.push(action)
      }
      else if (action.type === 'add_user_profile' || action.type === 'create_profile' || action.type === 'update_profile_config') {
        profileActions.push(action)
      }
      else if (action.type === 'create_user' || action.type === 'add_user' || action.type === 'update_user') {
        userActions.push(action)
      }
      else if (action.type === 'add_whitelist_domain' || action.type === 'add_blacklist_domain') {
        walledGardenActions.push(action)
      }
      else {
        otherActions.push(action)
      }
    }
    
    // v7.0: Assemble in priority order (most critical first to avoid truncation)
    // 0. Configure hotspot profile (v7.0 first-sync - HIGHEST priority)
    // 1. Firewall ALLOW (bloquear_tudo whitelist)
    // 2. Firewall BLOCK (blacklist)
    // 3. Profiles (must exist before users)
    // 4. Users
    // 5. Walled Garden (pre-login, less critical since firewall handles post-login)
    // 6. Other actions
    expandedActions.push(...configureProfileActions)
    expandedActions.push(...firewallAllowActions)
    expandedActions.push(...firewallBlockActions)
    expandedActions.push(...profileActions)
    expandedActions.push(...userActions)
    expandedActions.push(...walledGardenActions)
    expandedActions.push(...otherActions)
    
    console.log(`[mikrotik-sync] v7.0: Action priority order - configure_profile:${configureProfileActions.length}, firewall_allow:${firewallAllowActions.length}, firewall_block:${firewallBlockActions.length}, profiles:${profileActions.length}, users:${userActions.length}, walled_garden:${walledGardenActions.length}, other:${otherActions.length}`)

    // v6.9: Auto-mark as executed after 1 delivery (fire-and-forget pattern)
    if (expandedActions.length > 0) {
      // v7.1.58d: Filter by UUID regex to prevent PostgreSQL type errors from synthetic IDs
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const actionIds = expandedActions
        .filter(a => UUID_REGEX.test(a.id))
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

    // v7.0: Generate pipe-delimited format for RouterOS parsing
    // Format: cmd|param1|param2;cmd2|param1|param2;
    // Wrapped in [[ ]] markers for extraction by navspot-sync script
    const pipeDelimitedActions = expandedActions.map(action => {
      const p = action.payload
      
      switch (action.type) {
        // v7.0: New action for configuring hotspot profile at runtime
        // v7.1.11: Escape $(mac), $(ip), etc. placeholders so RouterOS stores them as literals
        case 'configure_hotspot_profile':
          // Format: configure_hotspot_profile|login_url|dns_name
          // v7.1.59b: Tokenize placeholders (post-stringify converts tokens to \$)
          const loginUrl = tokenizePlaceholders(String(p.login_url || ''))
          return `configure_hotspot_profile|${sanitizeForPipe(loginUrl)}|${p.dns_name || ''}`
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
        // v7.1.65: update_user — upsert user with password and profile
        case 'update_user':
          return `update_user|${p.user || ''}|${p.password || ''}|${p.profile || 'default'}`
        case 'update_profile':
        case 'update_profile_config':
        case 'update_user_profile':
          // v7.0.1: update_profile_config updates profile settings (rate, quota, etc)
          // For MikroTik, we recreate the profile with new settings
          if (action.type === 'update_profile_config' && p.name) {
            const normalizeRate = (v: string): string => String(v || '2M/5M')
              .toUpperCase()
              .replace(/MB/g, 'M').replace(/KB/g, 'K').replace(/GB/g, 'G').trim()
            const rateLimit = normalizeRate(String(p.rateLimit || '2M/5M'))
            return `create_profile|${p.name || ''}|${rateLimit}|${p.sharedUsers || 1}|${p.limitBytes || 0}`
          }
          // Update profile is handled via create_user with updated profile
          return `create_user|${p.user || ''}||${p.profile || ''}`
        case 'create_profile':
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
        case 'add_firewall_block':
          // v6.9.14: Firewall filter for post-login blocking
          return `add_firewall_block|${p.domain || ''}`
        case 'add_firewall_allow':
          // v6.9.17: Firewall filter for "bloquear_tudo" mode - whitelist
          return `add_firewall_allow|${p.domain || ''}`
        // v7.1.64: Quota enforcement — triple block / unblock
        case 'block_quota':
          return `block_quota|${p.mac || ''}|${p.user || ''}`
        case 'unblock_quota':
          return `unblock_quota|${p.mac || ''}`
        case 'add_firewall_l7':
          return `create_firewall_rule|${p.order || 0}|${p.list || ''}|${p.type || ''}|${p.profile || ''}|${p.schedule || ''}|${p.action || ''}`
        case 'update_profile_quota':
          return `update_profile_quota|${p.profile || ''}|${p.quota_mb || 0}`
        default:
          // Fallback: type|param1|param2|...
          return [action.type, ...Object.values(p).map(String)].join('|')
      }
    }).join(';')

    // v7.1.20: Sanitize pipe for safe /file set contents, then wrap in [[ ]] markers
    // This prevents truncation when RouterOS parses special characters
    const sanitizedPipe = pipeDelimitedActions ? sanitizePipeForFileContents(pipeDelimitedActions) : ''
    const formattedPipe = sanitizedPipe ? `[[${sanitizedPipe};]]` : '[[]]'

    console.log(`[mikrotik-sync] v7.0: Returning ${expandedActions.length} pending actions, ${firewallRules.length} firewall rules, ${blockedDevices.length} blocked devices`)

    // v7.1.15: pending_actions_pipe FIRST in JSON for RouterOS truncation resilience
    // RouterOS may truncate large responses; putting pipe first ensures markers are found
    // v7.1.59: Sanitize \u0026 → & in JSON output
    // Deno's JSON.stringify encodes & as \u0026, but RouterOS reads file contents as raw text
    // This would corrupt login-url: ?h=UUID\u0026mac=$(mac) instead of ?h=UUID&mac=$(mac)
    const jsonBody = JSON.stringify({
        pending_actions_pipe: formattedPipe,  // FIRST - RouterOS scans for [[
        success: true,
        server_time: new Date().toISOString(),
        actions_count: expandedActions.length,
        blocked_devices: blockedDevices
      }).replace(/\\u0026/g, '&')
        .replace(/__NAVSPOT_DOLLAR__/g, '\\$(')

    return new Response(
      jsonBody,
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
