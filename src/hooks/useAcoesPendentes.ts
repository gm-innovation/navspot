import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type AcaoPendente = Tables<'acoes_pendentes'>;

export interface AcaoPendenteWithDetails extends AcaoPendente {
  hotspot_nome?: string;
}

export interface AcoesPendentesStats {
  pendentes: number;
  executadas: number;
  erros: number;
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

export function useAcoesPendentesStats() {
  return useQuery({
    queryKey: ['acoes_pendentes_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acoes_pendentes')
        .select('status');

      if (error) throw error;

      const stats: AcoesPendentesStats = {
        pendentes: data?.filter(a => a.status === 'pendente').length || 0,
        executadas: data?.filter(a => a.status === 'executado').length || 0,
        erros: data?.filter(a => a.status === 'erro').length || 0,
      };

      return stats;
    },
  });
}

export function useRetryAcaoPendente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('acoes_pendentes')
        .update({ 
          status: 'pendente', 
          tentativas: 0, 
          erro_mensagem: null,
          executed_at: null
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes_stats'] });
      toast({
        title: 'Ação reativada',
        description: 'A ação foi colocada novamente na fila de pendentes.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao reativar ação',
        description: error.message,
        variant: 'destructive',
      });
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
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes_stats'] });
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
