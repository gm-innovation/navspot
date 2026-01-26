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
  aceite_termos?: boolean;
  aceite_privacidade?: boolean;
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
    const { login, senha, nome, email, cpf, cargo, aceite_termos, aceite_privacidade } = body;

    // Capturar IP e User Agent para conformidade LGPD
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

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

    // Validate consent (LGPD requirement)
    if (!aceite_termos || !aceite_privacidade) {
      console.log("Consent not provided:", { aceite_termos, aceite_privacidade });
      return new Response(
        JSON.stringify({ error: "É obrigatório aceitar os Termos de Uso e a Política de Privacidade" }),
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

    // Register consent records (LGPD Art. 8)
    const consentRecords = [
      {
        tripulante_id: tripulante.id,
        tipo: "termos_uso",
        versao: "v1.0",
        aceito: true,
        aceito_em: new Date().toISOString(),
        ip_address: clientIP,
        user_agent: userAgent,
      },
      {
        tripulante_id: tripulante.id,
        tipo: "politica_privacidade",
        versao: "v1.0",
        aceito: true,
        aceito_em: new Date().toISOString(),
        ip_address: clientIP,
        user_agent: userAgent,
      },
    ];

    const { error: consentError } = await supabase
      .from("consentimentos")
      .insert(consentRecords);

    if (consentError) {
      console.error("Error registering consent:", consentError);
      // Continue anyway - consent registration failure shouldn't block registration
    }

    // Register audit log (Marco Civil)
    const { error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        tripulante_id: tripulante.id,
        acao: "create",
        tabela: "tripulantes",
        registro_id: tripulante.id,
        dados_novos: {
          nome: nome.trim(),
          email: email?.trim() || null,
          cpf: cpf?.trim() ? "***" : null, // Don't log full CPF
          cargo: cargo?.trim() || null,
          aceite_termos: true,
          aceite_privacidade: true,
        },
        ip_address: clientIP,
        user_agent: userAgent,
      });

    if (auditError) {
      console.error("Error registering audit log:", auditError);
      // Continue anyway - audit failure shouldn't block registration
    }

    console.log("Tripulante self-registration completed:", tripulante.id);
    console.log("Consent registered for:", tripulante.id, "IP:", clientIP);

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
