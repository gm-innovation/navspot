import { useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

/**
 * @deprecated Legacy hook - v7.8.0+ uses signed URLs from useGenerateHotspotScript
 * Kept for backward compatibility during transition period.
 */
export function useDownloadModularScript() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  
  return useMutation({
    mutationFn: async ({ type, token, rosVersion = '7' }: { type: string; token: string; rosVersion?: string }) => {
      const url = `${SUPABASE_URL}/functions/v1/gen7post`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'serve', type, token, ros_version: rosVersion }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      return await response.text();
    },
    onError: (error) => {
      toast({
        title: 'Erro ao baixar script modular',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Download a script from a signed URL (v7.8.0+)
 */
export async function downloadFromSignedUrl(url: string, filename: string) {
  // Signed URLs point directly to files — open in new tab to trigger download
  window.open(url, '_blank');
}
