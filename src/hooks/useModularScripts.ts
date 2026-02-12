import { useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ModularScriptRequest {
  type: 'infra' | 'sync-standalone' | 'guardian-standalone';
  token: string;
  rosVersion?: string;
}

export function useDownloadModularScript() {
  return useMutation({
    mutationFn: async ({ type, token, rosVersion = '7' }: ModularScriptRequest) => {
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
