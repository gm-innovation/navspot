import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function applyPlaceholders(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value)
  }
  if (result.includes('{{')) {
    const remaining = result.match(/\{\{[A-Z_]+\}\}/g) || []
    throw new Error('Unreplaced placeholders: ' + remaining.join(', '))
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  try {
    // Validate service_role authorization
    const authHeader = req.headers.get('Authorization')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!authHeader || authHeader !== 'Bearer ' + serviceKey) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const body = await req.json()
    const templateId = body.template_id as string
    const vars = body.vars as Record<string, string>

    if (!templateId || !vars) {
      return new Response('Missing template_id or vars', { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: tpl, error } = await supabase
      .from('script_templates')
      .select('content')
      .eq('id', templateId)
      .single()

    if (error || !tpl) {
      return new Response('Template not found: ' + templateId, { status: 404, headers: corsHeaders })
    }

    const script = normalizeNewlines(applyPlaceholders(tpl.content, vars))

    return new Response(script, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[render-template] Error:', msg)
    return new Response(msg, { status: 500, headers: corsHeaders })
  }
})
