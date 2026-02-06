-- ================================================================
-- Migration: Forçar Reconfiguração HTTP-PAP v7.1.41
-- ================================================================
-- Hotspots com initial_config_sent = true precisam re-sincronizar
-- para aplicar a nova configuração login-by=http-pap (remove CHAP)
-- ================================================================

-- Marcar hotspots para reconfiguração
-- O próximo sync vai re-injetar configure_hotspot_profile automaticamente
UPDATE public.hotspots
SET 
  initial_config_sent = false,
  updated_at = now()
WHERE initial_config_sent = true;