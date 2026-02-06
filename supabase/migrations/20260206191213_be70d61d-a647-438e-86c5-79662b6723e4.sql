-- v7.1.46: Reset portal_profile_version to force telemetry check
-- This ensures all hotspots will send their current state and backend will
-- confirm configuration via telemetry before marking as complete
UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;