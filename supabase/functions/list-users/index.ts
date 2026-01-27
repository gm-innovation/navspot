import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get requester's role
    const { data: requesterRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, empresa_id')
      .eq('user_id', requesterId)
      .single();

    if (roleError || !requesterRole) {
      console.error('Role error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No role assigned' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only super_admin and empresa_admin can list users
    if (!['super_admin', 'empresa_admin'].includes(requesterRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.error('Auth users error:', authError);
      throw authError;
    }

    // Get all user_roles with empresa and embarcacao names
    let rolesQuery = supabaseAdmin
      .from('user_roles')
      .select(`
        user_id,
        role,
        empresa_id,
        embarcacao_id,
        created_at,
        empresas:empresa_id(nome),
        embarcacoes:embarcacao_id(nome)
      `);

    // Filter by empresa if requester is empresa_admin
    if (requesterRole.role === 'empresa_admin') {
      rolesQuery = rolesQuery.eq('empresa_id', requesterRole.empresa_id);
    }

    const { data: userRoles, error: rolesError } = await rolesQuery;
    if (rolesError) {
      console.error('Roles error:', rolesError);
      throw rolesError;
    }

    // Merge auth users with roles
    const usersWithRoles = (userRoles || []).map((role: any) => {
      const authUser = authUsers.users.find(u => u.id === role.user_id);
      return {
        id: role.user_id,
        email: authUser?.email || 'Email não disponível',
        created_at: role.created_at,
        role: role.role,
        empresa_id: role.empresa_id,
        embarcacao_id: role.embarcacao_id,
        empresa_nome: role.empresas?.nome || null,
        embarcacao_nome: role.embarcacoes?.nome || null,
      };
    });

    console.log(`Returning ${usersWithRoles.length} users for requester ${requesterId}`);

    return new Response(
      JSON.stringify({ users: usersWithRoles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in list-users:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
