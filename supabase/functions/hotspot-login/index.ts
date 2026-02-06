import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoginRequest {
  login: string;
  senha: string;
  hotspot_id: string;
  mac_address?: string;
  ip_address?: string;
}

interface LoginResponse {
  success: boolean;
  status?: "ativo" | "pendente_cadastro" | "bloqueado" | "inativo";
  tripulante_id?: string;
  redirect_url?: string;
  error?: string;
  rate_limited?: boolean;
  retry_after_seconds?: number;
}

// v7.1.41: HTML escape for XSS prevention in auto-post page
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// v7.1.41: Generate auto-submit POST page for secure credential submission
// This avoids exposing credentials in URL (browser history, proxy logs, referer)
function generateAutoPostHtml(
  gateway: string,
  username: string,
  password: string,
  embarcacaoNome: string
): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectando - ${escapeHtml(embarcacaoNome)}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh; 
      margin: 0;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    }
    .container { 
      text-align: center; 
      padding: 2rem;
      background: white;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e5e7eb;
      border-top: 4px solid #1e3a8a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { color: #1e3a8a; margin: 0 0 0.5rem; }
    p { color: #64748b; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Conectando...</h2>
    <p>Aguarde enquanto liberamos seu acesso</p>
  </div>
  <form id="loginForm" method="POST" action="http://${escapeHtml(gateway)}/login">
    <input type="hidden" name="username" value="${escapeHtml(username)}" />
    <input type="hidden" name="password" value="${escapeHtml(password)}" />
  </form>
  <script>
    setTimeout(function() {
      document.getElementById('loginForm').submit();
    }, 100);
  </script>
</body>
</html>`;
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 15;

// Mask token for secure logging
function maskToken(token: string): string {
  if (!token || token.length < 8) return "****";
  return token.slice(0, 4) + "..." + token.slice(-4);
}

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  mac: string
): Promise<{ allowed: boolean; remaining: number; blockedUntil?: Date }> {
  const now = new Date();
  
  // Try to get existing record
  const { data: existing } = await supabase
    .from("login_attempts")
    .select("*")
    .eq("ip", ip)
    .eq("mac", mac)
    .maybeSingle();
  
  // If blocked and not expired
  if (existing?.blocked_until) {
    const blockedUntil = new Date(existing.blocked_until);
    if (blockedUntil > now) {
      return { allowed: false, remaining: 0, blockedUntil };
    }
  }
  
  // Check if should reset (last attempt > block duration ago)
  const lastAttempt = existing?.last_attempt ? new Date(existing.last_attempt) : null;
  const shouldReset = !lastAttempt || 
    (now.getTime() - lastAttempt.getTime()) > BLOCK_DURATION_MINUTES * 60 * 1000;
  
  const attempts = shouldReset ? 1 : (existing?.attempts || 0) + 1;
  
  // Block if exceeded
  if (attempts > MAX_ATTEMPTS) {
    const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_MINUTES * 60 * 1000);
    await supabase.from("login_attempts").upsert({
      ip,
      mac,
      attempts,
      blocked_until: blockedUntil.toISOString(),
      last_attempt: now.toISOString(),
    }, { onConflict: "ip,mac" });
    return { allowed: false, remaining: 0, blockedUntil };
  }
  
  // Update counter
  await supabase.from("login_attempts").upsert({
    ip,
    mac,
    attempts,
    blocked_until: null,
    last_attempt: now.toISOString(),
  }, { onConflict: "ip,mac" });
  
  return { allowed: true, remaining: MAX_ATTEMPTS - attempts };
}

async function clearRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  mac: string
): Promise<void> {
  await supabase
    .from("login_attempts")
    .delete()
    .eq("ip", ip)
    .eq("mac", mac);
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

    const body: LoginRequest = await req.json();
    const { login, senha, hotspot_id, mac_address, ip_address } = body;

    // Capture request metadata for LGPD audit
    const clientIP = ip_address || 
      req.headers.get("x-forwarded-for")?.split(",")[0] || 
      req.headers.get("x-real-ip") || 
      "unknown";
    const clientMAC = mac_address || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    console.log(`[hotspot-login] Login attempt: ${login}, MAC: ${clientMAC}, IP: ${clientIP}`);

    // Validate required fields
    if (!login || !senha || !hotspot_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Login, senha e hotspot_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting check
    const rateCheck = await checkRateLimit(supabase, clientIP, clientMAC);
    if (!rateCheck.allowed) {
      const retryAfter = rateCheck.blockedUntil 
        ? Math.ceil((rateCheck.blockedUntil.getTime() - Date.now()) / 1000)
        : BLOCK_DURATION_MINUTES * 60;
      
      console.log(`[hotspot-login] Rate limited: ${clientIP}/${clientMAC}, retry after ${retryAfter}s`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Muitas tentativas. Aguarde alguns minutos.",
          rate_limited: true,
          retry_after_seconds: retryAfter
        } as LoginResponse),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch hotspot to get embarcacao_id
    const { data: hotspot, error: hotspotError } = await supabase
      .from("hotspots")
      .select("id, embarcacao_id, nome, rede")
      .eq("id", hotspot_id)
      .single();

    if (hotspotError || !hotspot) {
      console.error("[hotspot-login] Hotspot not found:", hotspotError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Hotspot não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find tripulante by login_wifi in this embarcacao
    const { data: tripulante, error: tripError } = await supabase
      .from("tripulantes")
      .select("id, login_wifi, senha_wifi, status, nome")
      .eq("login_wifi", login.trim())
      .eq("embarcacao_id", hotspot.embarcacao_id)
      .maybeSingle();

    if (tripError) {
      console.error("[hotspot-login] Error finding tripulante:", tripError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar usuário" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tripulante) {
      console.log(`[hotspot-login] Tripulante not found: ${login}`);
      // Register failed attempt in audit log
      await supabase.from("audit_logs").insert({
        acao: "login_failed",
        tabela: "tripulantes",
        dados_novos: { login, hotspot_id, reason: "not_found" },
        ip_address: clientIP,
        user_agent: userAgent,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password
    if (tripulante.senha_wifi !== senha) {
      console.log(`[hotspot-login] Invalid password for: ${login}`);
      // Register failed attempt in audit log
      await supabase.from("audit_logs").insert({
        tripulante_id: tripulante.id,
        acao: "login_failed",
        tabela: "tripulantes",
        registro_id: tripulante.id,
        dados_novos: { login, hotspot_id, reason: "wrong_password" },
        ip_address: clientIP,
        user_agent: userAgent,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Successful credential validation - clear rate limit
    await clearRateLimit(supabase, clientIP, clientMAC);

    // Check status
    const status = tripulante.status as "ativo" | "pendente_cadastro" | "bloqueado" | "inativo";

    if (status === "bloqueado") {
      console.log(`[hotspot-login] User is blocked: ${login}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: "bloqueado",
          error: "Seu acesso está bloqueado. Contate o administrador." 
        } as LoginResponse),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (status === "inativo") {
      console.log(`[hotspot-login] User is inactive: ${login}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: "inativo",
          error: "Seu acesso está desativado." 
        } as LoginResponse),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Register successful login attempt in audit log
    await supabase.from("audit_logs").insert({
      tripulante_id: tripulante.id,
      acao: "login_success",
      tabela: "tripulantes",
      registro_id: tripulante.id,
      dados_novos: { 
        login, 
        hotspot_id, 
        mac_address: clientMAC,
        status 
      },
      ip_address: clientIP,
      user_agent: userAgent,
    });

    // Update ultimo_login
    await supabase
      .from("tripulantes")
      .update({ ultimo_login: new Date().toISOString() })
      .eq("id", tripulante.id);

    // Build response based on status
    // Extract gateway from network (e.g., "10.10.10.0/24" -> "10.10.10.1")
    const networkBase = hotspot.rede.split("/")[0].replace(/\.\d+$/, "");
    const gateway = `${networkBase}.1`;
    
    if (status === "pendente_cadastro") {
      // Redirect to registration page with all params
      const portalUrl = Deno.env.get("SUPABASE_URL")?.includes("localhost") 
        ? "http://localhost:8080"
        : "https://navspot.lovable.app";
      
      const params = new URLSearchParams({
        login: tripulante.login_wifi,
        h: hotspot_id,
        mac: clientMAC,
        gateway: gateway,
      });
      
      const redirectUrl = `${portalUrl}/completar-cadastro?${params.toString()}`;
      
      console.log(`[hotspot-login] Pending registration, redirecting to: ${redirectUrl}`);

      const response: LoginResponse = {
        success: true,
        status,
        tripulante_id: tripulante.id,
        redirect_url: redirectUrl,
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // v7.1.41: Status is 'ativo' - return HTML auto-post page
    // This securely submits credentials via POST instead of GET (no URL exposure)
    // Security: credentials don't appear in browser history, proxy logs, or Referer header
    const embarcacaoNome = hotspot.nome || "NAVSPOT";
    const autoPostHtml = generateAutoPostHtml(
      gateway,
      tripulante.login_wifi,
      tripulante.senha_wifi,
      embarcacaoNome
    );
    
    console.log(`[hotspot-login] Active user ${tripulante.login_wifi}, returning auto-post HTML for gateway ${gateway}`);

    return new Response(autoPostHtml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });

  } catch (error) {
    console.error("[hotspot-login] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
