-- =============================================
-- CONFORMIDADE LGPD E MARCO CIVIL DA INTERNET
-- =============================================

-- 1. Tabela de Consentimentos (LGPD Art. 8)
CREATE TABLE public.consentimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tripulante_id UUID REFERENCES tripulantes(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL, -- 'termos_uso', 'politica_privacidade', 'marketing'
  versao TEXT NOT NULL, -- 'v1.0', 'v1.1'
  aceito BOOLEAN NOT NULL,
  aceito_em TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_consentimentos_tripulante ON consentimentos(tripulante_id);
CREATE INDEX idx_consentimentos_tipo ON consentimentos(tipo, versao);

-- 2. Tabela de Auditoria (Marco Civil Art. 13)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- auth.users.id (admin/gerente) ou NULL para sistema
  tripulante_id UUID REFERENCES tripulantes(id) ON DELETE SET NULL,
  acao TEXT NOT NULL, -- 'create', 'update', 'delete', 'access', 'export', 'login', 'logout'
  tabela TEXT NOT NULL,
  registro_id UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_data ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_tripulante ON audit_logs(tripulante_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- 3. Tabela de Solicitações LGPD (LGPD Art. 18)
CREATE TABLE public.solicitacoes_lgpd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tripulante_id UUID REFERENCES tripulantes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL, -- 'acesso', 'retificacao', 'exclusao', 'portabilidade', 'oposicao'
  status TEXT DEFAULT 'pendente', -- 'pendente', 'em_analise', 'concluida', 'recusada'
  descricao TEXT,
  resposta TEXT,
  atendido_por UUID,
  dados_exportados JSONB, -- Para solicitações de acesso/portabilidade
  created_at TIMESTAMPTZ DEFAULT now(),
  atendido_em TIMESTAMPTZ,
  prazo_legal TIMESTAMPTZ DEFAULT (now() + interval '15 days') -- 15 dias úteis pela LGPD
);

CREATE INDEX idx_solicitacoes_lgpd_tripulante ON solicitacoes_lgpd(tripulante_id);
CREATE INDEX idx_solicitacoes_lgpd_status ON solicitacoes_lgpd(status);

-- 4. Configurações LGPD por Empresa
CREATE TABLE public.lgpd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE UNIQUE NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  dpo_nome TEXT, -- Encarregado de Dados (LGPD Art. 41)
  dpo_email TEXT,
  dpo_telefone TEXT,
  endereco_sede TEXT,
  politica_privacidade_versao TEXT DEFAULT 'v1.0',
  termos_uso_versao TEXT DEFAULT 'v1.0',
  retencao_logs_meses INTEGER DEFAULT 12, -- Mínimo 6 pelo Marco Civil
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Consentimentos
ALTER TABLE public.consentimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to consentimentos"
ON public.consentimentos FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin view consentimentos da empresa"
ON public.consentimentos FOR SELECT
USING (
  has_role(auth.uid(), 'empresa_admin') AND 
  tripulante_id IN (
    SELECT t.id FROM tripulantes t
    JOIN embarcacoes e ON t.embarcacao_id = e.id
    WHERE e.empresa_id = get_user_empresa_id(auth.uid())
  )
);

CREATE POLICY "Gerente view consentimentos da embarcacao"
ON public.consentimentos FOR SELECT
USING (
  has_role(auth.uid(), 'gerente_embarcacao') AND 
  tripulante_id IN (
    SELECT id FROM tripulantes 
    WHERE embarcacao_id = get_user_embarcacao_id(auth.uid())
  )
);

-- Audit Logs (apenas super_admin pode ver)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to audit_logs"
ON public.audit_logs FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin view audit_logs da empresa"
ON public.audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'empresa_admin') AND 
  (
    tripulante_id IN (
      SELECT t.id FROM tripulantes t
      JOIN embarcacoes e ON t.embarcacao_id = e.id
      WHERE e.empresa_id = get_user_empresa_id(auth.uid())
    )
    OR tripulante_id IS NULL
  )
);

-- Solicitações LGPD
ALTER TABLE public.solicitacoes_lgpd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to solicitacoes_lgpd"
ON public.solicitacoes_lgpd FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin manage solicitacoes da empresa"
ON public.solicitacoes_lgpd FOR ALL
USING (
  has_role(auth.uid(), 'empresa_admin') AND 
  tripulante_id IN (
    SELECT t.id FROM tripulantes t
    JOIN embarcacoes e ON t.embarcacao_id = e.id
    WHERE e.empresa_id = get_user_empresa_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'empresa_admin') AND 
  tripulante_id IN (
    SELECT t.id FROM tripulantes t
    JOIN embarcacoes e ON t.embarcacao_id = e.id
    WHERE e.empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- LGPD Config
ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to lgpd_config"
ON public.lgpd_config FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin manage own lgpd_config"
ON public.lgpd_config FOR ALL
USING (
  has_role(auth.uid(), 'empresa_admin') AND 
  empresa_id = get_user_empresa_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'empresa_admin') AND 
  empresa_id = get_user_empresa_id(auth.uid())
);

CREATE POLICY "Gerente view lgpd_config da empresa"
ON public.lgpd_config FOR SELECT
USING (
  has_role(auth.uid(), 'gerente_embarcacao') AND 
  empresa_id = get_user_empresa_id(auth.uid())
);

-- =============================================
-- FUNÇÃO DE LIMPEZA DE LOGS (Marco Civil)
-- =============================================

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retention_months INTEGER;
BEGIN
  -- Buscar configuração de retenção (padrão 12 meses, mínimo 6)
  SELECT COALESCE(MIN(retencao_logs_meses), 12) INTO retention_months FROM lgpd_config;
  IF retention_months < 6 THEN
    retention_months := 6; -- Marco Civil exige mínimo 6 meses
  END IF;

  -- Limpar sessões WiFi antigas (respeitando solicitações pendentes)
  DELETE FROM sessoes_wifi 
  WHERE created_at < now() - (retention_months || ' months')::interval
  AND tripulante_id NOT IN (
    SELECT tripulante_id FROM solicitacoes_lgpd 
    WHERE status = 'pendente' AND tripulante_id IS NOT NULL
  );
  
  -- Audit logs: manter 5 anos (prazo prescricional civil)
  DELETE FROM audit_logs
  WHERE created_at < now() - interval '5 years';
END;
$$;

-- Trigger para atualizar updated_at na lgpd_config
CREATE TRIGGER update_lgpd_config_updated_at
BEFORE UPDATE ON public.lgpd_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();