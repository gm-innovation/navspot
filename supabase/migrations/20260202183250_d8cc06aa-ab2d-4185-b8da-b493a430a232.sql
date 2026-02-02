-- v6.9.16: Reset firewall_rules_hash to force re-application
-- This is needed because the hash was saved before the rules were actually applied on the router
UPDATE hotspots 
SET firewall_rules_hash = NULL, 
    firewall_rules_updated_at = NULL
WHERE firewall_rules_hash IS NOT NULL;

-- Log for audit
COMMENT ON TABLE hotspots IS 'v6.9.16: Hash reset applied to force firewall rules re-sync';