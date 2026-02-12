import { useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface RegenerateUrlsRequest {
  hotspotId: string;
}

/**
 * @deprecated Legacy hook - v7.8.0+ uses signed URLs from useGenerateHotspotScript
 * Kept for backward compatibility during transition period.
 */
export function useDownloadModularScript() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  
  return useMutation({
    mutationFn: async ({ type, token, rosVersion = '7' }: { type: string; token: string; rosVersion?: string }) => {
      const url = `${SUPABASE_URL}/functions/v1/mikrotik-script-generator?mode=serve&type=${type}&token=${token}&ros_version=${rosVersion}`;
      const response = await fetch(url);
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
export function downloadFromSignedUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
