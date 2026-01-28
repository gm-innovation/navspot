import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getHotspotRealStatus } from '@/utils/hotspotStatus';

export interface SessaoAtiva {
  id: string;
  tripulante: {
    id: string;
    nome: string;
    cargo: string | null;
  };
  dispositivo: {
    id: string | null;
    nome: string | null;
    mac_address: string | null;
  };
  hotspot: {
    id: string;
    nome: string;
    embarcacao_nome: string;
  };
  inicio: string;
  bytes_in: number;
  bytes_out: number;
  ip_address: string | null;
  mac_address: string | null;
}

export interface HotspotStatus {
  id: string;
  nome: string;
  status: string;
  ultima_sincronizacao: string | null;
  sync_interval_minutes: number;
  embarcacao_nome: string;
  sessoes_ativas: number;
}

export interface EventoFeed {
  id: string;
  tipo: 'sessao_iniciada' | 'sessao_encerrada' | 'alerta' | 'hotspot_status';
  mensagem: string;
  timestamp: string;
  severidade?: string;
}

export interface ConsumoSnapshot {
  timestamp: Date;
  bytes_download: number;
  bytes_upload: number;
}

export function useSessoesAtivas() {
  return useQuery({
    queryKey: ['sessoes-ativas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessoes_wifi')
        .select(`
          id,
          inicio,
          bytes_in,
          bytes_out,
          ip_address,
          mac_address,
          tripulante:tripulantes(id, nome, cargo),
          dispositivo:dispositivos_registrados(id, nome, mac_address),
          hotspot:hotspots(id, nome, embarcacao:embarcacoes(nome))
        `)
        .eq('status', 'ativa')
        .order('inicio', { ascending: false });

      if (error) throw error;

      return (data || []).map((sessao: any) => ({
        id: sessao.id,
        tripulante: {
          id: sessao.tripulante?.id || '',
          nome: sessao.tripulante?.nome || 'Desconhecido',
          cargo: sessao.tripulante?.cargo || null,
        },
        dispositivo: {
          id: sessao.dispositivo?.id || null,
          nome: sessao.dispositivo?.nome || null,
          mac_address: sessao.dispositivo?.mac_address || sessao.mac_address || null,
        },
        hotspot: {
          id: sessao.hotspot?.id || '',
          nome: sessao.hotspot?.nome || 'Desconhecido',
          embarcacao_nome: sessao.hotspot?.embarcacao?.nome || 'N/A',
        },
        inicio: sessao.inicio,
        bytes_in: sessao.bytes_in || 0,
        bytes_out: sessao.bytes_out || 0,
        ip_address: sessao.ip_address,
        mac_address: sessao.mac_address,
      })) as SessaoAtiva[];
    },
    refetchInterval: 5000, // Fallback polling every 5 seconds
  });
}

export function useHotspotsStatus() {
  return useQuery({
    queryKey: ['hotspots-status'],
    queryFn: async () => {
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select(`
          id,
          nome,
          status,
          ultima_sincronizacao,
          sync_interval_minutes,
          embarcacao:embarcacoes(nome)
        `)
        .order('nome');

      if (hotspotsError) throw hotspotsError;

      // Get active sessions count per hotspot
      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select('hotspot_id')
        .eq('status', 'ativa');

      if (sessoesError) throw sessoesError;

      const sessoesPorHotspot = (sessoes || []).reduce((acc: Record<string, number>, s) => {
        acc[s.hotspot_id] = (acc[s.hotspot_id] || 0) + 1;
        return acc;
      }, {});

      return (hotspots || []).map((h: any) => ({
        id: h.id,
        nome: h.nome,
        status: h.status,
        ultima_sincronizacao: h.ultima_sincronizacao,
        sync_interval_minutes: h.sync_interval_minutes || 5,
        embarcacao_nome: h.embarcacao?.nome || 'N/A',
        sessoes_ativas: sessoesPorHotspot[h.id] || 0,
      })) as HotspotStatus[];
    },
    refetchInterval: 5000,
  });
}

