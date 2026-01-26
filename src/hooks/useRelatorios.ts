import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfDay, endOfDay, format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface RelatorioFilters {
  dataInicio: Date;
  dataFim: Date;
  empresaId?: string;
  embarcacaoId?: string;
  agruparPor?: 'dia' | 'semana' | 'mes';
}

export interface ConsumoData {
  periodo: string;
  bytes_download: number;
  bytes_upload: number;
  total_bytes: number;
}

export interface SessaoData {
  periodo: string;
  total_sessoes: number;
  sessoes_ativas: number;
  sessoes_encerradas: number;
  duracao_media_minutos: number;
}

export interface AlertaData {
  tipo: string;
  severidade: string;
  total: number;
  resolvidos: number;
  pendentes: number;
}

export interface TopConsumidor {
  id: string;
  nome: string;
  tipo: 'tripulante' | 'dispositivo';
  cargo?: string;
  bytes_consumidos: number;
  embarcacao_nome?: string;
}

export interface EmpresaMetrica {
  id: string;
  nome: string;
  total_embarcacoes: number;
  total_tripulantes: number;
  total_consumo: number;
  total_alertas: number;
}

export interface EmbarcacaoMetrica {
  id: string;
  nome: string;
  empresa_nome?: string;
  total_tripulantes: number;
  total_hotspots: number;
  total_consumo: number;
  total_sessoes: number;
}

function generatePeriods(filters: RelatorioFilters): string[] {
  const { dataInicio, dataFim, agruparPor = 'dia' } = filters;
  
  switch (agruparPor) {
    case 'semana':
      return eachWeekOfInterval({ start: dataInicio, end: dataFim }).map(d => 
        format(d, "'Sem' w", { locale: ptBR })
      );
    case 'mes':
      return eachMonthOfInterval({ start: dataInicio, end: dataFim }).map(d => 
        format(d, 'MMM/yy', { locale: ptBR })
      );
    default:
      return eachDayOfInterval({ start: dataInicio, end: dataFim }).map(d => 
        format(d, 'dd/MM', { locale: ptBR })
      );
  }
}

export function useRelatorioConsumo(filters: RelatorioFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-consumo', filters, user?.empresa_id, user?.embarcacao_id],
    queryFn: async (): Promise<ConsumoData[]> => {
      const { dataInicio, dataFim, empresaId, embarcacaoId } = filters;
      
      let query = supabase
        .from('sessoes_wifi')
        .select(`
          inicio,
          bytes_in,
          bytes_out,
          hotspots!inner(
            embarcacao_id,
            embarcacoes!inner(empresa_id)
          )
        `)
        .gte('inicio', startOfDay(dataInicio).toISOString())
        .lte('inicio', endOfDay(dataFim).toISOString());

      if (embarcacaoId) {
        query = query.eq('hotspots.embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        query = query.eq('hotspots.embarcacoes.empresa_id', empresaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by period
      const periods = generatePeriods(filters);
      const consumoMap = new Map<string, { download: number; upload: number }>();
      
      periods.forEach(p => consumoMap.set(p, { download: 0, upload: 0 }));

      data?.forEach(sessao => {
        const date = new Date(sessao.inicio);
        let periodKey: string;
        
        switch (filters.agruparPor) {
          case 'semana':
            periodKey = format(date, "'Sem' w", { locale: ptBR });
            break;
          case 'mes':
            periodKey = format(date, 'MMM/yy', { locale: ptBR });
            break;
          default:
            periodKey = format(date, 'dd/MM', { locale: ptBR });
        }

        const current = consumoMap.get(periodKey) || { download: 0, upload: 0 };
        consumoMap.set(periodKey, {
          download: current.download + (sessao.bytes_in || 0),
          upload: current.upload + (sessao.bytes_out || 0),
        });
      });

      return periods.map(periodo => {
        const valores = consumoMap.get(periodo) || { download: 0, upload: 0 };
        return {
          periodo,
          bytes_download: valores.download,
          bytes_upload: valores.upload,
          total_bytes: valores.download + valores.upload,
        };
      });
    },
    enabled: !!user,
  });
}

