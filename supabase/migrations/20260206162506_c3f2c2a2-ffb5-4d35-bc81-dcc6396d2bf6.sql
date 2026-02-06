-- ================================================================
-- Migração Automática de Rede Reservada v7.1.40
-- ================================================================
-- Hotspots com 192.168.88.x são migrados para 10.10.10.0/24
-- A rede 192.168.88.0/24 é reservada para gerência MikroTik (Winbox)
-- ================================================================

-- 1. Adicionar colunas de auditoria (se não existirem)
ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS rede_prev text NULL;

ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS migration_state text DEFAULT 'idle';

-- 2. Migrar hotspots com rede conflitante
-- Usando trim() para cobrir espaços acidentais
-- Cobre variações: "192.168.88.0", "192.168.88.0/24", "192.168.88.1", etc.
UPDATE public.hotspots  
SET 
  rede_prev = rede,  
  rede = '10.10.10.0/24',  
  migration_state = 'migrated',
  updated_at = now()
WHERE trim(rede) LIKE '192.168.88%'
  AND (migration_state IS NULL OR migration_state = 'idle');

-- 3. Alterar o DEFAULT da coluna rede para a nova rede segura
-- Isso garante que novos hotspots usem 10.10.10.0/24 por padrão
ALTER TABLE public.hotspots 
ALTER COLUMN rede SET DEFAULT '10.10.10.0/24';

-- 4. Adicionar constraint para prevenir futuras inserções com rede reservada
-- Usando trim() na constraint para ser consistente com a migração
ALTER TABLE public.hotspots
DROP CONSTRAINT IF EXISTS hotspots_rede_not_reserved;

ALTER TABLE public.hotspots
ADD CONSTRAINT hotspots_rede_not_reserved 
CHECK (trim(rede) NOT LIKE '192.168.88%');