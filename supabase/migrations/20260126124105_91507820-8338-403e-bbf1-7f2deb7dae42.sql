-- =====================================================
-- NAVSPOT Database Schema - Complete Structure
-- =====================================================

-- 1. Create enum for user roles
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'empresa_admin', 
  'gerente_embarcacao'
);

-- =====================================================
-- 2. Core Tables
-- =====================================================

-- Empresas - Companies using NAVSPOT
CREATE TABLE public.empresas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Embarcacoes - Vessels/Ships
CREATE TABLE public.embarcacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'navio' CHECK (tipo IN ('navio', 'lancha', 'iate', 'ferry', 'rebocador', 'outro')),
  responsavel_nome TEXT,
  responsavel_email TEXT,
  localizacao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Perfis de Velocidade - Bandwidth profiles
CREATE TABLE public.perfis_velocidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  velocidade_download TEXT NOT NULL DEFAULT '5M',
  velocidade_upload TEXT NOT NULL DEFAULT '2M',
  limite_dados_mb INTEGER,
  prioridade INTEGER NOT NULL DEFAULT 4 CHECK (prioridade >= 1 AND prioridade <= 8),
  session_timeout_minutos INTEGER,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Hotspots - MikroTik routers
CREATE TABLE public.hotspots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  embarcacao_id UUID NOT NULL REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  interface_wifi TEXT NOT NULL DEFAULT 'wlan1',
  rede TEXT NOT NULL DEFAULT '192.168.88.0/24',
  sync_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'alerta')),
  max_usuarios INTEGER DEFAULT 50,
  ultima_sincronizacao TIMESTAMP WITH TIME ZONE,
  script_gerado TEXT,
  script_versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tripulantes - WiFi users/crew members
CREATE TABLE public.tripulantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  embarcacao_id UUID NOT NULL REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
  perfil_id UUID REFERENCES public.perfis_velocidade(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  login_wifi TEXT UNIQUE NOT NULL,
  senha_wifi TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  cargo TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'bloqueado', 'inativo')),
  ultimo_login TIMESTAMP WITH TIME ZONE,
  bytes_consumidos BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sessoes WiFi - Connection history
CREATE TABLE public.sessoes_wifi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tripulante_id UUID NOT NULL REFERENCES public.tripulantes(id) ON DELETE CASCADE,
  hotspot_id UUID NOT NULL REFERENCES public.hotspots(id) ON DELETE CASCADE,
  mac_address TEXT,
  ip_address INET,
  inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fim TIMESTAMP WITH TIME ZONE,
  bytes_in BIGINT NOT NULL DEFAULT 0,
  bytes_out BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'finalizada', 'forcada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Acoes Pendentes - Command queue for MikroTik
CREATE TABLE public.acoes_pendentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotspot_id UUID NOT NULL REFERENCES public.hotspots(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('disable_user', 'enable_user', 'kick_session', 'update_password', 'update_profile', 'create_user', 'delete_user')),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'executado', 'erro')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro_mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_at TIMESTAMP WITH TIME ZONE
);

-- Alertas - Alert system
CREATE TABLE public.alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  embarcacao_id UUID REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
  hotspot_id UUID REFERENCES public.hotspots(id) ON DELETE CASCADE,
  tripulante_id UUID REFERENCES public.tripulantes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('offline', 'limite_usuarios', 'limite_dados', 'sinal_fraco', 'sync_falha', 'outro')),
  mensagem TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'info' CHECK (severidade IN ('info', 'warning', 'critical')),
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolvido_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Roles - System user permissions
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  embarcacao_id UUID REFERENCES public.embarcacoes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- =====================================================
-- 3. Security Definer Functions (avoid RLS recursion)
-- =====================================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Get user's empresa_id
CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user's embarcacao_id
CREATE OR REPLACE FUNCTION public.get_user_embarcacao_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT embarcacao_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- =====================================================
-- 4. Trigger for updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_embarcacoes_updated_at
  BEFORE UPDATE ON public.embarcacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hotspots_updated_at
  BEFORE UPDATE ON public.hotspots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tripulantes_updated_at
  BEFORE UPDATE ON public.tripulantes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 5. Enable RLS on all tables
-- =====================================================

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embarcacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_velocidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tripulantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_wifi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acoes_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RLS Policies
-- =====================================================

-- EMPRESAS policies
CREATE POLICY "Super admin full access to empresas"
  ON public.empresas FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin can view own empresa"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND id = public.get_user_empresa_id(auth.uid())
  );

CREATE POLICY "Gerente can view own empresa"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND id = public.get_user_empresa_id(auth.uid())
  );

-- EMBARCACOES policies
CREATE POLICY "Super admin full access to embarcacoes"
  ON public.embarcacoes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own embarcacoes"
  ON public.embarcacoes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  );

CREATE POLICY "Gerente can view own embarcacao"
  ON public.embarcacoes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND id = public.get_user_embarcacao_id(auth.uid())
  );