export function useEventosFeed() {
  return useQuery({
    queryKey: ['eventos-feed'],
    queryFn: async () => {
      // Get recent alerts
      const { data: alertas, error: alertasError } = await supabase
        .from('alertas')
        .select('id, tipo, mensagem, severidade, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (alertasError) throw alertasError;

      // Get recent session changes
      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select(`
          id,
          inicio,
          fim,
          status,
          tripulante:tripulantes(nome)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (sessoesError) throw sessoesError;

      const eventos: EventoFeed[] = [];

      // Add alerts as events
      (alertas || []).forEach((a) => {
        eventos.push({
          id: `alerta-${a.id}`,
          tipo: 'alerta',
          mensagem: a.mensagem,
          timestamp: a.created_at,
          severidade: a.severidade,
        });
      });

      // Add sessions as events
      (sessoes || []).forEach((s: any) => {
        if (s.status === 'ativa') {
          eventos.push({
            id: `sessao-${s.id}-inicio`,
            tipo: 'sessao_iniciada',
            mensagem: `${s.tripulante?.nome || 'Tripulante'} iniciou sessão`,
            timestamp: s.inicio,
          });
        }
        if (s.fim) {
          eventos.push({
            id: `sessao-${s.id}-fim`,
            tipo: 'sessao_encerrada',
            mensagem: `${s.tripulante?.nome || 'Tripulante'} encerrou sessão`,
            timestamp: s.fim,
          });
        }
      });

      // Sort by timestamp and limit to 20
      return eventos
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);
    },
    refetchInterval: 5000,
  });
}

export function useConsumoAoVivo(enabled: boolean = true) {
  const [snapshots, setSnapshots] = useState<ConsumoSnapshot[]>([]);
  const lastConsumo = useRef({ download: 0, upload: 0 });

  const { data: sessoesAtivas } = useSessoesAtivas();

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const totalDownload = sessoesAtivas?.reduce((acc, s) => acc + s.bytes_in, 0) || 0;
      const totalUpload = sessoesAtivas?.reduce((acc, s) => acc + s.bytes_out, 0) || 0;

      // Calculate delta (bytes per second)
      const deltaDownload = Math.max(0, totalDownload - lastConsumo.current.download);
      const deltaUpload = Math.max(0, totalUpload - lastConsumo.current.upload);

      lastConsumo.current = { download: totalDownload, upload: totalUpload };

      setSnapshots((prev) => {
        const newSnapshot: ConsumoSnapshot = {
          timestamp: new Date(),
          bytes_download: deltaDownload,
          bytes_upload: deltaUpload,
        };
        const updated = [...prev, newSnapshot];
        // Keep only last 60 snapshots
        return updated.slice(-60);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, sessoesAtivas]);

  return snapshots;
}

export function useLiveMetrics() {
  const { data: sessoesAtivas } = useSessoesAtivas();
  const { data: hotspots } = useHotspotsStatus();

  const totalSessoes = sessoesAtivas?.length || 0;
  const totalConsumo = sessoesAtivas?.reduce((acc, s) => acc + s.bytes_in + s.bytes_out, 0) || 0;
  
  // Use real calculated status
  const hotspotsOnline = hotspots?.filter((h) => {
    const realStatus = getHotspotRealStatus({
      status: h.status,
      ultima_sincronizacao: h.ultima_sincronizacao,
      sync_interval_minutes: h.sync_interval_minutes || 5,
    });
    return realStatus === 'online';
  }).length || 0;
  
  const totalHotspots = hotspots?.length || 0;

  return {
    totalSessoes,
    totalConsumo,
    hotspotsOnline,
    totalHotspots,
  };
}

export function useLiveDuration(startTime: string) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(startTime).getTime();
    
    const updateDuration = () => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return duration;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function formatBytesPerSecond(bytes: number): string {
  if (bytes < 1024) return bytes + ' B/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB/s';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s';
}

export function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return 'Nunca';
  
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = Math.floor((now - time) / 1000);

  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}
