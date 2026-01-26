import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCardsGridSkeleton } from "@/components/ui/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wifi, 
  Ship, 
  Users, 
  AlertTriangle, 
  Activity,
  Clock,
  Building2,
  Shield,
  Smartphone,
  List
} from "lucide-react";
import { Link } from "react-router-dom";
import { 
  useDashboardStats, 
  useRecentHotspots, 
  useRecentAlerts 
} from "@/hooks/useDashboard";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscription";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SuperAdminDashboard() {
  // Enable realtime updates
  useDashboardRealtime();

  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentHotspots, isLoading: hotspotsLoading } = useRecentHotspots(5);
  const { data: recentAlerts, isLoading: alertsLoading } = useRecentAlerts(5);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Super Admin</h1>
          <p className="text-muted-foreground">
            Visão geral completa do sistema NAVSPOT
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/embarcacoes">
              <Building2 className="h-4 w-4 mr-2" />
              Gerenciar Empresas
            </Link>
          </Button>
        </div>
      </div>

      {/* Métricas globais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <StatCardsGridSkeleton count={4} />
        ) : (
          <>
            <MetricCard
              title="Total de Hotspots"
              value={stats?.totalHotspots.toString() || "0"}
              change={`${stats?.hotspotsOnline || 0} online`}
              changeType={stats?.hotspotsOnline && stats.hotspotsOnline > 0 ? "positive" : "neutral"}
              icon={Wifi}
            />
            <MetricCard
              title="Embarcações Ativas"
              value={stats?.embarcacoesAtivas.toString() || "0"}
              change={`de ${stats?.totalEmbarcacoes || 0} total`}
              changeType="positive"
              icon={Ship}
            />
            <MetricCard
              title="Usuários Totais"
              value={stats?.totalTripulantes.toString() || "0"}
              change={`${stats?.tripulantesAtivos || 0} ativos`}
              changeType="positive"
              icon={Users}
            />
            <MetricCard
              title="Alertas Ativos"
              value={stats?.alertasNaoResolvidos.toString() || "0"}
              change={`${stats?.alertasCriticos || 0} críticos`}
              changeType={stats?.alertasCriticos && stats.alertasCriticos > 0 ? "negative" : "neutral"}
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Status dos Hotspots */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Status Global dos Hotspots
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/hotspots">Ver Todos</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {hotspotsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentHotspots && recentHotspots.length > 0 ? (
              <div className="space-y-4">
                {recentHotspots.map((hotspot) => (
                  <div key={hotspot.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary"></div>
                      <div>
                        <p className="font-medium">{hotspot.nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {hotspot.embarcacao_nome}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={hotspot.status as any} />
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(hotspot.ultima_sincronizacao)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum hotspot cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas Críticos */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentAlerts && recentAlerts.length > 0 ? (
              <div className="space-y-4">
                {recentAlerts.map((alert, index) => (
                  <div key={alert.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <Badge 
                        variant={alert.severidade === "critical" ? "destructive" : alert.severidade === "warning" ? "secondary" : "default"}
                        className="mt-0.5"
                      >
                        {alert.severidade}
                      </Badge>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm leading-relaxed">{alert.mensagem}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(alert.created_at)}</p>
                      </div>
                    </div>
                    {index !== recentAlerts.length - 1 && <div className="border-b"></div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum alerta ativo</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas Resumidas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Status de Conectividade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Online</span>
                <span className="text-sm font-medium text-green-600">{stats?.hotspotsOnline || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Offline</span>
                <span className="text-sm font-medium text-red-600">{stats?.hotspotsOffline || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Em Alerta</span>
                <span className="text-sm font-medium text-yellow-600">{stats?.hotspotsAlerta || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Controle de Acesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Perfis de Velocidade</span>
                <span className="text-sm font-medium">{stats?.totalPerfis || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Listas de Acesso</span>
                <span className="text-sm font-medium">{stats?.totalListasAcesso || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Regras Ativas</span>
                <span className="text-sm font-medium text-primary">{stats?.totalRegrasAcesso || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Dispositivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Total Registrados</span>
                <span className="text-sm font-medium">{stats?.totalDispositivos || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Autorizados</span>
                <span className="text-sm font-medium text-green-600">{stats?.dispositivosAutorizados || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Bloqueados</span>
                <span className="text-sm font-medium text-red-600">
                  {(stats?.totalDispositivos || 0) - (stats?.dispositivosAutorizados || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Tripulantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {stats?.tripulantesAtivos || 0} de {stats?.totalTripulantes || 0} ativos
            </p>
            <Button className="w-full" variant="outline" asChild>
              <Link to="/tripulantes">
                <Users className="h-4 w-4 mr-2" />
                Gerenciar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
