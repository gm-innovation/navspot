const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VERSION = "7.8.27";
const DEPLOYED_AT = new Date().toISOString();

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Navspot-Version": VERSION },
  });
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function applyPlaceholders(tpl: string, vars: Record<string, string>): string {
  let r = tpl;
  for (const [k, v] of Object.entries(vars)) r = r.replaceAll(k, v);
  return r;
}

function buildMigrationCommands(ports: string[]): string {
  const lines: string[] = [];
  for (const p of [...ports].sort((a, b) => b.localeCompare(a))) {
    lines.push(":do { /interface bridge port remove [find interface=" + p + "] } on-error={}");
    lines.push(":do { /interface bridge port add bridge=bridge1 interface=" + p + " comment=\"navspot-lan\" } on-error={}");
    lines.push(":log info \"NAVSPOT: " + p + " migrada\"");
    lines.push(":delay 500ms");
    lines.push("");
  }
  return lines.join("\n");
}

function buildWanConfig(t: string, w: string): string {
  if (t === "dhcp") return ":do { /ip dhcp-client remove [find interface=" + w + "] } on-error={}\n/ip dhcp-client add interface=" + w + " disabled=no comment=\"navspot-wan\"\n:log info \"NAVSPOT: DHCP client em " + w + "\"";
  return ":log info \"NAVSPOT: WAN " + w + " configurada como " + t + " (manual)\"";
}

function deriveVars(h: Record<string, unknown>, e: Record<string, unknown>, url: string): Record<string, string> {
  const rede = h.rede as string;
  const nb = rede.split("/")[0].replace(/\.\d+$/, "");
  const w = (h.wan_interface as string) || "ether1";
  const wt = (h.wan_type as string) || "dhcp";
  const sm = (h.sync_interval_minutes as number) || 5;
  const rosRaw = (h.ros_version as string) || "7";
  const ros = rosRaw === "auto" ? "7" : rosRaw;
  const lp = ["ether3", "ether4", "ether5"].filter((p) => p !== w);
  return {
    "{{VERSION}}": VERSION, "{{DEPLOYED_AT}}": DEPLOYED_AT,
    "{{WAN_INTERFACE}}": w, "{{WAN_CONFIG}}": buildWanConfig(wt, w), "{{WAN_TYPE}}": wt,
    "{{NETWORK_BASE}}": nb, "{{NETWORK_CIDR}}": rede.includes("/") ? rede : rede + "/24",
    "{{GATEWAY}}": nb + ".1", "{{POOL_START}}": nb + ".10", "{{POOL_END}}": nb + ".254",
    "{{EMBARCACAO_NOME}}": e.nome as string, "{{MIGRATION_COMMANDS}}": buildMigrationCommands(lp),
    "{{SCRIPTS_URL}}": url + "/functions/v1/mt-gen?mode=serve",
    "{{SYNC_TOKEN}}": h.sync_token as string, "{{SUPABASE_HOST}}": new URL(url).hostname,
    "{{SYNC_URL}}": url + "/functions/v1/mikrotik-sync",
    "{{RECOVERY_URL}}": url + "/functions/v1/mikrotik-recovery-download",
    "{{API_BASE}}": url + "/functions/v1",
    "{{SYNC_INTERVAL}}": String(sm), "{{ROS_VERSION}}": ros,
    "{{FETCH_DELAY}}": ros === "7" ? "500" : "2500",
    "{{WRITE_DELAY}}": ros === "7" ? "300" : "1500",
    "{{MAX_RETRIES}}": ros === "7" ? "1" : "3",
  };
}