export function useRelatorioSessoes(filters: RelatorioFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-sessoes', filters, user?.empresa_id, user?.embarcacao_id],
    queryFn: async (): Promise<SessaoData[]> => {
      const { dataInicio, dataFim, empresaId, embarcacaoId } = filters;

      let query = supabase
        .from('sessoes_wifi')
        .select(`
          inicio,
          fim,
          status,
          hotspots!inner(
            embarcacao_id,
            embarcacoes!inner(empresa_id)
          )
        `)
        .gte('inicio', startOfDay(dataInicio).toISOString())
        .lte('inicio', endOfDay(dataFim).toISOString());

      if (embarcacaoId) {
        query = query.eq('hotspots.embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        query = query.eq('hotspots.embarcacoes.empresa_id', empresaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const periods = generatePeriods(filters);
      const sessoesMap = new Map<string, { total: number; ativas: number; encerradas: number; duracao_total: number }>();
      
      periods.forEach(p => sessoesMap.set(p, { total: 0, ativas: 0, encerradas: 0, duracao_total: 0 }));

      data?.forEach(sessao => {
        const date = new Date(sessao.inicio);
        let periodKey: string;
        
        switch (filters.agruparPor) {
          case 'semana':
            periodKey = format(date, "'Sem' w", { locale: ptBR });
            break;
          case 'mes':
            periodKey = format(date, 'MMM/yy', { locale: ptBR });
            break;
          default:
            periodKey = format(date, 'dd/MM', { locale: ptBR });
        }

        const current = sessoesMap.get(periodKey) || { total: 0, ativas: 0, encerradas: 0, duracao_total: 0 };
        const duracao = sessao.fim 
          ? (new Date(sessao.fim).getTime() - new Date(sessao.inicio).getTime()) / 60000 
          : 0;

        sessoesMap.set(periodKey, {
          total: current.total + 1,
          ativas: current.ativas + (sessao.status === 'ativa' ? 1 : 0),
          encerradas: current.encerradas + (sessao.status !== 'ativa' ? 1 : 0),
          duracao_total: current.duracao_total + duracao,
        });
      });

      return periods.map(periodo => {
        const valores = sessoesMap.get(periodo) || { total: 0, ativas: 0, encerradas: 0, duracao_total: 0 };
        return {
          periodo,
          total_sessoes: valores.total,
          sessoes_ativas: valores.ativas,
          sessoes_encerradas: valores.encerradas,
          duracao_media_minutos: valores.total > 0 ? valores.duracao_total / valores.total : 0,
        };
      });
    },
    enabled: !!user,
  });
}

export function useRelatorioAlertas(filters: RelatorioFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-alertas', filters, user?.empresa_id, user?.embarcacao_id],
    queryFn: async (): Promise<AlertaData[]> => {
      const { dataInicio, dataFim, empresaId, embarcacaoId } = filters;

      let query = supabase
        .from('alertas')
        .select('tipo, severidade, resolvido')
        .gte('created_at', startOfDay(dataInicio).toISOString())
        .lte('created_at', endOfDay(dataFim).toISOString());

      if (embarcacaoId) {
        query = query.eq('embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const alertasMap = new Map<string, AlertaData>();

      data?.forEach(alerta => {
        const key = `${alerta.tipo}-${alerta.severidade}`;
        const current = alertasMap.get(key) || {
          tipo: alerta.tipo,
          severidade: alerta.severidade,
          total: 0,
          resolvidos: 0,
          pendentes: 0,
        };

        alertasMap.set(key, {
          ...current,
          total: current.total + 1,
          resolvidos: current.resolvidos + (alerta.resolvido ? 1 : 0),
          pendentes: current.pendentes + (alerta.resolvido ? 0 : 1),
        });
      });

      return Array.from(alertasMap.values());
    },
    enabled: !!user,
  });
}

