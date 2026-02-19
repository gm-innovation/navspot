-- v7.8.7: Add batch_id for handshake ACK
ALTER TABLE acoes_pendentes ADD COLUMN IF NOT EXISTS batch_id text;

-- Update status constraint to include 'enviado'
ALTER TABLE acoes_pendentes DROP CONSTRAINT IF EXISTS acoes_pendentes_status_check;
ALTER TABLE acoes_pendentes ADD CONSTRAINT acoes_pendentes_status_check 
  CHECK (status IN ('pendente', 'enviado', 'executado', 'erro'));