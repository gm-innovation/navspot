import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface MonitoramentoRealtimeOptions {
  enabled?: boolean;
  onSessaoChange?: (payload: any) => void;
  onHotspotChange?: (payload: any) => void;
  onAlertaChange?: (payload: any) => void;
}

export function useMonitoramentoRealtime(options: MonitoramentoRealtimeOptions = {}) {
  const { 
    enabled = true, 
    onSessaoChange, 
    onHotspotChange, 
    onAlertaChange 
  } = options;
  
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Create a single channel for all monitoring subscriptions
    const channel = supabase
      .channel('monitoramento-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessoes_wifi',
        },
        (payload) => {
          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey: ['sessoes-ativas'] });
          queryClient.invalidateQueries({ queryKey: ['hotspots-status'] });
          queryClient.invalidateQueries({ queryKey: ['eventos-feed'] });
          
          onSessaoChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hotspots',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['hotspots-status'] });
          queryClient.invalidateQueries({ queryKey: ['eventos-feed'] });
          
          onHotspotChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alertas',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['eventos-feed'] });
          
          onAlertaChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tripulantes',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sessoes-ativas'] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup on unmount or when disabled
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, queryClient, onSessaoChange, onHotspotChange, onAlertaChange]);

  return {
    isSubscribed: enabled && channelRef.current !== null,
  };
}