export function useTopConsumidores(filters: RelatorioFilters, limit = 10) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['top-consumidores', filters, limit, user?.empresa_id, user?.embarcacao_id],
    queryFn: async (): Promise<TopConsumidor[]> => {
      const { empresaId, embarcacaoId } = filters;

      // Buscar tripulantes
      let tripulantesQuery = supabase
        .from('tripulantes')
        .select(`
          id,
          nome,
          cargo,
          bytes_consumidos,
          embarcacoes!inner(nome, empresa_id)
        `)
        .gt('bytes_consumidos', 0)
        .order('bytes_consumidos', { ascending: false })
        .limit(limit);

      if (embarcacaoId) {
        tripulantesQuery = tripulantesQuery.eq('embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        tripulantesQuery = tripulantesQuery.eq('embarcacoes.empresa_id', empresaId);
      }

      const { data: tripulantes, error: tripError } = await tripulantesQuery;

      if (tripError) throw tripError;

      // Buscar dispositivos
      let dispositivosQuery = supabase
        .from('dispositivos_registrados')
        .select(`
          id,
          nome,
          bytes_consumidos,
          embarcacoes!inner(nome, empresa_id)
        `)
        .gt('bytes_consumidos', 0)
        .not('tripulante_id', 'is', null)
        .order('bytes_consumidos', { ascending: false })
        .limit(limit);

      if (embarcacaoId) {
        dispositivosQuery = dispositivosQuery.eq('embarcacao_id', embarcacaoId);
      }

      const { data: dispositivos, error: dispError } = await dispositivosQuery;

      if (dispError) throw dispError;

      const consumidores: TopConsumidor[] = [
        ...(tripulantes || []).map(t => ({
          id: t.id,
          nome: t.nome,
          tipo: 'tripulante' as const,
          cargo: t.cargo || undefined,
          bytes_consumidos: t.bytes_consumidos,
          embarcacao_nome: (t.embarcacoes as unknown as { nome: string })?.nome,
        })),
        ...(dispositivos || []).map(d => ({
          id: d.id,
          nome: d.nome || 'Dispositivo sem nome',
          tipo: 'dispositivo' as const,
          bytes_consumidos: d.bytes_consumidos,
          embarcacao_nome: (d.embarcacoes as unknown as { nome: string })?.nome,
        })),
      ];

      return consumidores
        .sort((a, b) => b.bytes_consumidos - a.bytes_consumidos)
        .slice(0, limit);
    },
    enabled: !!user,
  });
}

export function useRelatorioEmpresas() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-empresas'],
    queryFn: async (): Promise<EmpresaMetrica[]> => {
      const { data: empresas, error } = await supabase
        .from('empresas')
        .select(`
          id,
          nome,
          embarcacoes(
            id,
            tripulantes(id, bytes_consumidos)
          )
        `)
        .eq('status', 'ativo');

      if (error) throw error;

      const { data: alertas } = await supabase
        .from('alertas')
        .select('empresa_id')
        .eq('resolvido', false);

      const alertasCount = new Map<string, number>();
      alertas?.forEach(a => {
        if (a.empresa_id) {
          alertasCount.set(a.empresa_id, (alertasCount.get(a.empresa_id) || 0) + 1);
        }
      });

      return (empresas || []).map(empresa => {
        const embarcacoes = empresa.embarcacoes || [];
        const tripulantes = embarcacoes.flatMap(e => e.tripulantes || []);
        const consumoTotal = tripulantes.reduce((sum, t) => sum + (t.bytes_consumidos || 0), 0);

        return {
          id: empresa.id,
          nome: empresa.nome,
          total_embarcacoes: embarcacoes.length,
          total_tripulantes: tripulantes.length,
          total_consumo: consumoTotal,
          total_alertas: alertasCount.get(empresa.id) || 0,
        };
      });
    },
    enabled: !!user && user.role === 'super_admin',
  });
}

