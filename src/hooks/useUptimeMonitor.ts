import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

export interface DayStatus {
  date: string;
  uptime_percent: number;
  status: 'full' | 'partial' | 'down' | 'no_data';
  incidents: number;
  downtime_minutes: number;
}

export interface UptimeData {
  hotspot_id: string;
  hotspot_nome: string;
  embarcacao_nome: string;
  status_atual: 'online' | 'offline' | 'alert';
  uptime_24h: number;
  uptime_7d: number;
  uptime_30d: number;
  uptime_90d: number;
  daily_status: DayStatus[];
  ultima_interrupcao: Date | null;
}

export interface Incident {
  id: string;
  hotspot_id: string;
  hotspot_nome: string;
  embarcacao_nome: string;
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number;
  status: 'offline' | 'alert';
  date: string;
}

interface StatusHistory {
  id: string;
  hotspot_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

function calculateUptime(
  history: StatusHistory[],
  startDate: Date,
  endDate: Date
): number {
  const totalPeriodSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
  
  if (totalPeriodSeconds <= 0) return 100;
  
  const onlineSeconds = history
    .filter(h => h.status === 'online')
    .reduce((sum, h) => {
      const historyStart = new Date(h.started_at).getTime();
      const historyEnd = h.ended_at ? new Date(h.ended_at).getTime() : Date.now();
      
      const start = Math.max(historyStart, startDate.getTime());
      const end = Math.min(historyEnd, endDate.getTime());
      
      return sum + Math.max(0, end - start) / 1000;
    }, 0);
  
  return Math.min(100, (onlineSeconds / totalPeriodSeconds) * 100);
}

function generateDailyStatus(history: StatusHistory[], days: number = 90): DayStatus[] {
  const dailyStatus: DayStatus[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    const dayHistory = history.filter(h => {
      const historyStart = new Date(h.started_at);
      const historyEnd = h.ended_at ? new Date(h.ended_at) : new Date();
      return historyStart <= dayEnd && historyEnd >= dayStart;
    });
    
    const uptime = dayHistory.length > 0 
      ? calculateUptime(dayHistory, dayStart, dayEnd)
      : 100; // Se não há histórico, assumimos 100%
    
    const incidents = dayHistory.filter(h => h.status === 'offline' || h.status === 'alert').length;
    const downtimeMinutes = ((100 - uptime) / 100) * 24 * 60;
    
    let status: DayStatus['status'] = 'no_data';
    if (dayHistory.length > 0) {
      if (uptime === 100) status = 'full';
      else if (uptime >= 99) status = 'partial';
      else status = 'down';
    }
    
    dailyStatus.push({
      date: format(date, 'yyyy-MM-dd'),
      uptime_percent: uptime,
      status,
      incidents,
      downtime_minutes: downtimeMinutes,
    });
  }
  
  return dailyStatus;
}

export function useHotspotsUptime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('uptime-monitor')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hotspot_status_history',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['hotspots-uptime'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['hotspots-uptime'],
    queryFn: async () => {
      // Buscar hotspots
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select(`
          id,
          nome,
          status,
          embarcacoes(nome)
        `)
        .order('nome');

      if (hotspotsError) throw hotspotsError;

      // Buscar histórico dos últimos 90 dias
      const ninetyDaysAgo = subDays(new Date(), 90).toISOString();
      const { data: history, error: historyError } = await supabase
        .from('hotspot_status_history')
        .select('*')
        .gte('started_at', ninetyDaysAgo)
        .order('started_at', { ascending: false });

      if (historyError) throw historyError;

      const now = new Date();
      const day24h = subDays(now, 1);
      const day7d = subDays(now, 7);
      const day30d = subDays(now, 30);
      const day90d = subDays(now, 90);

      const uptimeData: UptimeData[] = (hotspots || []).map((hotspot: any) => {
        const hotspotHistory = (history || []).filter(
          (h: any) => h.hotspot_id === hotspot.id
        ) as StatusHistory[];

        const dailyStatus = generateDailyStatus(hotspotHistory, 90);

        // Encontrar última interrupção
        const lastIncident = hotspotHistory.find(
          h => h.status === 'offline' || h.status === 'alert'
        );

        return {
          hotspot_id: hotspot.id,
          hotspot_nome: hotspot.nome,
          embarcacao_nome: hotspot.embarcacoes?.nome || 'N/A',
          status_atual: hotspot.status as 'online' | 'offline' | 'alert',
          uptime_24h: calculateUptime(hotspotHistory, day24h, now),
          uptime_7d: calculateUptime(hotspotHistory, day7d, now),
          uptime_30d: calculateUptime(hotspotHistory, day30d, now),
          uptime_90d: calculateUptime(hotspotHistory, day90d, now),
          daily_status: dailyStatus,
          ultima_interrupcao: lastIncident
            ? new Date(lastIncident.started_at)
            : null,
        };
      });

      return uptimeData;
    },
    refetchInterval: 60000, // Atualizar a cada minuto
  });
}

