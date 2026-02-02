-- Migration: Portal Cativo v6.9.13 - Branding + Rate Limiting

-- 1. Add branding columns to empresas table
ALTER TABLE empresas 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS cor_primaria TEXT DEFAULT '#1E3A8A',
ADD COLUMN IF NOT EXISTS cor_secundaria TEXT DEFAULT '#38BDF8',
ADD COLUMN IF NOT EXISTS cor_fundo TEXT DEFAULT '#F8FAFC';

-- 2. Create login_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip inet NOT NULL,
  mac text NOT NULL,
  attempts integer DEFAULT 0,
  blocked_until timestamptz,
  last_attempt timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(ip, mac)
);

-- Enable RLS on login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (edge functions use service role)
-- No user-facing policies needed since this is only accessed by edge functions

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_login_attempts_last ON login_attempts(last_attempt);
CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked ON login_attempts(blocked_until) WHERE blocked_until IS NOT NULL;

-- Comment for documentation
COMMENT ON TABLE login_attempts IS 'Rate limiting for hotspot login attempts - managed by hotspot-login edge function';