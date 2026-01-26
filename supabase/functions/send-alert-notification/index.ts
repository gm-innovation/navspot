import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertNotificationPayload {
  alerta_id: string;
  tipo: string;
  severidade: string;
  mensagem: string;
  empresa_id?: string;
  embarcacao_id?: string;
  hotspot_id?: string;
  tripulante_id?: string;
  created_at: string;
}

interface NotificationSettings {
  id: string;
  empresa_id: string;
  email_enabled: boolean;
  email_destinatarios: string[];
  whatsapp_enabled: boolean;
  whatsapp_numeros: string[];
  webhook_enabled: boolean;
  webhook_url: string | null;
  notificar_severidades: string[];
}

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

    const payload: AlertNotificationPayload = await req.json();
    console.log('Received alert notification request:', payload);

    // Get notification settings for the empresa
    if (!payload.empresa_id) {
      console.log('No empresa_id in alert, skipping notification');
      return new Response(
        JSON.stringify({ success: true, message: 'No empresa_id, notification skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('empresa_id', payload.empresa_id)
      .single();

    if (settingsError || !settings) {
      console.log('No notification settings found for empresa:', payload.empresa_id);
      return new Response(
        JSON.stringify({ success: true, message: 'No settings configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notificationSettings = settings as NotificationSettings;
    console.log('Found notification settings:', notificationSettings.id);

    // Check if this severity should be notified
    if (!notificationSettings.notificar_severidades.includes(payload.severidade)) {
      console.log('Severity not in notification list:', payload.severidade);
      return new Response(
        JSON.stringify({ success: true, message: 'Severity not configured for notification' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      webhook: { sent: false, error: null as string | null },
      email: { sent: false, error: null as string | null },
      whatsapp: { sent: false, error: null as string | null },
    };

    // Send Webhook notification
    if (notificationSettings.webhook_enabled && notificationSettings.webhook_url) {
      console.log('Sending webhook notification to:', notificationSettings.webhook_url);
      try {
        const webhookPayload = {
          type: 'navspot_alert',
          alerta: payload,
          timestamp: new Date().toISOString(),
        };

        const webhookResponse = await fetch(notificationSettings.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        if (webhookResponse.ok) {
          results.webhook.sent = true;
          console.log('Webhook sent successfully');
        } else {
          results.webhook.error = `HTTP ${webhookResponse.status}`;
          console.error('Webhook failed:', results.webhook.error);
        }
      } catch (webhookError) {
        results.webhook.error = String(webhookError);
        console.error('Webhook exception:', webhookError);
      }
    }

    // Email notification - requires RESEND_API_KEY
    if (notificationSettings.email_enabled && notificationSettings.email_destinatarios.length > 0) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        console.log('Sending email notification to:', notificationSettings.email_destinatarios);
        try {
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'NAVSPOT <alertas@navspot.com.br>',
              to: notificationSettings.email_destinatarios,
              subject: `[${payload.severidade.toUpperCase()}] ${payload.tipo} - NAVSPOT`,
              html: `
                <h2>Alerta NAVSPOT</h2>
                <p><strong>Tipo:</strong> ${payload.tipo}</p>
                <p><strong>Severidade:</strong> ${payload.severidade}</p>
                <p><strong>Mensagem:</strong> ${payload.mensagem}</p>
                <p><strong>Data:</strong> ${new Date(payload.created_at).toLocaleString('pt-BR')}</p>
                <hr>
                <p style="color: #666; font-size: 12px;">Este é um alerta automático do sistema NAVSPOT.</p>
              `,
            }),
          });

          if (emailResponse.ok) {
            results.email.sent = true;
            console.log('Email sent successfully');
          } else {
            const errorBody = await emailResponse.text();
            results.email.error = `HTTP ${emailResponse.status}: ${errorBody}`;
            console.error('Email failed:', results.email.error);
          }
        } catch (emailError) {
          results.email.error = String(emailError);
          console.error('Email exception:', emailError);
        }
      } else {
        results.email.error = 'RESEND_API_KEY not configured';
        console.log('Email skipped: RESEND_API_KEY not configured');
      }
    }

    // WhatsApp notification - requires external integration
    if (notificationSettings.whatsapp_enabled && notificationSettings.whatsapp_numeros.length > 0) {
      results.whatsapp.error = 'WhatsApp integration not configured';
      console.log('WhatsApp skipped: Integration not configured');
    }

    console.log('Notification results:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-alert-notification:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
