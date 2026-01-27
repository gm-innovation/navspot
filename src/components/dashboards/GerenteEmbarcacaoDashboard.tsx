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
  Clock
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
import { EmbarcacaoOnlineUsers } from "./EmbarcacaoOnlineUsers";
import { EmbarcacaoConsumptionChart } from "./EmbarcacaoConsumptionChart";
import { EmbarcacaoTopConsumers } from "./EmbarcacaoTopConsumers";
import { EmbarcacaoTopDuration } from "./EmbarcacaoTopDuration";
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

  const { user } = useAuth();
  const { data: embarcacao, isLoading: embarcacaoLoading } = useEmbarcacao(user?.embarcacao_id);
  const { data: hotspots, isLoading: hotspotsLoading } = useHotspots();
  const { data: tripulantes, isLoading: tripulantesLoading } = useTripulantes();

  // New hooks for dashboard data
  const { data: sessoesAtivas, isLoading: sessoesLoading } = useSessoesAtivasEmbarcacao(user?.embarcacao_id);
  const { data: topConsumidores, isLoading: topConsumidoresLoading } = useTopConsumidoresEmbarcacao(user?.embarcacao_id);
  const { data: consumoHistorico, isLoading: consumoHistoricoLoading } = useConsumoHistoricoEmbarcacao(user?.embarcacao_id);
  const { data: topDuracao, isLoading: topDuracaoLoading } = useTopDuracaoEmbarcacao(user?.embarcacao_id);
  const { data: metricas, isLoading: metricasLoading } = useMetricasEmbarcacao(user?.embarcacao_id);

  // Filter data for this embarcacao
  const myHotspots = hotspots?.filter(h => h.embarcacao_id === user?.embarcacao_id) || [];
  const myTripulantes = tripulantes?.filter(t => t.embarcacao_id === user?.embarcacao_id) || [];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minha Embarcação</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {user?.email?.split('@')[0]} - Gerencie sua embarcação
          </p>
        </div>
        <Button asChild>
          <Link to="/tripulantes">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Tripulante
          </Link>
        </Button>
      </div>

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
      />

      {/* Gráficos de Consumo */}
      <div className="grid gap-4 md:grid-cols-2">
        <EmbarcacaoConsumptionChart 
          data={consumoHistorico} 
          isLoading={consumoHistoricoLoading} 
        />
        <EmbarcacaoTopConsumers 
          data={topConsumidores} 
          isLoading={topConsumidoresLoading} 
        />
      </div>

      {/* Rankings e Informações */}
      <div className="grid gap-4 md:grid-cols-2">
        <EmbarcacaoTopDuration 
          data={topDuracao} 
          isLoading={topDuracaoLoading} 
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
                <p>Embarcação não encontrada</p>
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
              Adicione novos tripulantes à sua embarcação
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
