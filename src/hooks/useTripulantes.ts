import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type Tripulante = Tables<'tripulantes'>;
export type TripulanteInsert = TablesInsert<'tripulantes'>;
export type TripulanteUpdate = TablesUpdate<'tripulantes'>;

export interface TripulanteWithDetails extends Tripulante {
  embarcacao_nome?: string;
  perfil_nome?: string;
  empresa_nome?: string;
}

export function useTripulantes() {
  return useQuery({
    queryKey: ['tripulantes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tripulantes')
        .select(`
          *,
          embarcacoes(nome, empresas(nome)),
          perfis_velocidade(nome)
        `)
        .order('nome');

      if (error) throw error;
      
      return data.map((t: any) => ({
        ...t,
        embarcacao_nome: t.embarcacoes?.nome,
        empresa_nome: t.embarcacoes?.empresas?.nome,
        perfil_nome: t.perfis_velocidade?.nome,
      })) as TripulanteWithDetails[];
    },
  });
}

export function useTripulante(id: string | undefined) {
  return useQuery({
    queryKey: ['tripulantes', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('tripulantes')
        .select(`
          *,
          embarcacoes(nome, empresas(nome)),
          perfis_velocidade(nome, velocidade_download, velocidade_upload)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        return {
          ...data,
          embarcacao_nome: (data as any).embarcacoes?.nome,
          empresa_nome: (data as any).embarcacoes?.empresas?.nome,
          perfil_nome: (data as any).perfis_velocidade?.nome,
        } as TripulanteWithDetails;
      }
      return null;
    },
    enabled: !!id,
  });
}

export function useCreateTripulante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tripulante: TripulanteInsert) => {
      const { data, error } = await supabase
        .from('tripulantes')
        .insert(tripulante)
        .select()
        .single();

      if (error) throw error;
      return data as Tripulante;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      toast({
        title: 'Tripulante criado',
        description: 'O tripulante foi cadastrado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar tripulante',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateTripulante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: TripulanteUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('tripulantes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Tripulante;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      toast({
        title: 'Tripulante atualizado',
        description: 'Os dados do tripulante foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar tripulante',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteTripulante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tripulantes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      toast({
        title: 'Tripulante excluído',
        description: 'O tripulante foi removido do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir tripulante',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para criar ações pendentes (bloquear, kick, etc.)
export function useCreateTripulanteAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      tripulanteId, 
      tipo, 
      payload 
    }: { 
      tripulanteId: string; 
      tipo: string; 
      payload: Record<string, any>;
    }) => {
      // Primeiro, buscar o tripulante para obter a embarcação
      const { data: tripulante, error: tripulanteError } = await supabase
        .from('tripulantes')
        .select('embarcacao_id, login_wifi')
        .eq('id', tripulanteId)
        .single();

      if (tripulanteError) throw tripulanteError;

      // Buscar hotspots da embarcação
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select('id')
        .eq('embarcacao_id', tripulante.embarcacao_id);

      if (hotspotsError) throw hotspotsError;

      // Criar ação pendente para cada hotspot da embarcação
      const actions = hotspots.map((hotspot) => ({
        hotspot_id: hotspot.id,
        tipo,
        payload: { ...payload, login: tripulante.login_wifi },
        status: 'pendente',
      }));

      const { data, error } = await supabase
        .from('acoes_pendentes')
        .insert(actions)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Ação enfileirada',
        description: 'A ação será executada na próxima sincronização.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar ação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
