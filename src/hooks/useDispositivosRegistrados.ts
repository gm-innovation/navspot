import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createMikrotikAction, createMikrotikActionForHotspot } from '@/hooks/useMikrotikSync';

export type DispositivoRegistrado = Tables<'dispositivos_registrados'>;
export type DispositivoRegistradoInsert = TablesInsert<'dispositivos_registrados'>;
export type DispositivoRegistradoUpdate = TablesUpdate<'dispositivos_registrados'>;

export interface DispositivoWithTripulante extends DispositivoRegistrado {
  tripulante?: {
    id: string;
    nome: string;
    cargo: string | null;
  } | null;
  embarcacao?: {
    id: string;
    nome: string;
  } | null;
  perfil?: {
    id: string;
    nome: string;
    velocidade_download: string;
    velocidade_upload: string;
    limite_dados_mb: number | null;
  } | null;
}

// Categoria de tipos de dispositivo
export type TipoDispositivoCategoria = 'pessoal' | 'embarcacao' | 'outro';

export const TIPOS_DISPOSITIVO = [
  // Dispositivos pessoais (tripulantes)
  { value: 'celular', label: 'Celular', categoria: 'pessoal' as TipoDispositivoCategoria },
  { value: 'notebook', label: 'Notebook', categoria: 'pessoal' as TipoDispositivoCategoria },
  { value: 'tablet', label: 'Tablet', categoria: 'pessoal' as TipoDispositivoCategoria },
  { value: 'desktop', label: 'Desktop', categoria: 'pessoal' as TipoDispositivoCategoria },
  // Equipamentos de embarcação
  { value: 'camera', label: 'Câmera de Segurança', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'radar', label: 'Radar', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'gps', label: 'GPS/AIS', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'ecdis', label: 'ECDIS', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'vdr', label: 'VDR (Caixa Preta)', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'roteador', label: 'Roteador/Switch', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'passadico', label: 'Notebook Passadiço', categoria: 'embarcacao' as TipoDispositivoCategoria },
  { value: 'streaming', label: 'Equipamento Streaming', categoria: 'embarcacao' as TipoDispositivoCategoria },
  // Outros
  { value: 'outro', label: 'Outro', categoria: 'outro' as TipoDispositivoCategoria },
] as const;

// Helper para obter dispositivos por categoria
export function getDispositivosByCategoria(categoria: TipoDispositivoCategoria) {
  return TIPOS_DISPOSITIVO.filter(t => t.categoria === categoria);
}

// Fetch all dispositivos with tripulante and embarcacao info
export function useDispositivosRegistrados() {
  return useQuery({
    queryKey: ['dispositivos_registrados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .select(`
          *,
          tripulante:tripulantes(id, nome, cargo),
          embarcacao:embarcacoes(id, nome),
          perfil:perfis_velocidade(id, nome, velocidade_download, velocidade_upload, limite_dados_mb)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DispositivoWithTripulante[];
    },
  });
}

