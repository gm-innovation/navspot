-- v7.1.45: Force reconfigure with login-by="cookie,http-pap"
-- Reset portal_profile_version to trigger re-application in all hotspots
UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;