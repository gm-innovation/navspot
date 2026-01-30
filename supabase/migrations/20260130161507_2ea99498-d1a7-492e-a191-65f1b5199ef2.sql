-- v6.9.6: Add field to track synced profiles per hotspot
-- This prevents the infinite loop of sending the same profile actions repeatedly

ALTER TABLE hotspots 
ADD COLUMN IF NOT EXISTS synced_profiles JSONB DEFAULT '[]'::jsonb;

-- Index for performance on JSON contains queries
CREATE INDEX IF NOT EXISTS idx_hotspots_synced_profiles 
ON hotspots USING gin(synced_profiles);

COMMENT ON COLUMN hotspots.synced_profiles IS 
'Array de slugs de perfis já sincronizados para este hotspot. Ex: ["tripulacao-padrao", "visitante"]';