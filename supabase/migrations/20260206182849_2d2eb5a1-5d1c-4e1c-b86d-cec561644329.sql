-- v7.1.44: Reset portal_profile_version to force reconfigure with clean file write
-- This forces all hotspots to receive the configure_hotspot_profile action again
-- which will now work because the file write uses /file add instead of /file print

UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;

-- Comment explaining the column purpose
COMMENT ON COLUMN public.hotspots.portal_profile_version IS 
  'v7.1.44: Tracks portal profile version for rollout. NULL triggers reconfigure with login-by=http-pap.';