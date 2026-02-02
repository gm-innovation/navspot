import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=300", // 5 min cache
};

interface PortalConfig {
  hotspot_name: string;
  embarcacao_nome: string;
  empresa_nome: string;
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  cor_fundo: string;
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

    // Parse query params
    const url = new URL(req.url);
    const hotspotId = url.searchParams.get("h");

    if (!hotspotId) {
      console.log("[portal-config] Missing hotspot_id parameter");
      return new Response(
        JSON.stringify({ error: "Parâmetro h (hotspot_id) é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(hotspotId)) {
      console.log("[portal-config] Invalid hotspot_id format:", hotspotId);
      return new Response(
        JSON.stringify({ error: "Formato de hotspot_id inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[portal-config] Fetching config for hotspot: ${hotspotId.slice(0, 8)}...`);

    // Fetch hotspot -> embarcacao -> empresa
    const { data: hotspot, error: hotspotError } = await supabase
      .from("hotspots")
      .select(`
        id, nome,
        embarcacoes!inner(
          id, nome, empresa_id,
          empresas!inner(
            id, nome, logo_url, cor_primaria, cor_secundaria, cor_fundo
          )
        )
      `)
      .eq("id", hotspotId)
      .single();

    if (hotspotError || !hotspot) {
      console.error("[portal-config] Hotspot not found:", hotspotError?.message);
      return new Response(
        JSON.stringify({ error: "Hotspot não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const embarcacao = hotspot.embarcacoes as any;
    const empresa = embarcacao.empresas as any;

    const config: PortalConfig = {
      hotspot_name: hotspot.nome,
      embarcacao_nome: embarcacao.nome,
      empresa_nome: empresa.nome,
      logo_url: empresa.logo_url || null,
      cor_primaria: empresa.cor_primaria || "#1E3A8A",
      cor_secundaria: empresa.cor_secundaria || "#38BDF8",
      cor_fundo: empresa.cor_fundo || "#F8FAFC",
    };

    console.log(`[portal-config] Returning config for: ${config.embarcacao_nome} (${config.empresa_nome})`);

    return new Response(
      JSON.stringify(config),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[portal-config] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
