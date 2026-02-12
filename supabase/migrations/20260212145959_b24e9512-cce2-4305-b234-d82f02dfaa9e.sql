
-- 1. Create private storage bucket for pre-rendered scripts
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotspot-scripts', 'hotspot-scripts', false);

-- 2. RLS: service_role has full access (default via service key)
-- Authenticated users can read their own hotspot scripts
CREATE POLICY "Authenticated users can read own hotspot scripts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'hotspot-scripts'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] IN (
    SELECT h.id::text FROM hotspots h
    JOIN embarcacoes e ON h.embarcacao_id = e.id
    WHERE e.empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- 3. Add tracking columns to hotspots
ALTER TABLE public.hotspots
ADD COLUMN IF NOT EXISTS scripts_version text,
ADD COLUMN IF NOT EXISTS scripts_generated_at timestamptz,
ADD COLUMN IF NOT EXISTS scripts_storage_path text;
