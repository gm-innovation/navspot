// Public signed endpoint exposing the project's public-schema for TriDev integration.
// Auth: HMAC-SHA256(secret, ts + "/expose-context") in `x-signature` header (hex).
// Anti-replay: rejects ts older than 300s from server clock.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const secret = Deno.env.get("TRIDEV_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[expose-context] TRIDEV_WEBHOOK_SECRET not configured");
    return json(500, { error: "Server misconfigured" });
  }

  const url = new URL(req.url);
  const ts = url.searchParams.get("ts");
  const sig = req.headers.get("x-signature") ?? "";

  if (!ts || !/^\d+$/.test(ts)) {
    return new Response("Missing ts", { status: 401, headers: corsHeaders });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(ts)) > 300) {
    return new Response("Stale", { status: 401, headers: corsHeaders });
  }

  const expected = await hmacSha256Hex(secret, ts + "/expose-context");
  if (!safeEqualHex(sig, expected)) {
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  // Query information_schema via PostgREST RPC fallback: use direct REST with service role.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Use PostgREST's information_schema views are not exposed by default.
    // Instead, query our known public tables via pg_catalog through a SQL function?
    // No execute_sql allowed. We list tables/columns via PostgREST introspection:
    // PostgREST exposes /  (root) with an OpenAPI spec describing public tables.
    const specRes = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/openapi+json",
      },
    });
    if (!specRes.ok) {
      const text = await specRes.text();
      console.error("[expose-context] OpenAPI fetch failed:", specRes.status, text);
      return json(502, { error: "Failed to introspect schema" });
    }
    const spec = await specRes.json() as {
      definitions?: Record<string, {
        properties?: Record<string, {
          type?: string;
          format?: string;
          description?: string;
        }>;
        required?: string[];
      }>;
    };

    const definitions = spec.definitions ?? {};
    const tables = Object.entries(definitions).map(([name, def]) => {
      const required = new Set(def.required ?? []);
      const columns = Object.entries(def.properties ?? {}).map(([colName, col]) => ({
        name: colName,
        type: col.format || col.type || "unknown",
        nullable: !required.has(colName),
        description: col.description,
      }));
      return { name, columns };
    });

    return json(200, {
      generated_at: new Date().toISOString(),
      database_schema: { tables },
    });
  } catch (err) {
    console.error("[expose-context] error:", err);
    return json(500, { error: "Internal error" });
  }
});