async function sbRest(url: string, path: string, sk: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(url + "/rest/v1/" + path + (qs ? "?" + qs : ""), {
    headers: { apikey: sk, Authorization: "Bearer " + sk, Accept: "application/vnd.pgrst.object+json" },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function fetchTemplate(url: string, sk: string, id: string): Promise<string> {
  const tpl = await sbRest(url, "script_templates", sk, { id: "eq." + id, select: "content" });
  if (!tpl?.content) throw new Error("Template not found: " + id);
  return tpl.content;
}

async function renderTemplate(url: string, sk: string, id: string, vars: Record<string, string>): Promise<string> {
  const content = await fetchTemplate(url, sk, id);
  return normalizeNewlines(applyPlaceholders(content, vars));
}

async function storageUpload(url: string, sk: string, bucket: string, path: string, data: Uint8Array) {
  const r = await fetch(url + "/storage/v1/object/" + bucket + "/" + path, {
    method: "PUT",
    headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "text/plain; charset=utf-8", "x-upsert": "true" },
    body: data,
  });
  if (!r.ok) throw new Error("Upload failed: " + path);
}

async function storageSign(url: string, sk: string, bucket: string, path: string): Promise<string> {
  const r = await fetch(url + "/storage/v1/object/sign/" + bucket + "/" + path, {
    method: "POST",
    headers: { apikey: sk, Authorization: "Bearer " + sk, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 900 }),
  });
  if (!r.ok) throw new Error("Sign failed: " + path);
  const d = await r.json();
  return url + "/storage/v1" + d.signedURL;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const u = new URL(req.url);
    const mode = u.searchParams.get("mode");
    const SU = Deno.env.get("SUPABASE_URL")!;
    const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AK = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (req.method === "GET" && mode === "health") {
      return json({ version: VERSION, status: "ok", deployed_at: DEPLOYED_AT, function: "mt-gen" });
    }

    if (req.method === "GET" && mode === "serve") {
      const st = u.searchParams.get("type") || "all";
      const tk = u.searchParams.get("token");
      if (!tk) return new Response("# Error: token required", { status: 400, headers: corsHeaders });
      const h = await sbRest(SU, "hotspots", SK, {
        select: "id,nome,sync_token,sync_interval_minutes,ros_version,wan_interface,wan_type,rede,embarcacoes!inner(id,nome,empresa_id)",
        sync_token: "eq." + tk,
      });
      if (!h) return new Response("# Error: Invalid token", { status: 404, headers: corsHeaders });
      const vars = deriveVars(h, h.embarcacoes, SU);
      const tm: Record<string, string> = {
        infra: "infra", bootstrap: "bootstrap", "sync-raw": "sync", "guardian-raw": "guardian",
        "sync-standalone": "sync-standalone", "guardian-standalone": "guardian-standalone",
      };
      const tplId = tm[st] || "installer";
      const script = await renderTemplate(SU, SK, tplId, vars);
      return new Response(script, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Navspot-Version": VERSION },
      });
    }

    // POST: generate + upload + sign
    const ah = req.headers.get("Authorization");
    if (!ah || !ah.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
    const ur = await fetch(SU + "/auth/v1/user", { headers: { apikey: AK, Authorization: ah } });
    if (!ur.ok) return json({ success: false, error: "Invalid token" }, 401);
    const body = await req.json();
    const hotspot_id = body.hotspot_id;
    if (!hotspot_id) return json({ success: false, error: "hotspot_id required" }, 400);

    const h = await sbRest(SU, "hotspots", SK, {
      select: "id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)",
      id: "eq." + hotspot_id,
    });
    if (!h) return json({ success: false, error: "Hotspot not found" }, 404);
    if (!h.sync_token) return json({ success: false, error: "sync_token ausente" }, 400);

    const vars = deriveVars(h, h.embarcacoes, SU);
    const scripts = await Promise.all([
      renderTemplate(SU, SK, "infra", vars),
      renderTemplate(SU, SK, "sync-standalone", vars),
      renderTemplate(SU, SK, "guardian-standalone", vars),
      renderTemplate(SU, SK, "bootstrap", vars),
    ]);

    const sp = hotspot_id + "/" + VERSION;
    const enc = (s: string) => new TextEncoder().encode(s);
    const names = ["infra.rsc", "sync.rsc", "guardian.rsc", "bootstrap.rsc"];
    await Promise.all(names.map((n, i) => storageUpload(SU, SK, "hotspot-scripts", sp + "/" + n, enc(scripts[i]))));
    const urls = await Promise.all(names.map((n) => storageSign(SU, SK, "hotspot-scripts", sp + "/" + n)));

    await fetch(SU + "/rest/v1/hotspots?id=eq." + hotspot_id, {
      method: "PATCH",
      headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        scripts_version: VERSION,
        scripts_generated_at: new Date().toISOString(),
        scripts_storage_path: sp,
        script_gerado: scripts[3],
        script_versao: ((h.script_versao as number) || 0) + 1,
      }),
    });

    return json({ success: true, version: VERSION, infra_url: urls[0], sync_url: urls[1], guardian_url: urls[2], bootstrap_url: urls[3], expires_in_seconds: 900, storage_path: sp });
  } catch (e) {
    console.error("[mt-gen]", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