export function useOverallUptime() {
  const { data: hotspotsUptime, isLoading } = useHotspotsUptime();

  const calculateOverallUptime = (period: '24h' | '7d' | '30d' | '90d') => {
    if (!hotspotsUptime || hotspotsUptime.length === 0) return 100;

    const key = `uptime_${period}` as keyof UptimeData;
    const total = hotspotsUptime.reduce((sum, h) => sum + (h[key] as number), 0);
    return total / hotspotsUptime.length;
  };

  const allOnline = hotspotsUptime?.every(h => h.status_atual === 'online') ?? true;
  
  const lastIncident = hotspotsUptime
    ?.filter(h => h.ultima_interrupcao)
    .sort((a, b) => 
      (b.ultima_interrupcao?.getTime() || 0) - (a.ultima_interrupcao?.getTime() || 0)
    )[0]?.ultima_interrupcao;

  return {
    isLoading,
    allOnline,
    lastIncident,
    uptime_24h: calculateOverallUptime('24h'),
    uptime_7d: calculateOverallUptime('7d'),
    uptime_30d: calculateOverallUptime('30d'),
    uptime_90d: calculateOverallUptime('90d'),
    totalHotspots: hotspotsUptime?.length || 0,
    onlineCount: hotspotsUptime?.filter(h => h.status_atual === 'online').length || 0,
  };
}

export function useIncidentsTimeline(days: number = 7) {
  return useQuery({
    queryKey: ['incidents-timeline', days],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      
      const { data, error } = await supabase
        .from('hotspot_status_history')
        .select(`
          id,
          hotspot_id,
          status,
          started_at,
          ended_at,
          duration_seconds,
          hotspots(nome, embarcacoes(nome))
        `)
        .in('status', ['offline', 'alert'])
        .gte('started_at', startDate)
        .order('started_at', { ascending: false });

      if (error) throw error;

      const incidents: Incident[] = (data || []).map((item: any) => ({
        id: item.id,
        hotspot_id: item.hotspot_id,
        hotspot_nome: item.hotspots?.nome || 'Hotspot',
        embarcacao_nome: item.hotspots?.embarcacoes?.nome || 'N/A',
        started_at: new Date(item.started_at),
        ended_at: item.ended_at ? new Date(item.ended_at) : null,
        duration_minutes: item.duration_seconds 
          ? Math.round(item.duration_seconds / 60)
          : Math.round((Date.now() - new Date(item.started_at).getTime()) / 60000),
        status: item.status as 'offline' | 'alert',
        date: format(new Date(item.started_at), 'yyyy-MM-dd'),
      }));

      // Agrupar por data
      const groupedByDate = incidents.reduce((acc, incident) => {
        if (!acc[incident.date]) {
          acc[incident.date] = [];
        }
        acc[incident.date].push(incident);
        return acc;
      }, {} as Record<string, Incident[]>);

      return {
        incidents,
        groupedByDate,
        totalIncidents: incidents.length,
      };
    },
    refetchInterval: 60000,
  });
}
