-- v6.9.15: Add firewall rules hash columns to hotspots for loop prevention
ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS firewall_rules_hash text,
ADD COLUMN IF NOT EXISTS firewall_rules_updated_at timestamptz;

-- Drop existing constraint if it exists
ALTER TABLE public.acoes_pendentes DROP CONSTRAINT IF EXISTS acoes_pendentes_tipo_check;

-- Create expanded constraint with all action types used by the system
ALTER TABLE public.acoes_pendentes ADD CONSTRAINT acoes_pendentes_tipo_check CHECK (
  tipo IN (
    -- User management
    'create_user', 'remove_user', 'delete_user', 'disable_user', 'enable_user',
    'update_password', 'kick_session',
    -- Profile management  
    'create_profile', 'update_profile', 'update_user_profile', 
    'add_user_profile', 'remove_user_profile', 'update_profile_quota',
    -- Walled Garden (pre-login blocking)
    'add_walled_garden', 'remove_walled_garden',
    'add_whitelist_domain', 'remove_whitelist_domain',
    'add_blacklist_domain', 'remove_blacklist_domain',
    'create_whitelist_domain', 'create_blacklist_domain',
    -- Firewall Filter (post-login blocking)
    'add_firewall_filter', 'remove_firewall_filter',
    'add_firewall_block', 'remove_firewall_block',
    -- Device management
    'block_device', 'unblock_device'
  )
);