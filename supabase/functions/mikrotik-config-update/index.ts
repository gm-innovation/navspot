import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UpdateType = 
  | 'update_device_limit'
  | 'add_walled_garden'
  | 'remove_walled_garden'
  | 'add_firewall_rule'
  | 'remove_firewall_rule'
  | 'update_user_profile'
  | 'register_device'
  | 'block_device'
  | 'unblock_device'
  | 'create_user'
  | 'delete_user'
  | 'update_user_password'
  | 'kick_session'
  | 'disable_user'
  | 'enable_user'

interface ConfigUpdateRequest {
  hotspot_id: string
  update_type: UpdateType
  payload: Record<string, unknown>
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
      console.error('[config-update] Invalid JWT:', claimsError)
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const request: ConfigUpdateRequest = await req.json()
    
    if (!request.hotspot_id || !request.update_type) {
      return new Response(
        JSON.stringify({ success: false, error: 'hotspot_id and update_type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[config-update] Processing ${request.update_type} for hotspot: ${request.hotspot_id}`)

    // Verify hotspot exists and user has access (via RLS)
    const { data: hotspot, error: hotspotError } = await supabase
      .from('hotspots')
      .select('id, nome')
      .eq('id', request.hotspot_id)
      .single()

    if (hotspotError || !hotspot) {
      console.error('[config-update] Hotspot not found or access denied:', hotspotError)
      return new Response(
        JSON.stringify({ success: false, error: 'Hotspot not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map update type to action type for MikroTik
    const actionTypeMap: Record<UpdateType, string> = {
      update_device_limit: 'update_profile_shared_users',
      add_walled_garden: 'add_walled_garden',
      remove_walled_garden: 'remove_walled_garden',
      add_firewall_rule: 'add_firewall_rule',
      remove_firewall_rule: 'remove_firewall_rule',
      update_user_profile: 'update_user_profile',
      register_device: 'register_device',
      block_device: 'block_device',
      unblock_device: 'unblock_device',
      create_user: 'create_user',
      delete_user: 'delete_user',
      update_user_password: 'update_password',
      kick_session: 'kick_session',
      disable_user: 'disable_user',
      enable_user: 'enable_user',
    }

    const actionType = actionTypeMap[request.update_type]
    
    // Build action payload based on update type
    let actionPayload: Record<string, unknown> = { ...request.payload }

    switch (request.update_type) {
      case 'update_device_limit':
        // Expects: { profile_name: string, max_devices: number }
        actionPayload = {
          profile: request.payload.profile_name,
          shared_users: request.payload.max_devices,
        }
        break

      case 'add_walled_garden':
      case 'remove_walled_garden':
        // Expects: { domains: string[], action?: 'allow' | 'deny' }
        actionPayload = {
          domains: request.payload.domains,
          action: request.payload.action || 'allow',
        }
        break

      case 'add_firewall_rule':
      case 'remove_firewall_rule':
        // Expects: { rule_name: string, domains?: string[], action?: 'drop' | 'accept' }
        actionPayload = {
          name: request.payload.rule_name,
          domains: request.payload.domains,
          action: request.payload.action || 'drop',
        }
        break

      case 'update_user_profile':
        // Expects: { user: string, profile: string }
        actionPayload = {
          user: request.payload.user,
          profile: request.payload.profile,
        }
        break

      case 'register_device':
      case 'block_device':
      case 'unblock_device':
        // Expects: { mac: string, user?: string }
        actionPayload = {
          mac: request.payload.mac,
          user: request.payload.user,
        }
        break

      case 'create_user':
        // Expects: { user: string, password: string, profile: string }
        actionPayload = {
          user: request.payload.user,
          password: request.payload.password,
          profile: request.payload.profile,
        }
        break

      case 'delete_user':
        // Expects: { user: string }
        actionPayload = {
          user: request.payload.user,
        }
        break

      case 'update_user_password':
        // Expects: { user: string, password: string }
        actionPayload = {
          user: request.payload.user,
          password: request.payload.password,
        }
        break

      case 'kick_session':
        // Expects: { user: string, mac?: string }
        actionPayload = {
          user: request.payload.user,
          mac: request.payload.mac,
        }
        break

      case 'disable_user':
      case 'enable_user':
        // Expects: { user: string }
        actionPayload = {
          user: request.payload.user,
          disabled: request.update_type === 'disable_user',
        }
        break
    }

    // Create pending action
    const { data: action, error: actionError } = await supabase
      .from('acoes_pendentes')
      .insert({
        hotspot_id: request.hotspot_id,
        tipo: actionType,
        payload: actionPayload,
        status: 'pendente',
      })
      .select()
      .single()

    if (actionError) {
      console.error('[config-update] Failed to create action:', actionError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to queue action' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[config-update] Action created: ${action.id} (${actionType})`)

    return new Response(
      JSON.stringify({
        success: true,
        action_id: action.id,
        action_type: actionType,
        message: `Ação '${request.update_type}' enfileirada com sucesso. Será executada na próxima sincronização do hotspot.`,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[config-update] Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
