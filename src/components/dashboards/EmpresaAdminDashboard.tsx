import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCardsGridSkeleton } from "@/components/ui/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { 
  Ship, 
  Users, 
  AlertTriangle, 
  Activity,
  MapPin,
  UserPlus,
  Wifi
} from "lucide-react";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { useHotspots } from "@/hooks/useHotspots";
import { useTripulantes } from "@/hooks/useTripulantes";
import { useRecentAlerts } from "@/hooks/useDashboard";
import { useDashboardRealtime } from "@/hooks/useRealtimeSubscription";

export function EmpresaAdminDashboard() {
  // Enable realtime updates
  useDashboardRealtime();

  const { user } = useAuth();
  const { data: embarcacoes, isLoading: embarcacoesLoading } = useEmbarcacoes();
  const { data: hotspots, isLoading: hotspotsLoading } = useHotspots();
  const { data: tripulantes, isLoading: tripulantesLoading } = useTripulantes();
  const { data: alertas, isLoading: alertasLoading } = useRecentAlerts(5);

  const totalTripulantes = tripulantes?.length || 0;
  const tripulantesAtivos = tripulantes?.filter(t => t.status === 'ativo').length || 0;
  const hotspotsOnline = hotspots?.filter(h => h.status === 'online').length || 0;
  const hotspotsOffline = hotspots?.filter(h => h.status === 'offline').length || 0;
  const alertasCriticos = alertas?.filter(a => a.severidade === 'critical').length || 0;

  const isLoading = embarcacoesLoading || hotspotsLoading || tripulantesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard da Empresa</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {user?.email?.split('@')[0]} - Gerencie suas embarcações
          </p>
        </div>
        <Button asChild>
          <Link to="/tripulantes">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Tripulante
          </Link>
        </Button>
      </div>

      {/* Métricas da empresa */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <StatCardsGridSkeleton count={4} />
        ) : (
          <>
            <MetricCard
              title="Embarcações"
              value={(embarcacoes?.length || 0).toString()}
              change={`${embarcacoes?.filter(e => e.status === 'ativo').length || 0} ativas`}
              changeType="positive"
              icon={Ship}
            />
            <MetricCard
              title="Tripulantes Ativos"
              value={tripulantesAtivos.toString()}
              change={`de ${totalTripulantes} total`}
              changeType="positive"
              icon={Users}
            />
            <MetricCard
              title="Hotspots Online"
              value={hotspotsOnline.toString()}
              change={`${hotspotsOffline} offline`}
              changeType={hotspotsOffline > 0 ? "negative" : "positive"}
              icon={Wifi}
            />
            <MetricCard
              title="Alertas Ativos"
              value={(alertas?.length || 0).toString()}
              change={`${alertasCriticos} críticos`}
              changeType={alertasCriticos > 0 ? "negative" : "positive"}
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Embarcações da Empresa */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Suas Embarcações
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/embarcacoes">Ver Detalhes</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {embarcacoesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : embarcacoes && embarcacoes.length > 0 ? (
              <div className="space-y-4">
                {embarcacoes.slice(0, 4).map((embarcacao) => (
                  <div key={embarcacao.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Ship className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{embarcacao.nome}</p>
                        <p className="text-sm text-muted-foreground capitalize">{embarcacao.tipo}</p>
                        {embarcacao.localizacao && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {embarcacao.localizacao}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-sm font-medium">{embarcacao.tripulantes_count || 0}</p>
                        <p className="text-xs text-muted-foreground">Tripulantes</p>
                      </div>
                      <StatusBadge status={embarcacao.status as any} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ship className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma embarcação cadastrada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas da Empresa */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas da Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertasLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : alertas && alertas.length > 0 ? (
              <div className="space-y-4">
                {alertas.map((alert, index) => (
                  <div key={alert.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className={`h-2 w-2 rounded-full mt-2 ${
                        alert.severidade === "critical" ? "bg-red-500" : 
                        alert.severidade === "warning" ? "bg-yellow-500" : "bg-blue-500"
                      }`}></div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm leading-relaxed">{alert.mensagem}</p>
                        <p className="text-xs text-muted-foreground">{alert.tipo}</p>
                      </div>
                    </div>
                    {index !== alertas.length - 1 && <div className="border-b"></div>}
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

      {/* Ações Rápidas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Status dos Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Online</span>
                <span className="text-sm font-medium text-green-600">{hotspotsOnline}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Offline</span>
                <span className="text-sm font-medium text-red-600">{hotspotsOffline}</span>
              </div>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to="/hotspots">Monitorar Hotspots</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gerenciar Tripulantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {tripulantesAtivos} tripulantes ativos de {totalTripulantes} cadastrados
            </p>
            <Button className="w-full" asChild>
              <Link to="/tripulantes">
                <UserPlus className="h-4 w-4 mr-2" />
                Gerenciar Tripulantes
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
