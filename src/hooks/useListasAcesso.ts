import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';
import { createMikrotikActionForEmpresa } from '@/hooks/useMikrotikSync';

export type ListaAcesso = Tables<'listas_acesso'>;
export type ListaAcessoInsert = TablesInsert<'listas_acesso'>;
export type ListaAcessoUpdate = TablesUpdate<'listas_acesso'>;

export interface ListaWithRulesCount extends ListaAcesso {
  regras_count?: number;
}

// Templates predefinidos de listas de acesso
export const TEMPLATES_LISTAS = [
  {
    nome: 'Comunicação - WhatsApp',
    descricao: 'Acesso ao WhatsApp Web e aplicativo',
    tipo: 'whitelist',
    aplicativos: ['whatsapp'],
    dominios: ['*.whatsapp.net', 'web.whatsapp.com', '*.whatsapp.com', 'static.whatsapp.net'],
    portas: [],
  },
  {
    nome: 'Comunicação - Email',
    descricao: 'Acesso a serviços de email populares',
    tipo: 'whitelist',
    aplicativos: ['email'],
    dominios: ['*.gmail.com', 'mail.google.com', '*.outlook.com', 'outlook.live.com', '*.yahoo.com'],
    portas: [{ porta: 993, protocolo: 'tcp' }, { porta: 587, protocolo: 'tcp' }, { porta: 465, protocolo: 'tcp' }],
  },
  {
    nome: 'Comunicação - Telegram',
    descricao: 'Acesso ao Telegram',
    tipo: 'whitelist',
    aplicativos: ['telegram'],
    dominios: ['*.telegram.org', '*.t.me', 'telegram.me'],
    portas: [],
  },
  {
    nome: 'Redes Sociais',
    descricao: 'Redes sociais populares (Facebook, Instagram, Twitter)',
    tipo: 'blacklist',
    aplicativos: ['facebook', 'instagram', 'twitter', 'tiktok'],
    dominios: [
      '*.facebook.com', '*.fbcdn.net', '*.fb.com',
      '*.instagram.com', '*.cdninstagram.com',
      '*.twitter.com', '*.x.com', '*.twimg.com',
      '*.tiktok.com', '*.tiktokcdn.com'
    ],
    portas: [],
  },
  {
    nome: 'Streaming de Vídeo',
    descricao: 'YouTube, Netflix, Prime Video e outros',
    tipo: 'blacklist',
    aplicativos: ['youtube', 'netflix', 'primevideo'],
    dominios: [
      '*.youtube.com', '*.googlevideo.com', '*.ytimg.com',
      '*.netflix.com', '*.nflxvideo.net',
      '*.primevideo.com', '*.aiv-cdn.net'
    ],
    portas: [],
  },
  {
    nome: 'Streaming de Música',
    descricao: 'Spotify, Deezer e outros',
    tipo: 'blacklist',
    aplicativos: ['spotify', 'deezer'],
    dominios: ['*.spotify.com', '*.scdn.co', '*.deezer.com'],
    portas: [],
  },
  {
    nome: 'Trabalho - Google Workspace',
    descricao: 'Google Drive, Docs, Sheets, Meet',
    tipo: 'whitelist',
    aplicativos: ['google-workspace'],
    dominios: ['*.google.com', '*.googleapis.com', '*.gstatic.com', 'meet.google.com'],
    portas: [],
  },
  {
    nome: 'Trabalho - Microsoft 365',
    descricao: 'Office, OneDrive, Teams',
    tipo: 'whitelist',
    aplicativos: ['microsoft-365'],
    dominios: ['*.office.com', '*.microsoft.com', '*.office365.com', '*.sharepoint.com', 'teams.microsoft.com'],
    portas: [],
  },
] as const;

