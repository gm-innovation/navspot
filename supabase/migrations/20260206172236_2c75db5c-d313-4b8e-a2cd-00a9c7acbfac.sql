-- v7.1.42: Add portal_profile_version column for rollout control
ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS portal_profile_version text NULL;

-- Comment explaining the column purpose
COMMENT ON COLUMN public.hotspots.portal_profile_version IS 'Controls rollout of portal profile configuration changes (e.g., http-pap). When value differs from required version, backend injects configure_hotspot_profile action.';