-- v6.9.8: Add update_profile_config to allowed action types
ALTER TABLE acoes_pendentes DROP CONSTRAINT IF EXISTS acoes_pendentes_tipo_check;
ALTER TABLE acoes_pendentes ADD CONSTRAINT acoes_pendentes_tipo_check CHECK (
  tipo = ANY (ARRAY[
    'create_user', 'remove_user', 'delete_user', 'disable_user', 'enable_user',
    'update_password', 'kick_session',
    'create_profile', 'update_profile', 'update_profile_config',
    'update_user_profile', 'add_user_profile', 'remove_user_profile', 'update_profile_quota',
    'add_walled_garden', 'remove_walled_garden',
    'add_whitelist_domain', 'remove_whitelist_domain',
    'add_blacklist_domain', 'remove_blacklist_domain',
    'create_whitelist_domain', 'create_blacklist_domain',
    'add_firewall_filter', 'remove_firewall_filter',
    'add_firewall_block', 'remove_firewall_block', 'add_firewall_allow',
    'block_device', 'unblock_device',
    'kick_device', 'configure_hotspot_profile'
  ])
);