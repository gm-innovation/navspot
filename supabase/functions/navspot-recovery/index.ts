const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VERSION = "8.0.0"
const DEPLOYED_AT = new Date().toISOString()
const FN = "navspot-recovery"

function maskToken(token: string): string {
  if (!token || token.length < 10) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

async function sbRest(url: string, path: string, sk: string, params: Record<string, string> = {}, single = true) {
  const qs = new URLSearchParams(params).toString()
  const headers: Record<string, string> = { apikey: sk, Authorization: "Bearer " + sk }
  if (single) headers["Accept"] = "application/vnd.pgrst.object+json"
  const r = await fetch(url + "/rest/v1/" + path + (qs ? "?" + qs : ""), { headers })
  if (!r.ok) return null
  return await r.json()
}

async function sbPatch(url: string, path: string, sk: string, filter: string, body: Record<string, unknown>) {
  await fetch(url + "/rest/v1/" + path + "?" + filter, {
    method: "PATCH",
    headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  })
}

async function verifyJwt(url: string, ak: string, authHeader: string): Promise<string | null> {
  const r = await fetch(url + "/auth/v1/user", {
    headers: { apikey: ak, Authorization: authHeader },
  })
  if (!r.ok) return null
  const user = await r.json()
  return user?.id || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const SU = Deno.env.get('SUPABASE_URL')!
    const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const AK = Deno.env.get('SUPABASE_ANON_KEY')!

    let syncToken: string | null = null
    let hotspotId: string | null = null

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        syncToken = body.sync_token || null
        hotspotId = body.hotspot_id || null
      } catch {
        return new Response('Invalid JSON body', { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } })
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url)
      syncToken = url.searchParams.get('sync_token')
      hotspotId = url.searchParams.get('hotspot_id')
    } else {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    if (hotspotId) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response('Authorization required when using hotspot_id', { status: 401, headers: corsHeaders })
      }

      const userId = await verifyJwt(SU, AK, authHeader)
      if (!userId) {
        return new Response('Invalid token', { status: 401, headers: corsHeaders })
      }

      console.log(`[${FN} ${VERSION}] User: ${userId} requesting hotspot: ${hotspotId}`)

      const userRole = await sbRest(SU, "user_roles", SK, { user_id: "eq." + userId, select: "role,empresa_id,embarcacao_id" })
      if (!userRole) {
        return new Response('User role not found', { status: 403, headers: corsHeaders })
      }

      const hotspot = await sbRest(SU, "hotspots", SK, {
        id: "eq." + hotspotId,
        select: "id,nome,sync_token,sync_interval_minutes,embarcacoes!inner(id,nome,empresa_id)",
      })
      if (!hotspot) {
        return new Response('Hotspot not found', { status: 404, headers: corsHeaders })
      }

      const embarcacao = hotspot.embarcacoes as { id: string; empresa_id: string }

      if (userRole.role === 'super_admin') {
        // OK
      } else if (userRole.role === 'empresa_admin') {
        if (embarcacao.empresa_id !== userRole.empresa_id) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else if (userRole.role === 'gerente_embarcacao') {
        const access = await sbRest(SU, "gerente_embarcacoes", SK, {
          user_id: "eq." + userId, embarcacao_id: "eq." + embarcacao.id, select: "id",
        })
        if (!access) {
          return new Response('Access denied', { status: 403, headers: corsHeaders })
        }
      } else {
        return new Response('Access denied', { status: 403, headers: corsHeaders })
      }

      syncToken = hotspot.sync_token
    }

    if (!syncToken) {
      return new Response('sync_token or hotspot_id is required', { status: 400, headers: corsHeaders })
    }

    console.log(`[${FN} ${VERSION}] Token: ${maskToken(syncToken)}`)

    const hotspot = await sbRest(SU, "hotspots", SK, {
      sync_token: "eq." + syncToken,
      select: "id,nome,sync_token,sync_interval_minutes",
    })

    if (!hotspot) {
      return new Response('Invalid sync_token', { status: 404, headers: corsHeaders })
    }

    await sbPatch(SU, "hotspots", SK, "id=eq." + hotspot.id, { initial_config_sent: false, portal_profile_version: null })
    console.log(`[${FN} ${VERSION}] Reset initial_config_sent for ${hotspot.nome}`)

    const scriptsUrl = `${SU}/functions/v1/gen7post`
    const recoveryScript = generateRecoveryScript(scriptsUrl, syncToken)

    console.log(`[${FN} ${VERSION}] Generated ${recoveryScript.length} bytes for ${hotspot.nome}`)

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
    console.error(`[${FN} ${VERSION}] Error:`, error)
    return new Response(
      `Error: ${error instanceof Error ? error.message : 'Internal server error'}`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})

function generateRecoveryScript(scriptsUrl: string, syncToken: string): string {
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
/tool fetch url="${scriptsUrl}" http-method=post http-data="{\\"mode\\":\\"serve\\",\\"type\\":\\"recovery\\",\\"token\\":\\"${syncToken}\\",\\"ros_version\\":\\"7\\"}" http-header-field="Content-Type: application/json" check-certificate=no dst-path="ns-install.rsc"
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


# 3. EXECUTAR SYNC PARA RECEBER CONFIGURACAO
:log info "NAVSPOT-RECOVERY v${VERSION}: Executando sync para receber config..."
:delay 2s
/system script run navspot-sync

:log info "=========================================="
:log info "NAVSPOT-RECOVERY v${VERSION}: REPARACAO CONCLUIDA!"
:log info "Arquitetura: Fetch + Import (sem source={} embutido)"
:log info "NOTE: initial_config_sent resetado no servidor"
:log info "NOTE: login-by=cookie,http-pap,http-chap aplicado localmente"
:log info "NOTE: Sync ira injetar login-url + walled-garden"
:log info "=========================================="
`
}