export function useDispositivosByTripulante(tripulanteId: string | undefined) {
  return useQuery({
    queryKey: ['dispositivos_registrados', 'tripulante', tripulanteId],
    queryFn: async () => {
      if (!tripulanteId) return [];
      
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .select('*')
        .eq('tripulante_id', tripulanteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DispositivoRegistrado[];
    },
    enabled: !!tripulanteId,
  });
}

export function useDispositivosByEmbarcacao(embarcacaoId: string | undefined) {
  return useQuery({
    queryKey: ['dispositivos_registrados', 'embarcacao', embarcacaoId],
    queryFn: async () => {
      if (!embarcacaoId) return [];
      
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .select(`
          *,
          tripulante:tripulantes(id, nome, cargo)
        `)
        .eq('embarcacao_id', embarcacaoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DispositivoWithTripulante[];
    },
    enabled: !!embarcacaoId,
  });
}

export function useCreateDispositivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dispositivo: DispositivoRegistradoInsert) => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .insert(dispositivo)
        .select()
        .single();

      if (error) throw error;
      return data as DispositivoRegistrado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      toast({
        title: 'Dispositivo registrado',
        description: 'O dispositivo foi cadastrado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao registrar dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDispositivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: DispositivoRegistradoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as DispositivoRegistrado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      toast({
        title: 'Dispositivo atualizado',
        description: 'Os dados do dispositivo foram atualizados.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteDispositivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dispositivos_registrados')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      toast({
        title: 'Dispositivo removido',
        description: 'O dispositivo foi removido do sistema.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao remover dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useToggleDispositivoAutorizacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, autorizado }: { id: string; autorizado: boolean }) => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .update({ autorizado })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as DispositivoRegistrado;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      toast({
        title: data.autorizado ? 'Dispositivo autorizado' : 'Dispositivo bloqueado',
        description: data.autorizado 
          ? 'O dispositivo foi autorizado a conectar.'
          : 'O dispositivo foi bloqueado.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao alterar autorização',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Block device with reason and audit
export function useBlockDispositivo() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ id, bloqueio_motivo }: { id: string; bloqueio_motivo: string }) => {
      // Fetch device data first
      const { data: device, error: fetchError } = await supabase
        .from('dispositivos_registrados')
        .select('mac_address, embarcacao_id, tripulante_id, tripulantes(embarcacao_id)')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .update({
          autorizado: false,
          bloqueio_motivo,
          bloqueado_por: session?.user?.id || null,
          bloqueado_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create MikroTik action to block device
      const embarcacaoId = device.embarcacao_id || (device.tripulantes as any)?.embarcacao_id;
      if (embarcacaoId) {
        try {
          await createMikrotikAction({
            embarcacaoId,
            tipo: 'block_device',
            payload: { mac: device.mac_address },
          });
        } catch (actionError) {
          console.error('[useDispositivos] Failed to create MikroTik action:', actionError);
        }
      }

      return data as DispositivoRegistrado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Dispositivo bloqueado',
        description: 'O dispositivo foi bloqueado e não poderá se conectar.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao bloquear dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Unblock device clearing audit fields
export function useUnblockDispositivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch device data first
      const { data: device, error: fetchError } = await supabase
        .from('dispositivos_registrados')
        .select('mac_address, embarcacao_id, tripulante_id, tripulantes(embarcacao_id)')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .update({
          autorizado: true,
          bloqueio_motivo: null,
          bloqueado_por: null,
          bloqueado_at: null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create MikroTik action to unblock device
      const embarcacaoId = device.embarcacao_id || (device.tripulantes as any)?.embarcacao_id;
      if (embarcacaoId) {
        try {
          await createMikrotikAction({
            embarcacaoId,
            tipo: 'unblock_device',
            payload: { mac: device.mac_address },
          });
        } catch (actionError) {
          console.error('[useDispositivos] Failed to create MikroTik action:', actionError);
        }
      }

      return data as DispositivoRegistrado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
      toast({
        title: 'Dispositivo desbloqueado',
        description: 'O dispositivo foi autorizado a conectar novamente.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao desbloquear dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Block device by MAC address (for use from alerts)
export function useBlockDispositivoByMac() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ mac_address, bloqueio_motivo }: { mac_address: string; bloqueio_motivo: string }) => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .update({
          autorizado: false,
          bloqueio_motivo,
          bloqueado_por: session?.user?.id || null,
          bloqueado_at: new Date().toISOString(),
        })
        .eq('mac_address', mac_address)
        .select()
        .single();

      if (error) throw error;
      return data as DispositivoRegistrado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispositivos_registrados'] });
      toast({
        title: 'Dispositivo bloqueado',
        description: 'O dispositivo foi bloqueado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao bloquear dispositivo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Formatar bytes para exibição
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Formatar MAC address
export function formatMacAddress(mac: string): string {
  return mac.toUpperCase().replace(/[^A-F0-9]/g, '').match(/.{1,2}/g)?.join(':') || mac;
}
