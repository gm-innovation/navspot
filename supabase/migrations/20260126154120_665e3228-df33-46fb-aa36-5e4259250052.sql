-- Add quota_periodo to perfis_velocidade
ALTER TABLE public.perfis_velocidade 
ADD COLUMN quota_periodo TEXT NOT NULL DEFAULT 'diario';

-- Add timezone to empresas
ALTER TABLE public.empresas 
ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- Add timezone to embarcacoes (nullable - inherits from empresa if null)
ALTER TABLE public.embarcacoes 
ADD COLUMN timezone TEXT DEFAULT NULL;

-- Add quota_reset_at to tripulantes
ALTER TABLE public.tripulantes 
ADD COLUMN quota_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.perfis_velocidade.quota_periodo IS 'Periodo de renovacao da quota: hora, diario, semanal, mensal';
COMMENT ON COLUMN public.empresas.timezone IS 'Fuso horario padrao da empresa (IANA format)';
COMMENT ON COLUMN public.embarcacoes.timezone IS 'Fuso horario da embarcacao (se null, herda da empresa)';
COMMENT ON COLUMN public.tripulantes.quota_reset_at IS 'Data/hora do ultimo reset de quota';