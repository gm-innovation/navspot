-- Sprint 6A: Controle Avançado de Acesso e Firewall

-- 1. Adicionar colunas em perfis_velocidade
ALTER TABLE public.perfis_velocidade
ADD COLUMN max_dispositivos INTEGER NOT NULL DEFAULT 1,
ADD COLUMN tipo_usuario TEXT NOT NULL DEFAULT 'tripulante',
ADD COLUMN modo_acesso TEXT NOT NULL DEFAULT 'permitir_tudo',
ADD COLUMN herdar_regras_empresa BOOLEAN NOT NULL DEFAULT true;

-- 2. Criar tabela listas_acesso
CREATE TABLE public.listas_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'whitelist',
  dominios JSONB NOT NULL DEFAULT '[]'::jsonb,
  aplicativos JSONB NOT NULL DEFAULT '[]'::jsonb,
  portas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Criar tabela regras_acesso
CREATE TABLE public.regras_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lista_id UUID NOT NULL REFERENCES public.listas_acesso(id) ON DELETE CASCADE,
  perfil_id UUID REFERENCES public.perfis_velocidade(id) ON DELETE CASCADE,
  tripulante_id UUID REFERENCES public.tripulantes(id) ON DELETE CASCADE,
  mac_address TEXT,
  hotspot_id UUID REFERENCES public.hotspots(id) ON DELETE CASCADE,
  acao TEXT NOT NULL DEFAULT 'permitir',
  prioridade INTEGER NOT NULL DEFAULT 100,
  horario_inicio TIME,
  horario_fim TIME,
  dias_semana JSONB NOT NULL DEFAULT '["seg","ter","qua","qui","sex","sab","dom"]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Criar tabela dispositivos_registrados
CREATE TABLE public.dispositivos_registrados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tripulante_id UUID NOT NULL REFERENCES public.tripulantes(id) ON DELETE CASCADE,
  mac_address TEXT NOT NULL,
  nome TEXT,
  tipo TEXT NOT NULL DEFAULT 'outro',
  autorizado BOOLEAN NOT NULL DEFAULT true,
  bytes_consumidos BIGINT NOT NULL DEFAULT 0,
  ultimo_uso TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mac_address)
);

-- 5. Adicionar dispositivo_id em sessoes_wifi
ALTER TABLE public.sessoes_wifi
ADD COLUMN dispositivo_id UUID REFERENCES public.dispositivos_registrados(id) ON DELETE SET NULL;

-- 6. Índices para performance
CREATE INDEX idx_listas_acesso_empresa ON public.listas_acesso(empresa_id);
CREATE INDEX idx_regras_acesso_empresa ON public.regras_acesso(empresa_id);
CREATE INDEX idx_regras_acesso_perfil ON public.regras_acesso(perfil_id);
CREATE INDEX idx_regras_acesso_tripulante ON public.regras_acesso(tripulante_id);
CREATE INDEX idx_regras_acesso_prioridade ON public.regras_acesso(prioridade);
CREATE INDEX idx_dispositivos_tripulante ON public.dispositivos_registrados(tripulante_id);
CREATE INDEX idx_dispositivos_mac ON public.dispositivos_registrados(mac_address);

-- 7. Trigger para updated_at em listas_acesso
CREATE TRIGGER update_listas_acesso_updated_at
BEFORE UPDATE ON public.listas_acesso
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Habilitar RLS
ALTER TABLE public.listas_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_acesso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_registrados ENABLE ROW LEVEL SECURITY;

-- 9. RLS policies para listas_acesso
CREATE POLICY "Super admin full access to listas_acesso"
ON public.listas_acesso FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own listas"
ON public.listas_acesso FOR ALL
USING (has_role(auth.uid(), 'empresa_admin') AND empresa_id = get_user_empresa_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'empresa_admin') AND empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Gerente can view empresa listas"
ON public.listas_acesso FOR SELECT
USING (has_role(auth.uid(), 'gerente_embarcacao') AND empresa_id = get_user_empresa_id(auth.uid()));

-- 10. RLS policies para regras_acesso
CREATE POLICY "Super admin full access to regras_acesso"
ON public.regras_acesso FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own regras"
ON public.regras_acesso FOR ALL
USING (has_role(auth.uid(), 'empresa_admin') AND empresa_id = get_user_empresa_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'empresa_admin') AND empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Gerente can view empresa regras"
ON public.regras_acesso FOR SELECT
USING (has_role(auth.uid(), 'gerente_embarcacao') AND empresa_id = get_user_empresa_id(auth.uid()));

-- 11. RLS policies para dispositivos_registrados
CREATE POLICY "Super admin full access to dispositivos"
ON public.dispositivos_registrados FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin full access to own dispositivos"
ON public.dispositivos_registrados FOR ALL
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

CREATE POLICY "Gerente full access to own embarcacao dispositivos"
ON public.dispositivos_registrados FOR ALL
USING (
  has_role(auth.uid(), 'gerente_embarcacao') AND 
  tripulante_id IN (
    SELECT id FROM tripulantes 
    WHERE embarcacao_id = get_user_embarcacao_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'gerente_embarcacao') AND 
  tripulante_id IN (
    SELECT id FROM tripulantes 
    WHERE embarcacao_id = get_user_embarcacao_id(auth.uid())
  )
);

-- 12. Habilitar realtime para novas tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE public.listas_acesso;
ALTER PUBLICATION supabase_realtime ADD TABLE public.regras_acesso;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos_registrados;