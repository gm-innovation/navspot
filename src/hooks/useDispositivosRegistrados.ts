import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type DispositivoRegistrado = Tables<'dispositivos_registrados'>;
export type DispositivoRegistradoInsert = TablesInsert<'dispositivos_registrados'>;
export type DispositivoRegistradoUpdate = TablesUpdate<'dispositivos_registrados'>;

export interface DispositivoWithTripulante extends DispositivoRegistrado {
  tripulante?: {
    id: string;
    nome: string;
    cargo: string | null;
  };
}

export const TIPOS_DISPOSITIVO = [
  { value: 'celular', label: 'Celular' },
  { value: 'notebook', label: 'Notebook' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'outro', label: 'Outro' },
] as const;

export function useDispositivosRegistrados() {
  return useQuery({
    queryKey: ['dispositivos_registrados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dispositivos_registrados')
        .select(`
          *,
          tripulante:tripulantes(id, nome, cargo)
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
