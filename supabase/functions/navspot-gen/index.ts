const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const V = "7.9.1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode");
  const SU = Deno.env.get("SUPABASE_URL")!;
  const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const AK = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (mode === "health") {
    return Response.json({ version: V, status: "ok", function: "navspot-gen" }, { headers: H });
  }

  try {
    const rest = async (table: string, params: Record<string, string>) => {
      const r = await fetch(SU + "/rest/v1/" + table + "?" + new URLSearchParams(params).toString(), {
        headers: { apikey: SK, Authorization: "Bearer " + SK, Accept: "application/vnd.pgrst.object+json" },
      });
      return r.ok ? r.json() : null;
    };

    const render = async (tplId: string, v: Record<string, string>) => {
      const tpl = await rest("script_templates", { id: "eq." + tplId, select: "content" });
      if (!tpl?.content) throw new Error("Template not found: " + tplId);
      let c: string = tpl.content;
      for (const [k, val] of Object.entries(v)) c = c.replaceAll(k, val);
      return c.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    };

    const mkVars = (h: any, e: any): Record<string, string> => {
      const nb = (h.rede as string).split("/")[0].replace(/\.\d+$/, "");
      const w = h.wan_interface || "ether1";
      const ros = (!h.ros_version || h.ros_version === "auto") ? "7" : h.ros_version;
      return {
        "{{VERSION}}": V,
        "{{DEPLOYED_AT}}": new Date().toISOString(),
        "{{WAN_INTERFACE}}": w,
        "{{WAN_TYPE}}": h.wan_type || "dhcp",
        "{{WAN_CONFIG}}": (h.wan_type || "dhcp") === "dhcp" ? "/ip dhcp-client add interface=" + w + " disabled=no" : "",
        "{{NETWORK_BASE}}": nb,
        "{{NETWORK_CIDR}}": (h.rede as string).includes("/") ? h.rede : h.rede + "/24",
        "{{GATEWAY}}": nb + ".1",
        "{{POOL_START}}": nb + ".10",
        "{{POOL_END}}": nb + ".254",
        "{{EMBARCACAO_NOME}}": e.nome,
        "{{MIGRATION_COMMANDS}}": "",
        "{{SCRIPTS_URL}}": SU + "/functions/v1/navspot-gen?mode=serve",
        "{{SYNC_TOKEN}}": h.sync_token,
        "{{SUPABASE_HOST}}": new URL(SU).hostname,
        "{{SYNC_URL}}": SU + "/functions/v1/mikrotik-sync",
        "{{RECOVERY_URL}}": SU + "/functions/v1/navspot-recovery",
        "{{API_BASE}}": SU + "/functions/v1",
        "{{SYNC_INTERVAL}}": String(h.sync_interval_minutes || 5),
        "{{ROS_VERSION}}": ros,
        "{{FETCH_DELAY}}": ros === "7" ? "500" : "2500",
        "{{WRITE_DELAY}}": ros === "7" ? "300" : "1500",
        "{{MAX_RETRIES}}": ros === "7" ? "1" : "3",
      };
    };

    // GET mode=serve
    if (req.method === "GET" && mode === "serve") {
      const tk = u.searchParams.get("token");
      if (!tk) return new Response("# Error: token required", { status: 400, headers: H });
      const h = await rest("hotspots", {
        select: "id,nome,sync_token,sync_interval_minutes,ros_version,wan_interface,wan_type,rede,embarcacoes!inner(id,nome,empresa_id)",
        sync_token: "eq." + tk,
      });
      if (!h) return new Response("# Error: Invalid token", { status: 404, headers: H });
      const v = mkVars(h, h.embarcacoes);
      const types: Record<string, string> = { infra: "infra", bootstrap: "bootstrap", "sync-raw": "sync", "guardian-raw": "guardian", "sync-standalone": "sync-standalone", "guardian-standalone": "guardian-standalone" };
      const tplId = types[u.searchParams.get("type") || ""] || "installer";
      const script = await render(tplId, v);
      return new Response(script, { headers: { ...H, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }

    // POST: generate + upload + sign
    if (req.method === "POST") {
      const ah = req.headers.get("Authorization");
      if (!ah || !ah.startsWith("Bearer ")) return Response.json({ success: false, error: "Unauthorized" }, { status: 401, headers: H });
      const ur = await fetch(SU + "/auth/v1/user", { headers: { apikey: AK, Authorization: ah } });
      if (!ur.ok) return Response.json({ success: false, error: "Invalid token" }, { status: 401, headers: H });
      const body = await req.json();
      const hid = body.hotspot_id;
      if (!hid) return Response.json({ success: false, error: "hotspot_id required" }, { status: 400, headers: H });

      const h = await rest("hotspots", {
        select: "id,nome,interface_wifi,wan_interface,wan_type,rede,sync_token,sync_interval_minutes,max_usuarios,ros_version,script_versao,embarcacoes!inner(id,nome,empresa_id)",
        id: "eq." + hid,
      });
      if (!h) return Response.json({ success: false, error: "Hotspot not found" }, { status: 404, headers: H });
      if (!h.sync_token) return Response.json({ success: false, error: "sync_token ausente" }, { status: 400, headers: H });

      const v = mkVars(h, h.embarcacoes);
      const s0 = await render("infra", v);
      const s1 = await render("sync-standalone", v);
      const s2 = await render("guardian-standalone", v);
      const s3 = await render("bootstrap", v);
      const sp = hid + "/" + V;
      const enc = new TextEncoder();
      const fnames = ["infra.rsc", "sync.rsc", "guardian.rsc", "bootstrap.rsc"];
      const scripts = [s0, s1, s2, s3];

      for (let i = 0; i < 4; i++) {
        const r = await fetch(SU + "/storage/v1/object/hotspot-scripts/" + sp + "/" + fnames[i], {
          method: "PUT", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "text/plain; charset=utf-8", "x-upsert": "true" }, body: enc.encode(scripts[i]),
        });
        if (!r.ok) throw new Error("Upload failed: " + fnames[i]);
      }

      const urls: string[] = [];
      for (const n of fnames) {
        const r = await fetch(SU + "/storage/v1/object/sign/hotspot-scripts/" + sp + "/" + n, {
          method: "POST", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 900 }),
        });
        if (!r.ok) throw new Error("Sign failed: " + n);
        const d = await r.json();
        urls.push(SU + "/storage/v1" + d.signedURL);
      }

      await fetch(SU + "/rest/v1/hotspots?id=eq." + hid, {
        method: "PATCH", headers: { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ scripts_version: V, scripts_generated_at: new Date().toISOString(), scripts_storage_path: sp, script_gerado: s3, script_versao: ((h.script_versao as number) || 0) + 1 }),
      });

      return Response.json({ success: true, version: V, infra_url: urls[0], sync_url: urls[1], guardian_url: urls[2], bootstrap_url: urls[3], expires_in_seconds: 900, storage_path: sp }, { headers: H });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: H });
  } catch (e) {
    console.error("[navspot-gen]", e);
    return Response.json({ success: false, error: e instanceof Error ? e.message : "Internal error" }, { status: 500, headers: H });
  }
});
