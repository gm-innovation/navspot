import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type PerfilVelocidade = Tables<'perfis_velocidade'>;
export type PerfilVelocidadeInsert = TablesInsert<'perfis_velocidade'>;
export type PerfilVelocidadeUpdate = TablesUpdate<'perfis_velocidade'>;

// Categoria de tipos de usuário/equipamento
export type TipoUsuarioCategoria = 'tripulante' | 'equipamento';

export const TIPOS_USUARIO = [
  // Tripulantes
  { value: 'tripulante', label: 'Tripulante', categoria: 'tripulante' as TipoUsuarioCategoria },
  { value: 'comandante', label: 'Comandante', categoria: 'tripulante' as TipoUsuarioCategoria },
  { value: 'chemaq', label: 'Chefe de Máquinas', categoria: 'tripulante' as TipoUsuarioCategoria },
  { value: 'imediato', label: 'Imediato', categoria: 'tripulante' as TipoUsuarioCategoria },
  { value: 'oficial', label: 'Oficial', categoria: 'tripulante' as TipoUsuarioCategoria },
  { value: 'convidado', label: 'Convidado', categoria: 'tripulante' as TipoUsuarioCategoria },
  // Equipamentos
  { value: 'camera_streaming', label: 'Câmera/Streaming', categoria: 'equipamento' as TipoUsuarioCategoria, uploadPrioritario: true },
  { value: 'equipamento_navegacao', label: 'Equipamento de Navegação', categoria: 'equipamento' as TipoUsuarioCategoria },
  { value: 'equipamento_rede', label: 'Equipamento de Rede', categoria: 'equipamento' as TipoUsuarioCategoria },
] as const;

// Helper para filtrar por categoria
export function getTiposUsuarioByCategoria(categoria: TipoUsuarioCategoria) {
  return TIPOS_USUARIO.filter(t => t.categoria === categoria);
}

export const PERIODOS_QUOTA = [
  { value: 'hora', label: 'Por Hora', description: 'Renova a cada hora cheia' },
  { value: 'diario', label: 'Diário', description: 'Renova à meia-noite' },
  { value: 'semanal', label: 'Semanal', description: 'Renova toda segunda-feira' },
  { value: 'mensal', label: 'Mensal', description: 'Renova no dia 1' },
] as const;

export const TIMEZONES_BRASIL = [
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)', offset: -2 },
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)', offset: -3 },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)', offset: -4 },
  { value: 'America/Rio_Branco', label: 'Acre (UTC-5)', offset: -5 },
] as const;

export const MODOS_ACESSO = [
  { value: 'permitir_tudo', label: 'Permitir Tudo (bloquear exceções)' },
  { value: 'bloquear_tudo', label: 'Bloquear Tudo (permitir exceções)' },
] as const;

export interface PerfilWithCount extends PerfilVelocidade {
  tripulantes_count?: number;
}

export function usePerfisVelocidade() {
  return useQuery({
    queryKey: ['perfis_velocidade'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfis_velocidade')
        .select(`
          *,
          tripulantes(id)
        `)
        .order('prioridade');

      if (error) throw error;
      
      return data.map((p: any) => ({
        ...p,
        tripulantes_count: p.tripulantes?.length || 0,
      })) as PerfilWithCount[];
    },
  });
}

export function usePerfilVelocidade(id: string | undefined) {
  return useQuery({
    queryKey: ['perfis_velocidade', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('perfis_velocidade')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as PerfilVelocidade | null;
    },
    enabled: !!id,
  });
}

export function useCreatePerfilVelocidade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (perfil: PerfilVelocidadeInsert) => {
      const { data, error } = await supabase
        .from('perfis_velocidade')
        .insert(perfil)
        .select()
        .single();

      if (error) throw error;
      return data as PerfilVelocidade;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfis_velocidade'] });
      toast({
        title: 'Perfil criado',
        description: 'O perfil de velocidade foi cadastrado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar perfil',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdatePerfilVelocidade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PerfilVelocidadeUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('perfis_velocidade')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PerfilVelocidade;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfis_velocidade'] });
      toast({
        title: 'Perfil atualizado',
        description: 'Os dados do perfil foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar perfil',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeletePerfilVelocidade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('perfis_velocidade')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfis_velocidade'] });
      toast({
        title: 'Perfil excluído',
        description: 'O perfil de velocidade foi removido do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir perfil',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
