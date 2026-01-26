-- Adicionar coluna para configurações personalizadas de tripulantes
-- Usada quando admin opta por não usar um perfil pré-definido
ALTER TABLE public.tripulantes 
ADD COLUMN IF NOT EXISTS config_personalizada jsonb DEFAULT NULL;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.tripulantes.config_personalizada IS 'Configurações personalizadas quando não usa perfil: {velocidade_download, velocidade_upload, max_dispositivos, modo_acesso}';