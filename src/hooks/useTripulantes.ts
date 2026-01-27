import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { createMikrotikAction, toProfileSlug } from '@/hooks/useMikrotikSync';

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
      // Insert tripulante in database
      const { data, error } = await supabase
        .from('tripulantes')
        .insert(tripulante)
        .select(`
          *,
          perfis_velocidade(nome)
        `)
        .single();

      if (error) throw error;

      // Create MikroTik action to add user
      const perfilNome = (data as any).perfis_velocidade?.nome;
      const profileSlug = perfilNome ? toProfileSlug(perfilNome) : 'default';

      try {
        await createMikrotikAction({
          embarcacaoId: data.embarcacao_id,
          tipo: 'create_user',
          payload: {
            user: data.login_wifi,
            password: data.senha_wifi,
            profile: profileSlug,
          },
        });
      } catch (actionError) {
        console.error('[useTripulantes] Failed to create MikroTik action:', actionError);
        // Don't throw - tripulante was created, just log the sync error
      }

      return data as Tripulante;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Tripulante criado',
        description: 'O tripulante foi cadastrado e será sincronizado com o MikroTik.',
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
      // Fetch old data to detect what changed
      const { data: oldData, error: oldError } = await supabase
        .from('tripulantes')
        .select(`
          login_wifi, senha_wifi, perfil_id, embarcacao_id, status,
          perfis_velocidade(nome)
        `)
        .eq('id', id)
        .single();

      if (oldError) throw oldError;

      // Update tripulante
      const { data, error } = await supabase
        .from('tripulantes')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          perfis_velocidade(nome)
        `)
        .single();

      if (error) throw error;

      // Create MikroTik actions based on what changed
      try {
        // Password changed
        if (updates.senha_wifi && updates.senha_wifi !== oldData.senha_wifi) {
          await createMikrotikAction({
            embarcacaoId: oldData.embarcacao_id,
            tipo: 'update_password',
            payload: {
              user: oldData.login_wifi,
              password: updates.senha_wifi,
            },
          });
        }

        // Profile changed
        if (updates.perfil_id && updates.perfil_id !== oldData.perfil_id) {
          const newPerfilNome = (data as any).perfis_velocidade?.nome;
          const profileSlug = newPerfilNome ? toProfileSlug(newPerfilNome) : 'default';
          
          await createMikrotikAction({
            embarcacaoId: oldData.embarcacao_id,
            tipo: 'update_user_profile',
            payload: {
              user: oldData.login_wifi,
              profile: profileSlug,
            },
          });
        }

        // Status changed (block/unblock)
        if (updates.status && updates.status !== oldData.status) {
          if (updates.status === 'bloqueado' || updates.status === 'inativo') {
            await createMikrotikAction({
              embarcacaoId: oldData.embarcacao_id,
              tipo: 'disable_user',
              payload: { user: oldData.login_wifi },
            });
          } else if (updates.status === 'ativo' && (oldData.status === 'bloqueado' || oldData.status === 'inativo')) {
            await createMikrotikAction({
              embarcacaoId: oldData.embarcacao_id,
              tipo: 'enable_user',
              payload: { user: oldData.login_wifi },
            });
          }
        }
      } catch (actionError) {
        console.error('[useTripulantes] Failed to create MikroTik action:', actionError);
      }

      return data as Tripulante;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
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
      // Fetch tripulante data before deleting
      const { data: tripulante, error: fetchError } = await supabase
        .from('tripulantes')
        .select('login_wifi, embarcacao_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Delete from database
      const { error } = await supabase
        .from('tripulantes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Create MikroTik action to remove user
      if (tripulante) {
        try {
          await createMikrotikAction({
            embarcacaoId: tripulante.embarcacao_id,
            tipo: 'remove_user',
            payload: { user: tripulante.login_wifi },
          });
        } catch (actionError) {
          console.error('[useTripulantes] Failed to create MikroTik action:', actionError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripulantes'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
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

// Hook para criar ações pendentes manuais (bloquear, kick, etc.)
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
      // Fetch tripulante data
      const { data: tripulante, error: tripulanteError } = await supabase
        .from('tripulantes')
        .select('embarcacao_id, login_wifi')
        .eq('id', tripulanteId)
        .single();

      if (tripulanteError) throw tripulanteError;

      // Create action using centralized function
      await createMikrotikAction({
        embarcacaoId: tripulante.embarcacao_id,
        tipo: tipo as any,
        payload: { ...payload, user: tripulante.login_wifi },
      });

      return { success: true };
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
