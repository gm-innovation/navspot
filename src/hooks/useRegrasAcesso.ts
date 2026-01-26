import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type RegraAcesso = Tables<'regras_acesso'>;
export type RegraAcessoInsert = TablesInsert<'regras_acesso'>;
export type RegraAcessoUpdate = TablesUpdate<'regras_acesso'>;

export interface RegraWithRelations extends RegraAcesso {
  lista?: {
    id: string;
    nome: string;
    tipo: string;
  };
  perfil?: {
    id: string;
    nome: string;
  };
  tripulante?: {
    id: string;
    nome: string;
  };
  hotspot?: {
    id: string;
    nome: string;
  };
}

export const DIAS_SEMANA = [
  { value: 'seg', label: 'Segunda' },
  { value: 'ter', label: 'Terça' },
  { value: 'qua', label: 'Quarta' },
  { value: 'qui', label: 'Quinta' },
  { value: 'sex', label: 'Sexta' },
  { value: 'sab', label: 'Sábado' },
  { value: 'dom', label: 'Domingo' },
] as const;

export function useRegrasAcesso() {
  return useQuery({
    queryKey: ['regras_acesso'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('regras_acesso')
        .select(`
          *,
          lista:listas_acesso(id, nome, tipo),
          perfil:perfis_velocidade(id, nome),
          tripulante:tripulantes(id, nome),
          hotspot:hotspots(id, nome)
        `)
        .order('prioridade');

      if (error) throw error;
      return data as RegraWithRelations[];
    },
  });
}

export function useRegraAcesso(id: string | undefined) {
  return useQuery({
    queryKey: ['regras_acesso', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('regras_acesso')
        .select(`
          *,
          lista:listas_acesso(id, nome, tipo),
          perfil:perfis_velocidade(id, nome),
          tripulante:tripulantes(id, nome),
          hotspot:hotspots(id, nome)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as RegraWithRelations | null;
    },
    enabled: !!id,
  });
}

export function useCreateRegraAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (regra: RegraAcessoInsert) => {
      const { data, error } = await supabase
        .from('regras_acesso')
        .insert(regra)
        .select()
        .single();

      if (error) throw error;
      return data as RegraAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Regra criada',
        description: 'A regra de acesso foi cadastrada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar regra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateRegraAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: RegraAcessoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('regras_acesso')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as RegraAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Regra atualizada',
        description: 'A regra de acesso foi atualizada.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar regra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteRegraAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('regras_acesso')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Regra excluída',
        description: 'A regra de acesso foi removida do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir regra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateRegrasPrioridade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (regras: { id: string; prioridade: number }[]) => {
      const updates = regras.map((regra) =>
        supabase
          .from('regras_acesso')
          .update({ prioridade: regra.prioridade })
          .eq('id', regra.id)
      );

      const results = await Promise.all(updates);
      const errors = results.filter((r) => r.error);
      
      if (errors.length > 0) {
        throw new Error('Erro ao atualizar prioridades');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Prioridades atualizadas',
        description: 'As prioridades das regras foram reordenadas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar prioridades',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