-- PERFIS_VELOCIDADE policies
CREATE POLICY "Super admin full access to perfis"
  ON public.perfis_velocidade FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own perfis"
  ON public.perfis_velocidade FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  );

CREATE POLICY "Gerente can view empresa perfis"
  ON public.perfis_velocidade FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  );

-- HOTSPOTS policies
CREATE POLICY "Super admin full access to hotspots"
  ON public.hotspots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own hotspots"
  ON public.hotspots FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND embarcacao_id IN (
      SELECT id FROM public.embarcacoes WHERE empresa_id = public.get_user_empresa_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND embarcacao_id IN (
      SELECT id FROM public.embarcacoes WHERE empresa_id = public.get_user_empresa_id(auth.uid())
    )
  );

CREATE POLICY "Gerente full access to own embarcacao hotspots"
  ON public.hotspots FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND embarcacao_id = public.get_user_embarcacao_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND embarcacao_id = public.get_user_embarcacao_id(auth.uid())
  );

-- TRIPULANTES policies
CREATE POLICY "Super admin full access to tripulantes"
  ON public.tripulantes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own tripulantes"
  ON public.tripulantes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND embarcacao_id IN (
      SELECT id FROM public.embarcacoes WHERE empresa_id = public.get_user_empresa_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND embarcacao_id IN (
      SELECT id FROM public.embarcacoes WHERE empresa_id = public.get_user_empresa_id(auth.uid())
    )
  );

CREATE POLICY "Gerente full access to own embarcacao tripulantes"
  ON public.tripulantes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND embarcacao_id = public.get_user_embarcacao_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND embarcacao_id = public.get_user_embarcacao_id(auth.uid())
  );

-- SESSOES_WIFI policies
CREATE POLICY "Super admin full access to sessoes"
  ON public.sessoes_wifi FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin can view own sessoes"
  ON public.sessoes_wifi FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND hotspot_id IN (
      SELECT h.id FROM public.hotspots h
      JOIN public.embarcacoes e ON h.embarcacao_id = e.id
      WHERE e.empresa_id = public.get_user_empresa_id(auth.uid())
    )
  );

CREATE POLICY "Gerente can view own embarcacao sessoes"
  ON public.sessoes_wifi FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND hotspot_id IN (
      SELECT id FROM public.hotspots WHERE embarcacao_id = public.get_user_embarcacao_id(auth.uid())
    )
  );

-- ACOES_PENDENTES policies
CREATE POLICY "Super admin full access to acoes"
  ON public.acoes_pendentes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own acoes"
  ON public.acoes_pendentes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND hotspot_id IN (
      SELECT h.id FROM public.hotspots h
      JOIN public.embarcacoes e ON h.embarcacao_id = e.id
      WHERE e.empresa_id = public.get_user_empresa_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND hotspot_id IN (
      SELECT h.id FROM public.hotspots h
      JOIN public.embarcacoes e ON h.embarcacao_id = e.id
      WHERE e.empresa_id = public.get_user_empresa_id(auth.uid())
    )
  );

CREATE POLICY "Gerente full access to own embarcacao acoes"
  ON public.acoes_pendentes FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND hotspot_id IN (
      SELECT id FROM public.hotspots WHERE embarcacao_id = public.get_user_embarcacao_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND hotspot_id IN (
      SELECT id FROM public.hotspots WHERE embarcacao_id = public.get_user_embarcacao_id(auth.uid())
    )
  );

-- ALERTAS policies
CREATE POLICY "Super admin full access to alertas"
  ON public.alertas FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own alertas"
  ON public.alertas FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'empresa_admin') 
    AND empresa_id = public.get_user_empresa_id(auth.uid())
  );

CREATE POLICY "Gerente can view own embarcacao alertas"
  ON public.alertas FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente_embarcacao') 
    AND embarcacao_id = public.get_user_embarcacao_id(auth.uid())
  );

-- USER_ROLES policies
CREATE POLICY "Super admin full access to user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- 7. Indexes for performance
-- =====================================================

CREATE INDEX idx_embarcacoes_empresa_id ON public.embarcacoes(empresa_id);
CREATE INDEX idx_hotspots_embarcacao_id ON public.hotspots(embarcacao_id);
CREATE INDEX idx_hotspots_sync_token ON public.hotspots(sync_token);
CREATE INDEX idx_tripulantes_embarcacao_id ON public.tripulantes(embarcacao_id);
CREATE INDEX idx_tripulantes_login_wifi ON public.tripulantes(login_wifi);
CREATE INDEX idx_sessoes_wifi_tripulante_id ON public.sessoes_wifi(tripulante_id);
CREATE INDEX idx_sessoes_wifi_hotspot_id ON public.sessoes_wifi(hotspot_id);
CREATE INDEX idx_acoes_pendentes_hotspot_id ON public.acoes_pendentes(hotspot_id);
CREATE INDEX idx_acoes_pendentes_status ON public.acoes_pendentes(status);
CREATE INDEX idx_alertas_empresa_id ON public.alertas(empresa_id);
CREATE INDEX idx_alertas_resolvido ON public.alertas(resolvido);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);