export function useRelatorioEmbarcacoes(empresaId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-embarcacoes', empresaId, user?.empresa_id],
    queryFn: async (): Promise<EmbarcacaoMetrica[]> => {
      let query = supabase
        .from('embarcacoes')
        .select(`
          id,
          nome,
          empresas(nome),
          tripulantes(id, bytes_consumidos),
          hotspots(id)
        `)
        .eq('status', 'ativo');

      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data: embarcacoes, error } = await query;

      if (error) throw error;

      const { data: sessoes } = await supabase
        .from('sessoes_wifi')
        .select('hotspots!inner(embarcacao_id)');

      const sessoesCount = new Map<string, number>();
      sessoes?.forEach(s => {
        const embId = (s.hotspots as unknown as { embarcacao_id: string })?.embarcacao_id;
        if (embId) {
          sessoesCount.set(embId, (sessoesCount.get(embId) || 0) + 1);
        }
      });

      return (embarcacoes || []).map(emb => {
        const tripulantes = emb.tripulantes || [];
        const hotspots = emb.hotspots || [];
        const consumoTotal = tripulantes.reduce((sum, t) => sum + (t.bytes_consumidos || 0), 0);

        return {
          id: emb.id,
          nome: emb.nome,
          empresa_nome: (emb.empresas as unknown as { nome: string })?.nome,
          total_tripulantes: tripulantes.length,
          total_hotspots: hotspots.length,
          total_consumo: consumoTotal,
          total_sessoes: sessoesCount.get(emb.id) || 0,
        };
      });
    },
    enabled: !!user,
  });
}

export function useRelatorioMetricasGerais(filters: RelatorioFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['relatorio-metricas', filters, user?.role, user?.empresa_id, user?.embarcacao_id],
    queryFn: async () => {
      const { empresaId, embarcacaoId } = filters;

      let empresasCount = 0;
      let embarcacoesCount = 0;
      let tripulantesCount = 0;
      let sessoesCount = 0;
      let consumoTotal = 0;
      let alertasCount = 0;

      if (user?.role === 'super_admin') {
        const { count: empCount } = await supabase
          .from('empresas')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ativo');
        empresasCount = empCount || 0;
      }

      let embQuery = supabase
        .from('embarcacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');
      
      if (empresaId) embQuery = embQuery.eq('empresa_id', empresaId);
      if (embarcacaoId) embQuery = embQuery.eq('id', embarcacaoId);
      
      const { count: embCount } = await embQuery;
      embarcacoesCount = embCount || 0;

      let tripQuery = supabase
        .from('tripulantes')
        .select('bytes_consumidos, embarcacoes!inner(empresa_id)');
      
      if (embarcacaoId) {
        tripQuery = tripQuery.eq('embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        tripQuery = tripQuery.eq('embarcacoes.empresa_id', empresaId);
      }
      
      const { data: tripulantes } = await tripQuery;
      tripulantesCount = tripulantes?.length || 0;
      consumoTotal = tripulantes?.reduce((sum, t) => sum + (t.bytes_consumidos || 0), 0) || 0;

      let sesQuery = supabase
        .from('sessoes_wifi')
        .select('hotspots!inner(embarcacao_id, embarcacoes!inner(empresa_id))', { count: 'exact', head: true });
      
      if (embarcacaoId) {
        sesQuery = sesQuery.eq('hotspots.embarcacao_id', embarcacaoId);
      } else if (empresaId) {
        sesQuery = sesQuery.eq('hotspots.embarcacoes.empresa_id', empresaId);
      }
      
      const { count: sesCount } = await sesQuery;
      sessoesCount = sesCount || 0;

      let alertQuery = supabase
        .from('alertas')
        .select('*', { count: 'exact', head: true })
        .eq('resolvido', false);
      
      if (embarcacaoId) alertQuery = alertQuery.eq('embarcacao_id', embarcacaoId);
      if (empresaId) alertQuery = alertQuery.eq('empresa_id', empresaId);
      
      const { count: alertCount } = await alertQuery;
      alertasCount = alertCount || 0;

      return {
        empresas: empresasCount,
        embarcacoes: embarcacoesCount,
        tripulantes: tripulantesCount,
        sessoes: sessoesCount,
        consumo: consumoTotal,
        alertas: alertasCount,
      };
    },
    enabled: !!user,
  });
}
