// Transparent proxy → navspot-script-gen (backward compat for legacy routers)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const newUrl = req.url.replace('mikrotik-script-generator', 'navspot-script-gen')
  const forwarded = await fetch(newUrl, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  })
  return new Response(forwarded.body, {
    status: forwarded.status,
    headers: forwarded.headers,
  })
})
