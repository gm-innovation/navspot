-- Tabela de configurações de notificação por empresa
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE UNIQUE,
  
  -- Canais
  email_enabled BOOLEAN DEFAULT true,
  email_destinatarios TEXT[] DEFAULT '{}',
  
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_numeros TEXT[] DEFAULT '{}',
  
  webhook_enabled BOOLEAN DEFAULT false,
  webhook_url TEXT,
  
  -- Automações
  auto_resolver_enabled BOOLEAN DEFAULT false,
  auto_resolver_horas INTEGER DEFAULT 24,
  
  agrupar_enabled BOOLEAN DEFAULT true,
  
  -- Escalação
  escalacao_enabled BOOLEAN DEFAULT false,
  escalacao_minutos INTEGER DEFAULT 30,
  escalacao_destinatarios TEXT[] DEFAULT '{}',
  
  -- Filtros
  notificar_severidades TEXT[] DEFAULT ARRAY['critical', 'warning'],
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_notification_settings_empresa ON notification_settings(empresa_id);

-- RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "Super admin full access to notification_settings"
ON public.notification_settings FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Empresa admin manage own settings
CREATE POLICY "Empresa admin manage own notification_settings"
ON public.notification_settings FOR ALL
USING (has_role(auth.uid(), 'empresa_admin'::app_role) AND empresa_id = get_user_empresa_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'empresa_admin'::app_role) AND empresa_id = get_user_empresa_id(auth.uid()));

-- Gerente pode visualizar
CREATE POLICY "Gerente can view notification_settings"
ON public.notification_settings FOR SELECT
USING (has_role(auth.uid(), 'gerente_embarcacao'::app_role) AND empresa_id = get_user_empresa_id(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();