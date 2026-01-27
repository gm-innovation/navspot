import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[auto-resolve-alerts] Starting auto-resolve check...');

    // Fetch all notification settings with auto_resolver enabled
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('empresa_id, auto_resolver_horas')
      .eq('auto_resolver_enabled', true);

    if (settingsError) {
      console.error('[auto-resolve-alerts] Error fetching settings:', settingsError);
      throw settingsError;
    }

    if (!settings || settings.length === 0) {
      console.log('[auto-resolve-alerts] No companies with auto-resolve enabled');
      return new Response(
        JSON.stringify({ success: true, resolved: 0, message: 'No auto-resolve settings found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-resolve-alerts] Found ${settings.length} companies with auto-resolve enabled`);

    let totalResolved = 0;
    const results: { empresa_id: string; resolved: number; hours: number }[] = [];

    for (const setting of settings) {
      if (!setting.empresa_id || !setting.auto_resolver_horas) {
        continue;
      }

      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - setting.auto_resolver_horas);

      console.log(`[auto-resolve-alerts] Processing empresa ${setting.empresa_id}, cutoff: ${cutoffTime.toISOString()}`);

      // Resolve old unresolved alerts for this empresa
      const { data: updated, error: updateError } = await supabase
        .from('alertas')
        .update({ 
          resolvido: true, 
          resolvido_at: new Date().toISOString() 
        })
        .eq('empresa_id', setting.empresa_id)
        .eq('resolvido', false)
        .lt('created_at', cutoffTime.toISOString())
        .select('id');

      if (updateError) {
        console.error(`[auto-resolve-alerts] Error updating alerts for empresa ${setting.empresa_id}:`, updateError);
        continue;
      }

      const count = updated?.length || 0;
      totalResolved += count;
      
      results.push({
        empresa_id: setting.empresa_id,
        resolved: count,
        hours: setting.auto_resolver_horas
      });

      if (count > 0) {
        console.log(`[auto-resolve-alerts] Auto-resolved ${count} alerts for empresa ${setting.empresa_id}`);
      }
    }

    console.log(`[auto-resolve-alerts] Completed. Total resolved: ${totalResolved}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        resolved: totalResolved,
        details: results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[auto-resolve-alerts] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
