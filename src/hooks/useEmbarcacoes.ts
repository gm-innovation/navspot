import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type Embarcacao = Tables<'embarcacoes'>;
export type EmbarcacaoInsert = TablesInsert<'embarcacoes'>;
export type EmbarcacaoUpdate = TablesUpdate<'embarcacoes'>;

export interface EmbarcacaoWithStats extends Embarcacao {
  hotspots_count?: number;
  tripulantes_count?: number;
  empresa_nome?: string;
}

export function useEmbarcacoes() {
  return useQuery({
    queryKey: ['embarcacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('embarcacoes')
        .select(`
          *,
          empresas(nome),
          hotspots(id),
          tripulantes(id)
        `)
        .order('nome');

      if (error) throw error;
      
      return data.map((e: any) => ({
        ...e,
        empresa_nome: e.empresas?.nome,
        hotspots_count: e.hotspots?.length || 0,
        tripulantes_count: e.tripulantes?.length || 0,
      })) as EmbarcacaoWithStats[];
    },
  });
}

export function useEmbarcacao(id: string | undefined) {
  return useQuery({
    queryKey: ['embarcacoes', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('embarcacoes')
        .select(`
          *,
          empresas(nome),
          hotspots(id, nome, status),
          tripulantes(id, nome, status)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        return {
          ...data,
          empresa_nome: (data as any).empresas?.nome,
          hotspots_count: (data as any).hotspots?.length || 0,
          tripulantes_count: (data as any).tripulantes?.length || 0,
        } as EmbarcacaoWithStats;
      }
      return null;
    },
    enabled: !!id,
  });
}

export function useCreateEmbarcacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (embarcacao: EmbarcacaoInsert) => {
      const { data, error } = await supabase
        .from('embarcacoes')
        .insert(embarcacao)
        .select()
        .single();

      if (error) throw error;
      return data as Embarcacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      toast({
        title: 'Embarcação criada',
        description: 'A embarcação foi cadastrada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar embarcação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateEmbarcacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: EmbarcacaoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('embarcacoes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Embarcacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      toast({
        title: 'Embarcação atualizada',
        description: 'Os dados da embarcação foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar embarcação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteEmbarcacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('embarcacoes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embarcacoes'] });
      toast({
        title: 'Embarcação excluída',
        description: 'A embarcação foi removida do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir embarcação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
