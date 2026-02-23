import { supabase } from '@/integrations/supabase/client';

type UpdateType = 
  | 'update_device_limit'
  | 'add_walled_garden'
  | 'remove_walled_garden'
  | 'add_firewall_rule'
  | 'remove_firewall_rule'
  | 'update_user_profile'
  | 'register_device'
  | 'block_device'
  | 'unblock_device'
  | 'create_user'
  | 'delete_user'
  | 'update_user_password'
  | 'kick_session'
  | 'disable_user'
  | 'enable_user'
  // v4.0 - Profile/Walled Garden/Firewall via API
  | 'add_user_profile'
  | 'remove_user_profile'
  | 'add_firewall_l7'
  | 'add_firewall_filter';

interface ConfigUpdateResult {
  success: boolean;
  action_id?: string;
  action_type?: string;
  message?: string;
  error?: string;
}

interface ScriptGeneratorResult {
  success: boolean;
  script?: string;
  hotspot_name?: string;
  tripulantes_count?: number;
  perfis_count?: number;
  regras_count?: number;
  error?: string;
}

/**
 * Queue a configuration update action for a hotspot
 * The action will be executed on the next MikroTik sync
 */
export async function queueConfigUpdate(
  hotspotId: string,
  updateType: UpdateType,
  payload: Record<string, unknown>
): Promise<ConfigUpdateResult> {
  const { data, error } = await supabase.functions.invoke('mikrotik-config-update', {
    body: {
      hotspot_id: hotspotId,
      update_type: updateType,
      payload,
    },
  });

  if (error) {
    console.error('[mikrotikService] Config update failed:', error);
    return { success: false, error: error.message };
  }

  return data as ConfigUpdateResult;
}

/**
 * Generate a new RSC script for a hotspot
 */
export async function generateScript(hotspotId: string): Promise<ScriptGeneratorResult> {
  const { data, error } = await supabase.functions.invoke('navspot-gen', {
    body: { hotspot_id: hotspotId },
  });

  if (error) {
    console.error('[mikrotikService] Script generation failed:', error);
    return { success: false, error: error.message };
  }

  // Detectar formato da resposta (text/plain vs JSON legado)
  let scriptText: string;
  if (typeof data === 'string') {
    scriptText = data;
  } else if (data && typeof data.text === 'function') {
    scriptText = await data.text();
  } else if (data?.script || data?.bootstrap_script) {
    // Fallback JSON antigo
    return data as ScriptGeneratorResult;
  } else {
    return { success: false, error: 'Formato de resposta inesperado' };
  }

  return {
    success: true,
    script: scriptText,
    version: scriptText.match(/v(\d+\.\d+\.\d+)/)?.[1] || '7.2.0',
  } as unknown as ScriptGeneratorResult;
}

// Convenience functions for common actions

export async function kickSession(hotspotId: string, user: string, mac?: string) {
  return queueConfigUpdate(hotspotId, 'kick_session', { user, mac });
}

export async function disableUser(hotspotId: string, user: string) {
  return queueConfigUpdate(hotspotId, 'disable_user', { user });
}

export async function enableUser(hotspotId: string, user: string) {
  return queueConfigUpdate(hotspotId, 'enable_user', { user });
}

export async function updateUserPassword(hotspotId: string, user: string, password: string) {
  return queueConfigUpdate(hotspotId, 'update_user_password', { user, password });
}

export async function updateDeviceLimit(hotspotId: string, profileName: string, maxDevices: number) {
  return queueConfigUpdate(hotspotId, 'update_device_limit', { 
    profile_name: profileName, 
    max_devices: maxDevices 
  });
}

export async function addWalledGarden(hotspotId: string, domains: string[], action: 'allow' | 'deny' = 'allow') {
  return queueConfigUpdate(hotspotId, 'add_walled_garden', { domains, action });
}

export async function removeWalledGarden(hotspotId: string, domains: string[]) {
  return queueConfigUpdate(hotspotId, 'remove_walled_garden', { domains });
}

export async function blockDevice(hotspotId: string, mac: string, user?: string) {
  return queueConfigUpdate(hotspotId, 'block_device', { mac, user });
}

export async function unblockDevice(hotspotId: string, mac: string, user?: string) {
  return queueConfigUpdate(hotspotId, 'unblock_device', { mac, user });
}

export async function createUser(hotspotId: string, user: string, password: string, profile: string) {
  return queueConfigUpdate(hotspotId, 'create_user', { user, password, profile });
}

export async function deleteUser(hotspotId: string, user: string) {
  return queueConfigUpdate(hotspotId, 'delete_user', { user });
}

export async function updateUserProfile(hotspotId: string, user: string, profile: string) {
  return queueConfigUpdate(hotspotId, 'update_user_profile', { user, profile });
}
