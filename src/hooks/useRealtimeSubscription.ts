import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';

type SubscriptionConfig = {
  table: string;
  queryKey: string[];
  showToast?: boolean;
  toastMessages?: {
    INSERT?: string;
    UPDATE?: string;
    DELETE?: string;
  };
};

export function useRealtimeSubscription(configs: SubscriptionConfig[]) {
  const queryClient = useQueryClient();
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    // Cleanup existing subscriptions
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Create new subscriptions
    configs.forEach(config => {
      const channel = supabase
        .channel(`realtime-${config.table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: config.table,
          },
          (payload) => {
            // Invalidate the query to refetch data
            queryClient.invalidateQueries({ queryKey: config.queryKey });

            // Show toast notification if enabled
            if (config.showToast && config.toastMessages) {
              const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const message = config.toastMessages[event];
              if (message) {
                toast({
                  title: message,
                  description: `Atualização em tempo real recebida.`,
                });
              }
            }
          }
        )
        .subscribe();

      channelsRef.current.push(channel);
    });

    // Cleanup on unmount
    return () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [configs, queryClient]);
}

// Simplified hook for single table subscription
export function useTableRealtime(
  table: string, 
  queryKey: string[],
  options?: {
    showToast?: boolean;
  }
) {
  useRealtimeSubscription([
    {
      table,
      queryKey,
      showToast: options?.showToast,
    },
  ]);
}

// Hook specifically for hotspots realtime updates
export function useHotspotsRealtime() {
  useRealtimeSubscription([
    {
      table: 'hotspots',
      queryKey: ['hotspots'],
      showToast: true,
      toastMessages: {
        UPDATE: 'Status do hotspot atualizado',
      },
    },
  ]);
}

// Hook specifically for actions realtime updates
export function useAcoesPendentesRealtime() {
  useRealtimeSubscription([
    {
      table: 'acoes_pendentes',
      queryKey: ['acoes_pendentes'],
      showToast: true,
      toastMessages: {
        INSERT: 'Nova ação enfileirada',
        UPDATE: 'Status da ação atualizado',
      },
    },
  ]);
}

// Hook for tripulantes realtime updates
export function useTripulantesRealtime() {
  useRealtimeSubscription([
    {
      table: 'tripulantes',
      queryKey: ['tripulantes'],
    },
  ]);
}

// Hook for dashboard realtime - subscribes to multiple tables
export function useDashboardRealtime() {
  useRealtimeSubscription([
    { table: 'hotspots', queryKey: ['dashboard-stats'] },
    { table: 'tripulantes', queryKey: ['dashboard-stats'] },
    { table: 'embarcacoes', queryKey: ['dashboard-stats'] },
    { table: 'alertas', queryKey: ['dashboard-stats', 'recent-alerts'] },
  ]);
}

// Hook for alertas realtime updates
export function useAlertasRealtime() {
  useRealtimeSubscription([
    {
      table: 'alertas',
      queryKey: ['alertas'],
      showToast: true,
      toastMessages: {
        INSERT: 'Novo alerta recebido!',
        UPDATE: 'Alerta atualizado',
      },
    },
    {
      table: 'alertas',
      queryKey: ['alertas-stats'],
    },
  ]);
}
