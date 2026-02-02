import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { createMikrotikActionForEmpresa } from '@/hooks/useMikrotikSync';

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

      // P1 Fix: Buscar dados da lista para incluir no payload
      try {
        const { data: lista } = await supabase
          .from('listas_acesso')
          .select('dominios, tipo, nome')
          .eq('id', data.lista_id)
          .single();

        if (lista && Array.isArray(lista.dominios) && lista.dominios.length > 0) {
          // Criar ação com payload expandido contendo domínios
          await createMikrotikActionForEmpresa({
            empresaId: data.empresa_id,
            tipo: lista.tipo === 'whitelist' ? 'add_walled_garden' : 'add_firewall_filter',
            payload: { 
              lista_name: lista.nome,
              tipo: lista.tipo,
              dominios: lista.dominios,
              perfil_id: data.perfil_id,
              regra_id: data.id,
            },
          });
        }
      } catch (actionError) {
        console.error('[useRegrasAcesso] Failed to create MikroTik action:', actionError);
      }

      return data as RegraAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Regra criada',
        description: 'A regra de acesso foi cadastrada e será sincronizada.',
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

export function useCreateMultipleRegras() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (regras: RegraAcessoInsert[]) => {
      const { data, error } = await supabase
        .from('regras_acesso')
        .insert(regras)
        .select();

      if (error) throw error;

      // P1 Fix: Para cada regra criada, buscar domínios e criar ações expandidas
      if (data && data.length > 0) {
        const empresaId = data[0].empresa_id;
        
        // Coletar todos os lista_ids únicos
        const listaIds = [...new Set(data.map(r => r.lista_id))];
        
        // Buscar todas as listas de uma vez
        const { data: listas } = await supabase
          .from('listas_acesso')
          .select('id, dominios, tipo, nome')
          .in('id', listaIds);
        
        if (listas) {
          const listasMap = new Map(listas.map(l => [l.id, l]));
          
          for (const regra of data) {
            const lista = listasMap.get(regra.lista_id);
            
            if (lista && Array.isArray(lista.dominios) && lista.dominios.length > 0) {
              try {
                await createMikrotikActionForEmpresa({
                  empresaId,
                  tipo: lista.tipo === 'whitelist' ? 'add_walled_garden' : 'add_firewall_filter',
                  payload: { 
                    lista_name: lista.nome,
                    tipo: lista.tipo,
                    dominios: lista.dominios,
                    perfil_id: regra.perfil_id,
                    regra_id: regra.id,
                  },
                });
              } catch (actionError) {
                console.error('[useRegrasAcesso] Failed to create MikroTik action:', actionError);
              }
            }
          }
        }
      }

      return data as RegraAcesso[];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Regras criadas',
        description: `${data.length} regra(s) de acesso foram cadastradas.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar regras',
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

      // P1 Fix: Buscar dados da lista para incluir no payload
      try {
        const { data: lista } = await supabase
          .from('listas_acesso')
          .select('dominios, tipo, nome')
          .eq('id', data.lista_id)
          .single();

        if (lista && Array.isArray(lista.dominios) && lista.dominios.length > 0) {
          await createMikrotikActionForEmpresa({
            empresaId: data.empresa_id,
            tipo: lista.tipo === 'whitelist' ? 'add_walled_garden' : 'add_firewall_filter',
            payload: { 
              lista_name: lista.nome,
              tipo: lista.tipo,
              dominios: lista.dominios,
              perfil_id: data.perfil_id,
              regra_id: data.id,
              action: 'update',
            },
          });
        }
      } catch (actionError) {
        console.error('[useRegrasAcesso] Failed to create MikroTik action:', actionError);
      }

      return data as RegraAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
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
      // Fetch regra data before deleting
      const { data: regra, error: fetchError } = await supabase
        .from('regras_acesso')
        .select('empresa_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('regras_acesso')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Trigger firewall update
      if (regra) {
        try {
          await createMikrotikActionForEmpresa({
            empresaId: regra.empresa_id,
            tipo: 'remove_firewall_rule',
            payload: { regra_id: id, action: 'remove' },
          });
        } catch (actionError) {
          console.error('[useRegrasAcesso] Failed to create MikroTik action:', actionError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
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

export function useRegrasByPerfil(perfilId: string | undefined) {
  return useQuery({
    queryKey: ['regras_acesso', 'by_perfil', perfilId],
    queryFn: async () => {
      if (!perfilId) return [];
      
      const { data, error } = await supabase
        .from('regras_acesso')
        .select(`
          *,
          lista:listas_acesso(id, nome, tipo)
        `)
        .eq('perfil_id', perfilId)
        .order('prioridade');

      if (error) throw error;
      return data as (RegraAcesso & { lista: { id: string; nome: string; tipo: string } | null })[];
    },
    enabled: !!perfilId,
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
