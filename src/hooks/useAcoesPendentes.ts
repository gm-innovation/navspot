import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type AcaoPendente = Tables<'acoes_pendentes'>;

export interface AcaoPendenteWithDetails extends AcaoPendente {
  hotspot_nome?: string;
}

export function useAcoesPendentes(hotspotId?: string) {
  return useQuery({
    queryKey: ['acoes_pendentes', hotspotId],
    queryFn: async () => {
      let query = supabase
        .from('acoes_pendentes')
        .select(`
          *,
          hotspots(nome)
        `)
        .order('created_at', { ascending: false });

      if (hotspotId) {
        query = query.eq('hotspot_id', hotspotId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      return data.map((a: any) => ({
        ...a,
        hotspot_nome: a.hotspots?.nome,
      })) as AcaoPendenteWithDetails[];
    },
  });
}

export function useDeleteAcaoPendente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('acoes_pendentes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Ação removida',
        description: 'A ação pendente foi removida da fila.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover ação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
