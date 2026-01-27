import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SessaoAtiva {
  id: string;
  tripulante_id: string;
  tripulante_nome: string;
  tripulante_cargo: string | null;
  dispositivo_nome: string | null;
  mac_address: string | null;
  ip_address: string | null;
  inicio: string;
  bytes_in: number;
  bytes_out: number;
}

export interface TopConsumidor {
  id: string;
  nome: string;
  cargo: string | null;
  bytes_consumidos: number;
}

export interface ConsumoHistorico {
  data: string;
  download: number;
  upload: number;
}

export function useSessoesAtivasEmbarcacao(embarcacaoId?: string) {
  return useQuery({
    queryKey: ['sessoes-ativas-embarcacao', embarcacaoId],
    queryFn: async (): Promise<SessaoAtiva[]> => {
      if (!embarcacaoId) return [];

      // First get hotspots for this embarcacao
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select('id')
        .eq('embarcacao_id', embarcacaoId);

      if (hotspotsError) throw hotspotsError;
      if (!hotspots || hotspots.length === 0) return [];

      const hotspotIds = hotspots.map(h => h.id);

      // Get active sessions with tripulante info
      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select(`
          id,
          tripulante_id,
          inicio,
          bytes_in,
          bytes_out,
          ip_address,
          mac_address,
          dispositivo_id,
          tripulantes!inner (
            nome,
            cargo
          ),
          dispositivos_registrados (
            nome,
            mac_address
          )
        `)
        .in('hotspot_id', hotspotIds)
        .eq('status', 'ativa');

      if (sessoesError) throw sessoesError;

      return (sessoes || []).map((s: any) => ({
        id: s.id,
        tripulante_id: s.tripulante_id,
        tripulante_nome: s.tripulantes?.nome || 'Desconhecido',
        tripulante_cargo: s.tripulantes?.cargo,
        dispositivo_nome: s.dispositivos_registrados?.nome,
        mac_address: s.dispositivos_registrados?.mac_address || s.mac_address,
        ip_address: s.ip_address,
        inicio: s.inicio,
        bytes_in: s.bytes_in,
        bytes_out: s.bytes_out,
      }));
    },
    enabled: !!embarcacaoId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useTopConsumidoresEmbarcacao(embarcacaoId?: string, periodoDias: number = 7, limit = 5) {
  return useQuery({
    queryKey: ['top-consumidores-embarcacao', embarcacaoId, periodoDias, limit],
    queryFn: async (): Promise<TopConsumidor[]> => {
      if (!embarcacaoId) return [];

      const { data, error } = await supabase
        .from('tripulantes')
        .select('id, nome, cargo, bytes_consumidos')
        .eq('embarcacao_id', embarcacaoId)
        .gt('bytes_consumidos', 0)
        .order('bytes_consumidos', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    },
    enabled: !!embarcacaoId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useConsumoHistoricoEmbarcacao(embarcacaoId?: string, periodoDias: number = 7) {
  return useQuery({
    queryKey: ['consumo-historico-embarcacao', embarcacaoId, periodoDias],
    queryFn: async (): Promise<ConsumoHistorico[]> => {
      if (!embarcacaoId) return [];

      // Get hotspots for this embarcacao
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select('id')
        .eq('embarcacao_id', embarcacaoId);

      if (hotspotsError) throw hotspotsError;
      if (!hotspots || hotspots.length === 0) return [];

      const hotspotIds = hotspots.map(h => h.id);

      // Get sessions from specified period
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodoDias);

      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select('inicio, bytes_in, bytes_out')
        .in('hotspot_id', hotspotIds)
        .gte('inicio', startDate.toISOString());

      if (sessoesError) throw sessoesError;

      // Group by day
      const consumoPorDia: Record<string, { download: number; upload: number }> = {};
      
      (sessoes || []).forEach((s: any) => {
        const data = new Date(s.inicio).toISOString().split('T')[0];
        if (!consumoPorDia[data]) {
          consumoPorDia[data] = { download: 0, upload: 0 };
        }
        consumoPorDia[data].download += s.bytes_in || 0;
        consumoPorDia[data].upload += s.bytes_out || 0;
      });

      // Convert to array and sort by date
      const resultado = Object.entries(consumoPorDia)
        .map(([data, valores]) => ({
          data,
          download: valores.download,
          upload: valores.upload,
        }))
        .sort((a, b) => a.data.localeCompare(b.data));

      // Fill in missing days with zeros
      const diasCompletos: ConsumoHistorico[] = [];
      for (let i = periodoDias - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dataStr = d.toISOString().split('T')[0];
        const existente = resultado.find(r => r.data === dataStr);
        diasCompletos.push(existente || { data: dataStr, download: 0, upload: 0 });
      }

      return diasCompletos;
    },
    enabled: !!embarcacaoId,
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useTopDuracaoEmbarcacao(embarcacaoId?: string, periodoDias: number = 7, limit = 5) {
  return useQuery({
    queryKey: ['top-duracao-embarcacao', embarcacaoId, periodoDias, limit],
    queryFn: async (): Promise<{ id: string; nome: string; cargo: string | null; duracao_segundos: number }[]> => {
      if (!embarcacaoId) return [];

      // Get hotspots for this embarcacao
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select('id')
        .eq('embarcacao_id', embarcacaoId);

      if (hotspotsError) throw hotspotsError;
      if (!hotspots || hotspots.length === 0) return [];

      const hotspotIds = hotspots.map(h => h.id);

      // Get all sessions with tripulante info
      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select(`
          inicio,
          fim,
          tripulante_id,
          tripulantes!inner (
            id,
            nome,
            cargo
          )
        `)
        .in('hotspot_id', hotspotIds);

      if (sessoesError) throw sessoesError;

      // Calculate total duration per tripulante
      const duracaoPorTripulante: Record<string, { 
        id: string; 
        nome: string; 
        cargo: string | null; 
        duracao_segundos: number 
      }> = {};

      const now = new Date();
      (sessoes || []).forEach((s: any) => {
        const tripId = s.tripulantes.id;
        const inicio = new Date(s.inicio);
        const fim = s.fim ? new Date(s.fim) : now;
        const duracao = (fim.getTime() - inicio.getTime()) / 1000;

        if (!duracaoPorTripulante[tripId]) {
          duracaoPorTripulante[tripId] = {
            id: tripId,
            nome: s.tripulantes.nome,
            cargo: s.tripulantes.cargo,
            duracao_segundos: 0,
          };
        }
        duracaoPorTripulante[tripId].duracao_segundos += duracao;
      });

      // Sort and limit
      return Object.values(duracaoPorTripulante)
        .sort((a, b) => b.duracao_segundos - a.duracao_segundos)
        .slice(0, limit);
    },
    enabled: !!embarcacaoId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useMetricasEmbarcacao(embarcacaoId?: string) {
  return useQuery({
    queryKey: ['metricas-embarcacao', embarcacaoId],
    queryFn: async () => {
      if (!embarcacaoId) return null;

      // Get hotspots for this embarcacao
      const { data: hotspots, error: hotspotsError } = await supabase
        .from('hotspots')
        .select('id')
        .eq('embarcacao_id', embarcacaoId);

      if (hotspotsError) throw hotspotsError;
      if (!hotspots || hotspots.length === 0) {
        return {
          sessoesAtivas: 0,
          consumoHoje: 0,
          sessoesHoje: 0,
        };
      }

      const hotspotIds = hotspots.map(h => h.id);
      const hoje = new Date().toISOString().split('T')[0];

      // Get active sessions count
      const { count: sessoesAtivas } = await supabase
        .from('sessoes_wifi')
        .select('*', { count: 'exact', head: true })
        .in('hotspot_id', hotspotIds)
        .eq('status', 'ativa');

      // Get today's sessions and consumption
      const { data: sessoesHoje, error: sessoesError } = await supabase
        .from('sessoes_wifi')
        .select('bytes_in, bytes_out')
        .in('hotspot_id', hotspotIds)
        .gte('inicio', `${hoje}T00:00:00`);

      if (sessoesError) throw sessoesError;

      const consumoHoje = (sessoesHoje || []).reduce((acc: number, s: any) => 
        acc + (s.bytes_in || 0) + (s.bytes_out || 0), 0
      );

      return {
        sessoesAtivas: sessoesAtivas || 0,
        consumoHoje,
        sessoesHoje: sessoesHoje?.length || 0,
      };
    },
    enabled: !!embarcacaoId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
