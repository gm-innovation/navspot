import { useState, useEffect } from "react";
import { getTipoEmbarcacaoLabel } from "@/constants/embarcacoes";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsGridSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { 
  Ship, 
  Users, 
  Activity,
  MapPin,
  UserPlus,
  Wifi,
  Download,
} from "lucide-react";
import { useEmbarcacao } from "@/hooks/useEmbarcacoes";
import { useHotspots } from "@/hooks/useHotspots";
import { useTripulantes } from "@/hooks/useTripulantes";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscription";
import { 
  useSessoesAtivasEmbarcacao, 
  useTopConsumidoresEmbarcacao, 
  useConsumoHistoricoEmbarcacao,
  useTopDuracaoEmbarcacao,
  useMetricasEmbarcacao 
} from "@/hooks/useEmbarcacaoDashboard";
import { useGerenteEmbarcacoes } from "@/hooks/useGerenteEmbarcacoes";
import { EmbarcacaoOnlineUsers } from "./EmbarcacaoOnlineUsers";
import { EmbarcacaoConsumptionChart } from "./EmbarcacaoConsumptionChart";
import { EmbarcacaoTopConsumers } from "./EmbarcacaoTopConsumers";
import { EmbarcacaoTopDuration } from "./EmbarcacaoTopDuration";
import { EmbarcacaoDashboardFilters } from "./EmbarcacaoDashboardFilters";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function GerenteEmbarcacaoDashboard() {
  // Enable realtime updates
  useDashboardRealtime();

  const { user, hasRole } = useAuth();
  
  // Filter states
  const [selectedEmbarcacaoId, setSelectedEmbarcacaoId] = useState<string | undefined>();
  const [periodoDias, setPeriodoDias] = useState(7);
  const [searchTerm, setSearchTerm] = useState("");

  // Get available embarcacoes for the user
  const { data: embarcacoesDisponiveis, isLoading: embarcacoesLoading } = useGerenteEmbarcacoes();

  // Auto-select first embarcacao when data loads
  useEffect(() => {
    if (!selectedEmbarcacaoId && embarcacoesDisponiveis && embarcacoesDisponiveis.length > 0) {
      setSelectedEmbarcacaoId(embarcacoesDisponiveis[0].id);
    }
  }, [embarcacoesDisponiveis, selectedEmbarcacaoId]);

  // Use selected embarcacao for all queries
  const { data: embarcacao, isLoading: embarcacaoLoading } = useEmbarcacao(selectedEmbarcacaoId);
  const { data: hotspots, isLoading: hotspotsLoading } = useHotspots();
  const { data: tripulantes, isLoading: tripulantesLoading } = useTripulantes();

  // Dashboard data hooks with dynamic period
  const { data: sessoesAtivas, isLoading: sessoesLoading } = useSessoesAtivasEmbarcacao(selectedEmbarcacaoId);
  const { data: topConsumidores, isLoading: topConsumidoresLoading } = useTopConsumidoresEmbarcacao(selectedEmbarcacaoId, periodoDias);
  const { data: consumoHistorico, isLoading: consumoHistoricoLoading } = useConsumoHistoricoEmbarcacao(selectedEmbarcacaoId, periodoDias);
  const { data: topDuracao, isLoading: topDuracaoLoading } = useTopDuracaoEmbarcacao(selectedEmbarcacaoId, periodoDias);
  const { data: metricas, isLoading: metricasLoading } = useMetricasEmbarcacao(selectedEmbarcacaoId);

  // Filter data for selected embarcacao
  const myHotspots = hotspots?.filter(h => h.embarcacao_id === selectedEmbarcacaoId) || [];
  const myTripulantes = tripulantes?.filter(t => t.embarcacao_id === selectedEmbarcacaoId) || [];

  const tripulantesAtivos = myTripulantes.filter(t => t.status === 'ativo').length;
  const hotspotOnline = myHotspots.find(h => h.status === 'online');

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

  const isLoading = embarcacaoLoading || hotspotsLoading || tripulantesLoading;

  // Determine title based on role
  const isSuperAdmin = hasRole(['super_admin']);
  const isEmpresaAdmin = hasRole(['empresa_admin']);
  const dashboardTitle = isSuperAdmin || isEmpresaAdmin 
    ? "Dashboard da Embarcação" 
    : "Minha Embarcação";
  const dashboardSubtitle = isSuperAdmin || isEmpresaAdmin
    ? "Monitoramento em tempo real"
    : `Bem-vindo, ${user?.email?.split('@')[0]} - Gerencie sua embarcação`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dashboardTitle}</h1>
          <p className="text-muted-foreground">{dashboardSubtitle}</p>
        </div>
        <Button asChild>
          <Link to="/tripulantes">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Tripulante
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <EmbarcacaoDashboardFilters
        embarcacoes={embarcacoesDisponiveis || []}
        selectedEmbarcacaoId={selectedEmbarcacaoId}
        onEmbarcacaoChange={setSelectedEmbarcacaoId}
        periodo={periodoDias}
        onPeriodoChange={setPeriodoDias}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={embarcacoesLoading}
      />

      {/* Métricas principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading || metricasLoading ? (
          <StatCardsGridSkeleton count={4} />
        ) : (
          <>
            <MetricCard
              title="Tripulantes Ativos"
              value={tripulantesAtivos.toString()}
              change={`de ${myTripulantes.length} cadastrados`}
              changeType="positive"
              icon={Users}
            />
            <MetricCard
              title="Status Hotspot"
              value={hotspotOnline ? "Online" : "Offline"}
              change={hotspotOnline ? formatTime(hotspotOnline.ultima_sincronizacao) : "Sem conexão"}
              changeType={hotspotOnline ? "positive" : "negative"}
              icon={Wifi}
            />
            <MetricCard
              title="Consumo Hoje"
              value={formatBytes(metricas?.consumoHoje || 0)}
              change={`${metricas?.sessoesHoje || 0} sessões hoje`}
              changeType="positive"
              icon={Download}
            />
            <MetricCard
              title="Sessões Ativas"
              value={(metricas?.sessoesAtivas || 0).toString()}
              change={sessoesAtivas?.length ? "Usuários conectados" : "Nenhum conectado"}
              changeType={sessoesAtivas?.length ? "positive" : "neutral"}
              icon={Activity}
            />
          </>
        )}
      </div>

      {/* Lista de Usuários Online */}
      <EmbarcacaoOnlineUsers 
        sessoes={sessoesAtivas} 
        isLoading={sessoesLoading}
        searchTerm={searchTerm}
      />

      {/* Gráficos de Consumo */}
      <div className="grid gap-4 md:grid-cols-2">
        <EmbarcacaoConsumptionChart 
          data={consumoHistorico} 
          isLoading={consumoHistoricoLoading}
          periodoDias={periodoDias}
        />
        <EmbarcacaoTopConsumers 
          data={topConsumidores} 
          isLoading={topConsumidoresLoading}
          periodoDias={periodoDias}
        />
      </div>

      {/* Rankings e Informações */}
      <div className="grid gap-4 md:grid-cols-2">
        <EmbarcacaoTopDuration 
          data={topDuracao} 
          isLoading={topDuracaoLoading}
          periodoDias={periodoDias}
        />

        {/* Informações da Embarcação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ship className="h-5 w-5" />
              Informações da Embarcação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {embarcacaoLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : embarcacao ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Ship className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{embarcacao.nome}</h3>
                    <p className="text-sm text-muted-foreground">{getTipoEmbarcacaoLabel(embarcacao.tipo)}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <StatusBadge status={embarcacao.status as any} />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Localização</p>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{embarcacao.localizacao || "Não definida"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Hotspot</p>
                    {myHotspots.length > 0 ? (
                      <StatusBadge status={myHotspots[0].status as any} />
                    ) : (
                      <span className="text-muted-foreground">Não configurado</span>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tripulantes</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold">{myTripulantes.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ship className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Selecione uma embarcação</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5" />
              Cadastrar Tripulante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione novos tripulantes à embarcação selecionada
            </p>
            <Button className="w-full" asChild>
              <Link to="/tripulantes">
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Tripulante
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wifi className="h-5 w-5" />
              Monitorar Hotspot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Visualize o status e configurações do hotspot
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/hotspots">
                <Activity className="h-4 w-4 mr-2" />
                Ver Status
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
