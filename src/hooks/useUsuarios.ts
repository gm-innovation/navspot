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

export function useUsuarios() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async (): Promise<SystemUser[]> => {
      // Get all user roles with empresa and embarcacao names
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role,
          empresa_id,
          embarcacao_id,
          created_at,
          empresas:empresa_id(nome),
          embarcacoes:embarcacao_id(nome)
        `);

      if (rolesError) {
        console.error('Error fetching user roles:', rolesError);
        throw rolesError;
      }

      // Map to SystemUser format
      const users: SystemUser[] = (userRoles || []).map((ur: any) => ({
        id: ur.user_id,
        email: '', // Will be populated if we have access
        created_at: ur.created_at,
        role: ur.role as UserRole,
        empresa_id: ur.empresa_id,
        embarcacao_id: ur.embarcacao_id,
        empresa_nome: ur.empresas?.nome || null,
        embarcacao_nome: ur.embarcacoes?.nome || null,
      }));

      return users;
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
