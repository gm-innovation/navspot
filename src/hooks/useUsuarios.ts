import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { UserRole } from '@/contexts/AuthContext';

export interface SystemUser {
  id: string;
  email: string;
  created_at: string;
  role: UserRole | null;
  empresa_id: string | null;
  embarcacao_id: string | null;
  empresa_nome?: string;
  embarcacao_nome?: string;
}

interface CreateUserData {
  email: string;
  password: string;
  role: UserRole;
  empresa_id?: string;
  embarcacao_id?: string;
}

interface UpdateUserData {
  user_id: string;
  role: UserRole;
  empresa_id?: string | null;
  embarcacao_id?: string | null;
}

export function useUsuarios() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async (): Promise<SystemUser[]> => {
      // Use edge function to get users with emails
      const { data: response, error } = await supabase.functions.invoke('list-users');

      if (error) {
        console.error('Error fetching users:', error);
        throw new Error(error.message || 'Erro ao buscar usuários');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      return response?.users || [];
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      const { data: response, error } = await supabase.functions.invoke('create-user', {
        body: data,
      });

      if (error) {
        throw new Error(error.message || 'Erro ao criar usuário');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast({
        title: 'Usuário criado',
        description: 'O usuário foi criado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: UpdateUserData) => {
      const { data: response, error } = await supabase.functions.invoke('update-user', {
        body: data,
      });

      if (error) {
        throw new Error(error.message || 'Erro ao atualizar usuário');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast({
        title: 'Usuário atualizado',
        description: 'O usuário foi atualizado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data: response, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userId },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao excluir usuário');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast({
        title: 'Usuário excluído',
        description: 'O usuário foi excluído com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
