import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SelfRegisterRequest {
  login: string;
  senha: string;
  nome: string;
  email?: string;
  cpf?: string;
  cargo?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SelfRegisterRequest = await req.json();
    const { login, senha, nome, email, cpf, cargo } = body;

    // Validate required fields
    if (!login || !senha || !nome) {
      console.log("Missing required fields:", { login: !!login, senha: !!senha, nome: !!nome });
      return new Response(
        JSON.stringify({ error: "Login, senha e nome são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate nome length
    if (nome.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Nome deve ter pelo menos 3 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find tripulante by login_wifi
    const { data: tripulante, error: findError } = await supabase
      .from("tripulantes")
      .select("id, login_wifi, senha_wifi, status, nome")
      .eq("login_wifi", login.trim())
      .maybeSingle();

    if (findError) {
      console.error("Error finding tripulante:", findError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar tripulante" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tripulante) {
      console.log("Tripulante not found for login:", login);
      return new Response(
        JSON.stringify({ error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password
    if (tripulante.senha_wifi !== senha) {
      console.log("Invalid password for tripulante:", tripulante.id);
      return new Response(
        JSON.stringify({ error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already completed registration
    if (tripulante.status !== "pendente_cadastro") {
      console.log("Tripulante already completed registration:", tripulante.id, tripulante.status);
      return new Response(
        JSON.stringify({ 
          error: "Cadastro já foi completado anteriormente",
          already_registered: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update tripulante with personal data
    const { error: updateError } = await supabase
      .from("tripulantes")
      .update({
        nome: nome.trim(),
        email: email?.trim() || null,
        cpf: cpf?.trim() || null,
        cargo: cargo?.trim() || null,
        status: "ativo",
        ultimo_login: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tripulante.id);

    if (updateError) {
      console.error("Error updating tripulante:", updateError);
      return new Response(
        JSON.stringify({ error: "Erro ao atualizar dados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Tripulante self-registration completed:", tripulante.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Cadastro completado com sucesso! Seu acesso WiFi está liberado."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
