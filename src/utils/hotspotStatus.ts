/**
 * Utility to calculate the real status of a hotspot based on last sync time
 * instead of relying on the static database field.
 */

export interface HotspotStatusInput {
  status: string;
  ultima_sincronizacao: string | null;
  sync_interval_minutes: number;
}

export type HotspotRealStatus = 'online' | 'offline' | 'alerta';

/**
 * Calculate the real status of a hotspot based on its last synchronization time.
 * 
 * Rules:
 * - If never synced: offline
 * - If synced within the interval: online
 * - If synced between 1x and 2x the interval: alerta (warning)
 * - If synced more than 2x the interval ago: offline
 */
export function getHotspotRealStatus(hotspot: HotspotStatusInput): HotspotRealStatus {
  if (!hotspot.ultima_sincronizacao) {
    return 'offline';
  }
  
  const lastSync = new Date(hotspot.ultima_sincronizacao).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastSync) / (1000 * 60);
  
  const syncInterval = hotspot.sync_interval_minutes || 5;
  const threshold = syncInterval * 2;
  
  // If hasn't synced for more than 2x the interval, it's offline
  if (diffMinutes > threshold) {
    return 'offline';
  }
  
  // If synced between 1x and 2x the interval, show warning
  if (diffMinutes > syncInterval) {
    return 'alerta';
  }
  
  return 'online';
}

/**
 * Get status display info (label and CSS classes) for a hotspot.
 */
export function getHotspotStatusDisplay(status: HotspotRealStatus): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'online':
      return {
        label: 'Online',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      };
    case 'alerta':
      return {
        label: 'Alerta',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      };
    case 'offline':
      return {
        label: 'Offline',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      };
  }
}
