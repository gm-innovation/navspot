-- v6.9.7: Adicionar tracking de usuários sincronizados com metadados
ALTER TABLE hotspots 
ADD COLUMN IF NOT EXISTS synced_users JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hotspots.synced_users IS 
'Array de objetos: [{"login": "alexandre.silva", "last_seen": "ISO8601", "last_synced_at": "ISO8601", "miss_count": 0}]';

-- Índice para performance em buscas via GIN
CREATE INDEX IF NOT EXISTS idx_hotspots_synced_users_gin 
ON hotspots USING gin(synced_users);