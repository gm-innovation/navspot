import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type Hotspot = Tables<'hotspots'>;
export type HotspotInsert = TablesInsert<'hotspots'>;
export type HotspotUpdate = TablesUpdate<'hotspots'>;

export interface HotspotWithDetails extends Hotspot {
  embarcacao_nome?: string;
  empresa_nome?: string;
  active_sessions_count?: number;
}

export function useHotspots() {
  return useQuery({
    queryKey: ['hotspots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotspots')
        .select(`
          *,
          embarcacoes(nome, empresas(nome))
        `)
        .order('nome');

      if (error) throw error;
      
      return data.map((h: any) => ({
        ...h,
        embarcacao_nome: h.embarcacoes?.nome,
        empresa_nome: h.embarcacoes?.empresas?.nome,
      })) as HotspotWithDetails[];
    },
  });
}

export function useHotspot(id: string | undefined) {
  return useQuery({
    queryKey: ['hotspots', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('hotspots')
        .select(`
          *,
          embarcacoes(nome, empresas(nome))
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        return {
          ...data,
          embarcacao_nome: (data as any).embarcacoes?.nome,
          empresa_nome: (data as any).embarcacoes?.empresas?.nome,
        } as HotspotWithDetails;
      }
      return null;
    },
    enabled: !!id,
  });
}

export function useCreateHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hotspot: HotspotInsert) => {
      const { data, error } = await supabase
        .from('hotspots')
        .insert(hotspot)
        .select()
        .single();

      if (error) throw error;
      return data as Hotspot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      toast({
        title: 'Hotspot criado',
        description: 'O hotspot foi cadastrado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar hotspot',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: HotspotUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('hotspots')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Hotspot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      toast({
        title: 'Hotspot atualizado',
        description: 'Os dados do hotspot foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar hotspot',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteHotspot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hotspots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      toast({
        title: 'Hotspot excluído',
        description: 'O hotspot foi removido do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir hotspot',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export interface GeneratedScripts {
  success: boolean;
  version: string;
  infra_url: string;
  sync_url: string;
  guardian_url: string;
  bootstrap_url: string;
  expires_in_seconds: number;
  storage_path: string;
  // Legacy compat
  bootstrap_script?: string;
}

export function useGenerateHotspotScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hotspotId: string): Promise<GeneratedScripts> => {
      const { data, error } = await supabase.functions.invoke('navspot-script-gen', {
        body: { hotspot_id: hotspotId },
      });

      if (error) throw error;

      // v7.8.0 storage-first response (JSON with signed URLs)
      if (data?.success && data?.infra_url) {
        return data as GeneratedScripts;
      }

      // Legacy fallback: text/plain response
      let scriptText: string;
      if (typeof data === 'string') {
        scriptText = data;
      } else if (data && typeof data.text === 'function') {
        scriptText = await data.text();
      } else if (data?.bootstrap_script) {
        return {
          success: true,
          version: data.version || '7.7.0',
          infra_url: '', sync_url: '', guardian_url: '', bootstrap_url: '',
          expires_in_seconds: 0, storage_path: '',
          bootstrap_script: data.bootstrap_script,
        };
      } else {
        throw new Error('Formato de resposta inesperado');
      }

      return {
        success: true,
        version: scriptText.match(/v(\d+\.\d+\.\d+)/)?.[1] || '7.7.0',
        infra_url: '', sync_url: '', guardian_url: '', bootstrap_url: '',
        expires_in_seconds: 0, storage_path: '',
        bootstrap_script: scriptText,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      toast({
        title: 'Scripts gerados',
        description: 'Scripts pré-renderizados e prontos para download.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao gerar scripts',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDownloadRecoveryScript() {
  return useMutation({
    mutationFn: async (hotspotId: string) => {
      const { data, error } = await supabase.functions.invoke('mikrotik-recovery-download', {
        body: { hotspot_id: hotspotId },
      });

      if (error) throw error;
      
      // O response é o script como texto
      if (typeof data === 'string') {
        return data;
      }
      
      // Se veio como objeto com script
      if (data?.script) {
        return data.script;
      }
      
      throw new Error('Formato de resposta inválido');
    },
    onSuccess: () => {
      toast({
        title: 'Script de recovery baixado',
        description: 'Arquivo navspot-recovery.rsc pronto para importar.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao baixar recovery',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
