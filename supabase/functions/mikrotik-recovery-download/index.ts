import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * mikrotik-recovery-download v7.1.0
 * 
 * Ultra-thin recovery endpoint for MikroTik self-healing.
 * v7.1: Uses fetch+import pattern like bootstrap - no embedded scripts!
 *       Resets initial_config_sent=false to force re-configuration.
 * 
 * Called by navspot-guardian when it detects missing components.
 * Also called by authenticated users from admin panel to download recovery scripts.
 */

const VERSION = "7.1.46"
const DEPLOYED_AT = new Date().toISOString()

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
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

    let syncToken: string | null = null
    let hotspotId: string | null = null

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncToken = body.sync_token || null
        hotspotId = body.hotspot_id || null
      } catch {
        console.error(`[mikrotik-recovery-download ${VERSION}] Invalid JSON body`)
        return new Response(
          'Invalid JSON body',
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      syncToken = url.searchParams.get('sync_token')
      hotspotId = url.searchParams.get('hotspot_id')
    } else {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    // Handle hotspot_id with JWT authentication
    if (hotspotId) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          'Authorization required when using hotspot_id',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        )
      }

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )

      const token = authHeader.replace('Bearer ', '')
      const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token)

      if (claimsError || !claims?.claims) {
        return new Response('Invalid token', { status: 401, headers: corsHeaders })
      }

      const userId = claims.claims.sub as string
      console.log(`[mikrotik-recovery-download ${VERSION}] User: ${userId} requesting hotspot: ${hotspotId}`)

      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, empresa_id, embarcacao_id')
        .eq('user_id', userId)
        .single()

      if (roleError || !userRole) {
        return new Response('User role not found', { status: 403, headers: corsHeaders })
      }

      const { data: hotspot, error: hotspotError } = await supabase
        .from('hotspots')
        .select(`id, nome, sync_token, sync_interval_minutes, embarcacoes!inner(id, nome, empresa_id)`)
        .eq('id', hotspotId)
        .single()

      if (hotspotError || !hotspot) {
        return new Response('Hotspot not found', { status: 404, headers: corsHeaders })
      }

      const embarcacao = hotspot.embarcacoes as unknown as { id: string; empresa_id: string }

      // Permission check
      if (userRole.role === 'super_admin') {
        // OK
      } else if (userRole.role === 'empresa_admin') {
        if (embarcacao.empresa_id !== userRole.empresa_id) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else if (userRole.role === 'gerente_embarcacao') {
        const { data: access } = await supabase
          .from('gerente_embarcacoes')
          .select('embarcacao_id')
          .eq('user_id', userId)
          .eq('embarcacao_id', embarcacao.id)
          .maybeSingle()

        if (!access) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else {
        return new Response('Access denied', { status: 403, headers: corsHeaders })
      }

      syncToken = hotspot.sync_token
    }

    if (!syncToken) {
      return new Response(
        'sync_token or hotspot_id is required',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery for token: ${maskToken(syncToken)}`)

    // Find hotspot
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select(`id, nome, sync_token, sync_interval_minutes, embarcacoes!inner(id, nome, empresa_id)`)
      .eq('sync_token', syncToken)
      .single()

    if (hotspotError || !hotspot) {
      return new Response('Invalid sync_token', { status: 404, headers: corsHeaders })
    }

    // v7.1 CRITICAL: Reset initial_config_sent to force re-configuration
    const { error: resetError } = await supabase
      .from('hotspots')
      .update({ initial_config_sent: false })
      .eq('id', hotspot.id)

    if (resetError) {
      console.error(`[mikrotik-recovery-download ${VERSION}] Failed to reset initial_config_sent:`, resetError)
    } else {
      console.log(`[mikrotik-recovery-download ${VERSION}] Reset initial_config_sent=false for ${hotspot.nome}`)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const scriptsUrl = `${supabaseUrl}/functions/v1/mikrotik-scripts`

    console.log(`[mikrotik-recovery-download ${VERSION}] Generating ULTRA-THIN recovery for: ${hotspot.nome}`)

    const recoveryScript = generateRecoveryScript(scriptsUrl, syncToken)

    console.log(`[mikrotik-recovery-download ${VERSION}] Recovery generated (${recoveryScript.length} bytes)`)

    return new Response(recoveryScript, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="navspot-recovery-v${VERSION}.rsc"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })

  } catch (error) {
    console.error(`[mikrotik-recovery-download ${VERSION}] Error:`, error)
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

function generateRecoveryScript(scriptsUrl: string, syncToken: string): string {
  // v7.1: Recovery ULTRA-MINIMO - usa fetch+import igual ao bootstrap
  return `# =========================================
# NAVSPOT Recovery Script v${VERSION}
# Uses fetch+import pattern (no embedded scripts)
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-RECOVERY v${VERSION}: Iniciando reparacao ULTRA-THIN..."

# 0. TOKEN (recreate if missing)
:log info "NAVSPOT-RECOVERY: Verificando token..."
:local tokenExists [/file find name="navspot-token.txt"]
:if ([:len $tokenExists] = 0) do={
:log info "NAVSPOT-RECOVERY: Recriando token..."
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="${syncToken}"
:log info "NAVSPOT-RECOVERY: Token recriado"
} else={
:log info "NAVSPOT-RECOVERY: Token OK"
}

# 1. CLEANUP OLD SCRIPTS (will be replaced)
:log info "NAVSPOT-RECOVERY: Limpando scripts antigos..."
:do { /system script remove [find name="navspot-sync"] } on-error={}
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
:do { /system script remove [find name="navspot-guardian"] } on-error={}
:do { /file remove "ns-install.rsc" } on-error={}
:delay 1s

# 2. DOWNLOAD AND INSTALL SCRIPTS VIA API
:log info "NAVSPOT-RECOVERY v${VERSION}: Baixando scripts da API..."
:local scriptsUrl "${scriptsUrl}?type=all&token=${syncToken}"
/tool fetch url=$scriptsUrl check-certificate=no dst-path="ns-install.rsc"
:delay 3s

:local installFile [/file find name~"ns-install.rsc"]
:if ([:len $installFile] = 0) do={
:log error "NAVSPOT-RECOVERY: Falha ao baixar scripts!"
:error "Abortando recovery - scripts nao baixados"
}

:log info "NAVSPOT-RECOVERY v${VERSION}: Importando scripts..."
/import ns-install.rsc
:delay 1s
:do { /file remove "ns-install.rsc" } on-error={}
:log info "NAVSPOT-RECOVERY v${VERSION}: Scripts instalados!"

# 2.5. CORRIGIR LOGIN-BY IMEDIATAMENTE (v7.1.46 freio de emergencia)
:log info "NAVSPOT-RECOVERY v${VERSION}: Aplicando login-by=cookie,http-pap..."
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-by="cookie,http-pap"
:log info ("NAVSPOT-RECOVERY: login-by corrigido em ".[/ip hotspot profile get $hp name])
}

# 3. EXECUTAR SYNC PARA RECEBER CONFIGURACAO
:log info "NAVSPOT-RECOVERY v${VERSION}: Executando sync para receber config..."
:delay 2s
/system script run navspot-sync

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v${VERSION}: REPARACAO CONCLUIDA!"
:log info "Arquitetura: Fetch + Import (sem source={} embutido)"
:log info "NOTE: initial_config_sent resetado no servidor"
:log info "NOTE: login-by=cookie,http-pap aplicado localmente"
:log info "NOTE: Sync ira injetar login-url + walled-garden"
:log info "=========================================="
`
}
