import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { Tables } from '@/integrations/supabase/types';

export type NotificationAlerta = Tables<'alertas'> & {
  empresas?: { nome: string } | null;
  embarcacoes?: { nome: string } | null;
  hotspots?: { nome: string } | null;
};

export interface NotificationsData {
  unreadCount: number;
  notifications: NotificationAlerta[];
}

// Hook para buscar notificações (alertas não resolvidos)
export function useNotifications(limit: number = 5) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', limit],
    queryFn: async (): Promise<NotificationsData> => {
      // Buscar contagem total de não resolvidos
      const { count, error: countError } = await supabase
        .from('alertas')
        .select('*', { count: 'exact', head: true })
        .eq('resolvido', false);

      if (countError) {
        console.error('Error fetching notifications count:', countError);
        throw countError;
      }

      // Buscar últimos N alertas não resolvidos
      const { data, error } = await supabase
        .from('alertas')
        .select(`
          *,
          empresas:empresa_id(nome),
          embarcacoes:embarcacao_id(nome),
          hotspots:hotspot_id(nome)
        `)
        .eq('resolvido', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching notifications:', error);
        throw error;
      }

      return {
        unreadCount: count || 0,
        notifications: data as NotificationAlerta[],
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Realtime subscription for new alerts
  useEffect(() => {
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alertas',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['alertas'] });
          queryClient.invalidateQueries({ queryKey: ['alertas-stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// Helper to get severity color
export function getSeverityColor(severidade: string) {
  switch (severidade) {
    case 'critical':
      return 'text-red-500';
    case 'warning':
      return 'text-yellow-500';
    case 'info':
    default:
      return 'text-blue-500';
  }
}

// Helper to get severity badge classes
export function getSeverityBadgeClasses(severidade: string) {
  switch (severidade) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'info':
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
  }
}
