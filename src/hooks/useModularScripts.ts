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
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (error) {
    window.open(url, '_blank');
  }
}
