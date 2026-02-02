-- Add block reason tracking columns to tripulantes table
ALTER TABLE tripulantes 
ADD COLUMN IF NOT EXISTS bloqueio_motivo TEXT,
ADD COLUMN IF NOT EXISTS bloqueado_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bloqueado_por UUID;

COMMENT ON COLUMN tripulantes.bloqueio_motivo IS 'Motivo do bloqueio (manual, quota_exceeded, device_limit, etc)';
COMMENT ON COLUMN tripulantes.bloqueado_at IS 'Data/hora do bloqueio';
COMMENT ON COLUMN tripulantes.bloqueado_por IS 'ID do usuário que bloqueou (se manual)';