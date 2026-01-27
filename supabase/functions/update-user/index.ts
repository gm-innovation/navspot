import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateUserRequest {
  user_id: string;
  role: 'super_admin' | 'empresa_admin' | 'gerente_embarcacao';
  empresa_id?: string | null;
  embarcacao_id?: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: UpdateUserRequest = await req.json();
    const { user_id, role, empresa_id, embarcacao_id } = body;

    if (!user_id || !role) {
      return new Response(
        JSON.stringify({ error: 'user_id and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role value
    const validRoles = ['super_admin', 'empresa_admin', 'gerente_embarcacao'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Create client with user's token to validate permissions
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate the user's JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('Claims error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requesterId = claimsData.claims.sub;

    // Prevent self-editing (privilege escalation prevention)
    if (requesterId === user_id) {
      return new Response(
        JSON.stringify({ error: 'Você não pode editar seu próprio perfil' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requester's role
    const { data: requesterRole, error: requesterRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, empresa_id')
      .eq('user_id', requesterId)
      .single();

    if (requesterRoleError || !requesterRole) {
      console.error('Requester role error:', requesterRoleError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No role assigned' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get target user's current role
    const { data: targetUserRole, error: targetRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, empresa_id')
      .eq('user_id', user_id)
      .single();

    if (targetRoleError || !targetUserRole) {
      console.error('Target user role error:', targetRoleError);
      return new Response(
        JSON.stringify({ error: 'Usuário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Permission checks based on requester's role
    if (requesterRole.role === 'super_admin') {
      // Super admin can edit anyone (except themselves, already checked above)
    } else if (requesterRole.role === 'empresa_admin') {
      // Empresa admin can only edit gerente_embarcacao from their own empresa
      if (targetUserRole.role !== 'gerente_embarcacao') {
        return new Response(
          JSON.stringify({ error: 'Você só pode editar gerentes de embarcação' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (targetUserRole.empresa_id !== requesterRole.empresa_id) {
        return new Response(
          JSON.stringify({ error: 'Você só pode editar usuários da sua empresa' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Empresa admin cannot promote to anything other than gerente_embarcacao
      if (role !== 'gerente_embarcacao') {
        return new Response(
          JSON.stringify({ error: 'Você não pode promover usuários' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Empresa admin cannot change the empresa_id to another empresa
      if (empresa_id && empresa_id !== requesterRole.empresa_id) {
        return new Response(
          JSON.stringify({ error: 'Você só pode atribuir usuários à sua empresa' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Gerente cannot edit anyone
      return new Response(
        JSON.stringify({ error: 'Você não tem permissão para editar usuários' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role-specific requirements
    if (role === 'empresa_admin' && !empresa_id) {
      return new Response(
        JSON.stringify({ error: 'empresa_id é obrigatório para Admin Empresa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (role === 'gerente_embarcacao' && (!empresa_id || !embarcacao_id)) {
      return new Response(
        JSON.stringify({ error: 'empresa_id e embarcacao_id são obrigatórios para Gerente Embarcação' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      role,
      empresa_id: role === 'super_admin' ? null : (empresa_id || null),
      embarcacao_id: role === 'gerente_embarcacao' ? (embarcacao_id || null) : null,
    };

    // Update user_roles
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update(updateData)
      .eq('user_id', user_id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log(`User ${user_id} updated by ${requesterId}:`, updateData);

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário atualizado com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-user:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
