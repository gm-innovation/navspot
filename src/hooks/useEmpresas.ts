import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type Empresa = Tables<'empresas'>;
export type EmpresaInsert = TablesInsert<'empresas'>;
export type EmpresaUpdate = TablesUpdate<'empresas'>;

export function useEmpresas() {
  return useQuery({
    queryKey: ['empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nome');

      if (error) throw error;
      return data as Empresa[];
    },
  });
}

export function useEmpresa(id: string | undefined) {
  return useQuery({
    queryKey: ['empresas', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Empresa | null;
    },
    enabled: !!id,
  });
}

export function useCreateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (empresa: EmpresaInsert) => {
      const { data, error } = await supabase
        .from('empresas')
        .insert(empresa)
        .select()
        .single();

      if (error) throw error;
      return data as Empresa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast({
        title: 'Empresa criada',
        description: 'A empresa foi cadastrada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar empresa',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: EmpresaUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('empresas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Empresa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast({
        title: 'Empresa atualizada',
        description: 'Os dados da empresa foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar empresa',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('empresas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast({
        title: 'Empresa excluída',
        description: 'A empresa foi removida do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir empresa',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
