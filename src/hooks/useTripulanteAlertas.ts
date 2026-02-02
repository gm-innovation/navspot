import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TripulanteAlerta {
  id: string;
  tipo: string;
  severidade: string;
  mensagem: string;
  created_at: string;
  resolvido: boolean;
}

export function useTripulanteAlertas(tripulanteId: string | undefined) {
  return useQuery({
    queryKey: ['tripulante-alertas', tripulanteId],
    queryFn: async () => {
      if (!tripulanteId) return [];
      
      const { data, error } = await supabase
        .from('alertas')
        .select('id, tipo, severidade, mensagem, created_at, resolvido')
        .eq('tripulante_id', tripulanteId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as TripulanteAlerta[];
    },
    enabled: !!tripulanteId,
  });
}
