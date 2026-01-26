import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';

export interface AlertaFilters {
  severidade?: 'info' | 'warning' | 'critical' | null;
  tipo?: string | null;
  resolvido?: boolean | null;
  empresa_id?: string | null;
  embarcacao_id?: string | null;
  hotspot_id?: string | null;
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

export type Alerta = Tables<'alertas'> & {
  empresas?: { nome: string } | null;
  embarcacoes?: { nome: string } | null;
  hotspots?: { nome: string } | null;
  tripulantes?: { nome: string } | null;
};

export interface AlertasStats {
  total: number;
  ativos: number;
  resolvidos: number;
  criticos: number;
  avisos: number;
  info: number;
}

// Fetch alertas with filters
export function useAlertas(filters: AlertaFilters = {}) {
  return useQuery({
    queryKey: ['alertas', filters],
    queryFn: async () => {
      let query = supabase
        .from('alertas')
        .select(`
          *,
          empresas:empresa_id(nome),
          embarcacoes:embarcacao_id(nome),
          hotspots:hotspot_id(nome),
          tripulantes:tripulante_id(nome)
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.severidade) {
        query = query.eq('severidade', filters.severidade);
      }

      if (filters.tipo) {
        query = query.eq('tipo', filters.tipo);
      }

      if (filters.resolvido !== null && filters.resolvido !== undefined) {
        query = query.eq('resolvido', filters.resolvido);
      }

      if (filters.empresa_id) {
        query = query.eq('empresa_id', filters.empresa_id);
      }

      if (filters.embarcacao_id) {
        query = query.eq('embarcacao_id', filters.embarcacao_id);
      }

      if (filters.hotspot_id) {
        query = query.eq('hotspot_id', filters.hotspot_id);
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (filters.dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0);
        }

        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query.limit(200);

      if (error) {
        console.error('Error fetching alertas:', error);
        throw error;
      }

      return data as Alerta[];
    },
  });
}

// Fetch alertas statistics
export function useAlertasStats() {
  return useQuery({
    queryKey: ['alertas-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('alertas')
        .select('id, severidade, resolvido, created_at')
        .gte('created_at', today.toISOString());

      if (error) {
        console.error('Error fetching alertas stats:', error);
        throw error;
      }

      const stats: AlertasStats = {
        total: data?.length || 0,
        ativos: data?.filter(a => !a.resolvido).length || 0,
        resolvidos: data?.filter(a => a.resolvido).length || 0,
        criticos: data?.filter(a => a.severidade === 'critical' && !a.resolvido).length || 0,
        avisos: data?.filter(a => a.severidade === 'warning' && !a.resolvido).length || 0,
        info: data?.filter(a => a.severidade === 'info' && !a.resolvido).length || 0,
      };

      return stats;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Resolve a single alerta
export function useResolveAlerta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertaId: string) => {
      const { error } = await supabase
        .from('alertas')
        .update({
          resolvido: true,
          resolvido_at: new Date().toISOString(),
        })
        .eq('id', alertaId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-stats'] });
      toast({
        title: 'Alerta resolvido',
        description: 'O alerta foi marcado como resolvido.',
      });
    },
    onError: (error) => {
      console.error('Error resolving alerta:', error);
      toast({
        title: 'Erro ao resolver alerta',
        description: 'Não foi possível resolver o alerta.',
        variant: 'destructive',
      });
    },
  });
}

// Resolve multiple alertas at once
export function useResolveMultipleAlertas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertaIds: string[]) => {
      const { error } = await supabase
        .from('alertas')
        .update({
          resolvido: true,
          resolvido_at: new Date().toISOString(),
        })
        .in('id', alertaIds);

      if (error) throw error;
    },
    onSuccess: (_, alertaIds) => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-stats'] });
      toast({
        title: 'Alertas resolvidos',
        description: `${alertaIds.length} alerta(s) foram marcados como resolvidos.`,
      });
    },
    onError: (error) => {
      console.error('Error resolving alertas:', error);
      toast({
        title: 'Erro ao resolver alertas',
        description: 'Não foi possível resolver os alertas selecionados.',
        variant: 'destructive',
      });
    },
  });
}

// Delete old resolved alertas
export function useDeleteOldAlertas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (daysOld: number = 30) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabase
        .from('alertas')
        .delete()
        .eq('resolvido', true)
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-stats'] });
      toast({
        title: 'Alertas antigos excluídos',
        description: 'Os alertas resolvidos antigos foram removidos.',
      });
    },
    onError: (error) => {
      console.error('Error deleting old alertas:', error);
      toast({
        title: 'Erro ao excluir alertas',
        description: 'Não foi possível excluir os alertas antigos.',
        variant: 'destructive',
      });
    },
  });
}

// Helper to get severity display info
export function getSeveridadeInfo(severidade: string) {
  switch (severidade) {
    case 'critical':
      return {
        label: 'Crítico',
        color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
        iconColor: 'text-red-500',
      };
    case 'warning':
      return {
        label: 'Aviso',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
        iconColor: 'text-yellow-500',
      };
    case 'info':
    default:
      return {
        label: 'Info',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
        iconColor: 'text-blue-500',
      };
  }
}

// Helper to get tipo display info
export function getTipoInfo(tipo: string) {
  const tipoMap: Record<string, { label: string; description: string }> = {
    hotspot_offline: { label: 'Hotspot Offline', description: 'Hotspot sem comunicação' },
    sync_failure: { label: 'Falha de Sincronização', description: 'Erro na sincronização' },
    device_limit: { label: 'Limite de Dispositivos', description: 'Limite excedido' },
    quota_warning: { label: 'Quota 80%', description: '80% da quota atingida' },
    quota_exceeded: { label: 'Quota Excedida', description: '100% da quota atingida' },
    new_registration: { label: 'Novo Cadastro', description: 'Nova entidade cadastrada' },
    session_anomaly: { label: 'Anomalia', description: 'Comportamento suspeito' },
    device_sharing: { label: 'Compartilhamento', description: 'MAC usado por outro tripulante' },
    blocked_device_attempt: { label: 'Dispositivo Bloqueado', description: 'Tentativa de conexão bloqueada' },
  };

  return tipoMap[tipo] || { label: tipo, description: 'Alerta do sistema' };
}

// Helper to extract MAC address from alert message
export function extractMacFromMessage(message: string): string | null {
  const macRegex = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/;
  const match = message.match(macRegex);
  return match ? match[0] : null;
}