export function useListasAcesso() {
  return useQuery({
    queryKey: ['listas_acesso'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listas_acesso')
        .select(`
          *,
          regras_acesso(id)
        `)
        .order('nome');

      if (error) throw error;
      
      return data.map((lista: any) => ({
        ...lista,
        regras_count: lista.regras_acesso?.length || 0,
      })) as ListaWithRulesCount[];
    },
  });
}

export function useListasAcessoByEmpresa(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['listas_acesso', 'empresa', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      
      const { data, error } = await supabase
        .from('listas_acesso')
        .select('id, nome, tipo, descricao, ativo')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });
}

export function useListasAplicadasByHotspot(hotspotId: string | undefined) {
  return useQuery({
    queryKey: ['listas_aplicadas', 'hotspot', hotspotId],
    queryFn: async () => {
      if (!hotspotId) return [];
      
      const { data, error } = await supabase
        .from('regras_acesso')
        .select('lista_id')
        .eq('hotspot_id', hotspotId);

      if (error) throw error;
      return data.map(r => r.lista_id);
    },
    enabled: !!hotspotId,
  });
}

export function useListaAcesso(id: string | undefined) {
  return useQuery({
    queryKey: ['listas_acesso', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('listas_acesso')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as ListaAcesso | null;
    },
    enabled: !!id,
  });
}

export function useCreateListaAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lista: ListaAcessoInsert) => {
      const { data, error } = await supabase
        .from('listas_acesso')
        .insert(lista)
        .select()
        .single();

      if (error) throw error;

      // Trigger firewall update on all hotspots
      try {
        await createMikrotikActionForEmpresa({
          empresaId: data.empresa_id,
          tipo: 'update_firewall_rules',
          payload: { 
            lista_id: data.id,
            action: 'add',
            tipo: data.tipo,
            dominios: data.dominios,
          },
        });
      } catch (actionError) {
        console.error('[useListasAcesso] Failed to create MikroTik action:', actionError);
      }

      return data as ListaAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listas_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Lista criada',
        description: 'A lista de acesso foi cadastrada e será sincronizada.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar lista',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateListaAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ListaAcessoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('listas_acesso')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Trigger firewall update on all hotspots
      try {
        await createMikrotikActionForEmpresa({
          empresaId: data.empresa_id,
          tipo: 'update_firewall_rules',
          payload: { 
            lista_id: data.id,
            action: 'update',
            tipo: data.tipo,
            dominios: data.dominios,
          },
        });
      } catch (actionError) {
        console.error('[useListasAcesso] Failed to create MikroTik action:', actionError);
      }

      return data as ListaAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listas_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Lista atualizada',
        description: 'A lista de acesso foi atualizada.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar lista',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteListaAcesso() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch lista data before deleting
      const { data: lista, error: fetchError } = await supabase
        .from('listas_acesso')
        .select('empresa_id, dominios, tipo')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('listas_acesso')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Trigger firewall update on all hotspots
      if (lista) {
        try {
          await createMikrotikActionForEmpresa({
            empresaId: lista.empresa_id,
            tipo: 'update_firewall_rules',
            payload: { 
              lista_id: id,
              action: 'remove',
              tipo: lista.tipo,
              dominios: lista.dominios,
            },
          });
        } catch (actionError) {
          console.error('[useListasAcesso] Failed to create MikroTik action:', actionError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listas_acesso'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Lista excluída',
        description: 'A lista de acesso foi removida do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir lista',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCreateListaFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ template, empresaId }: { template: typeof TEMPLATES_LISTAS[number]; empresaId: string }) => {
      const { data, error } = await supabase
        .from('listas_acesso')
        .insert({
          empresa_id: empresaId,
          nome: template.nome,
          descricao: template.descricao,
          tipo: template.tipo,
          dominios: template.dominios as unknown as Json,
          aplicativos: template.aplicativos as unknown as Json,
          portas: template.portas as unknown as Json,
          is_template: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ListaAcesso;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listas_acesso'] });
      toast({
        title: 'Lista criada a partir do template',
        description: 'A lista de acesso foi criada com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar lista',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
