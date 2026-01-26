import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardStats {
  totalEmpresas: number;
  totalEmbarcacoes: number;
  embarcacoesAtivas: number;
  totalHotspots: number;
  hotspotsOnline: number;
  hotspotsOffline: number;
  hotspotsAlerta: number;
  totalTripulantes: number;
  tripulantesAtivos: number;
  totalAlertas: number;
  alertasCriticos: number;
  alertasNaoResolvidos: number;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch all stats in parallel
      const [
        empresasRes,
        embarcacoesRes,
        hotspotsRes,
        tripulantesRes,
        alertasRes,
      ] = await Promise.all([
        supabase.from('empresas').select('id, status'),
        supabase.from('embarcacoes').select('id, status'),
        supabase.from('hotspots').select('id, status'),
        supabase.from('tripulantes').select('id, status'),
        supabase.from('alertas').select('id, severidade, resolvido'),
      ]);

      const empresas = empresasRes.data || [];
      const embarcacoes = embarcacoesRes.data || [];
      const hotspots = hotspotsRes.data || [];
      const tripulantes = tripulantesRes.data || [];
      const alertas = alertasRes.data || [];

      return {
        totalEmpresas: empresas.length,
        totalEmbarcacoes: embarcacoes.length,
        embarcacoesAtivas: embarcacoes.filter((e) => e.status === 'ativo').length,
        totalHotspots: hotspots.length,
        hotspotsOnline: hotspots.filter((h) => h.status === 'online').length,
        hotspotsOffline: hotspots.filter((h) => h.status === 'offline').length,
        hotspotsAlerta: hotspots.filter((h) => h.status === 'alerta').length,
        totalTripulantes: tripulantes.length,
        tripulantesAtivos: tripulantes.filter((t) => t.status === 'ativo').length,
        totalAlertas: alertas.length,
        alertasCriticos: alertas.filter((a) => a.severidade === 'critical').length,
        alertasNaoResolvidos: alertas.filter((a) => !a.resolvido).length,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export interface RecentHotspot {
  id: string;
  nome: string;
  status: string;
  embarcacao_nome: string;
  ultima_sincronizacao: string | null;
}

export function useRecentHotspots(limit = 5) {
  return useQuery({
    queryKey: ['recent-hotspots', limit],
    queryFn: async (): Promise<RecentHotspot[]> => {
      const { data, error } = await supabase
        .from('hotspots')
        .select(`
          id,
          nome,
          status,
          ultima_sincronizacao,
          embarcacoes(nome)
        `)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map((h: any) => ({
        id: h.id,
        nome: h.nome,
        status: h.status,
        embarcacao_nome: h.embarcacoes?.nome || 'N/A',
        ultima_sincronizacao: h.ultima_sincronizacao,
      }));
    },
    refetchInterval: 30000,
  });
}

export interface RecentAlert {
  id: string;
  mensagem: string;
  severidade: string;
  tipo: string;
  created_at: string;
  resolvido: boolean;
}

export function useRecentAlerts(limit = 5) {
  return useQuery({
    queryKey: ['recent-alerts', limit],
    queryFn: async (): Promise<RecentAlert[]> => {
      const { data, error } = await supabase
        .from('alertas')
        .select('id, mensagem, severidade, tipo, created_at, resolvido')
        .eq('resolvido', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as RecentAlert[];
    },
    refetchInterval: 30000,
  });
}

export interface RecentTripulante {
  id: string;
  nome: string;
  cargo: string | null;
  status: string;
  embarcacao_nome: string;
  created_at: string;
}

export function useRecentTripulantes(limit = 5) {
  return useQuery({
    queryKey: ['recent-tripulantes', limit],
    queryFn: async (): Promise<RecentTripulante[]> => {
      const { data, error } = await supabase
        .from('tripulantes')
        .select(`
          id,
          nome,
          cargo,
          status,
          created_at,
          embarcacoes(nome)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map((t: any) => ({
        id: t.id,
        nome: t.nome,
        cargo: t.cargo,
        status: t.status,
        embarcacao_nome: t.embarcacoes?.nome || 'N/A',
        created_at: t.created_at,
      }));
    },
    refetchInterval: 30000,
  });
}

export function usePendingActions() {
  return useQuery({
    queryKey: ['pending-actions-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acoes_pendentes')
        .select('id, status')
        .eq('status', 'pendente');

      if (error) throw error;
      return data.length;
    },
    refetchInterval: 10000,
  });
}
