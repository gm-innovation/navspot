import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { 
  Ship, 
  Users, 
  AlertTriangle, 
  Activity,
  MapPin,
  Clock,
  UserPlus,
  Wifi,
  User
} from "lucide-react";
import { useEmbarcacao } from "@/hooks/useEmbarcacoes";
import { useHotspots } from "@/hooks/useHotspots";
import { useTripulantes } from "@/hooks/useTripulantes";
import { useAcoesPendentes } from "@/hooks/useAcoesPendentes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function GerenteEmbarcacaoDashboard() {
  const { user } = useAuth();
  const { data: embarcacao, isLoading: embarcacaoLoading } = useEmbarcacao(user?.embarcacao_id);
  const { data: hotspots, isLoading: hotspotsLoading } = useHotspots();
  const { data: tripulantes, isLoading: tripulantesLoading } = useTripulantes();
  const { data: acoesPendentes } = useAcoesPendentes();

  // Filter data for this embarcacao
  const myHotspots = hotspots?.filter(h => h.embarcacao_id === user?.embarcacao_id) || [];
  const myTripulantes = tripulantes?.filter(t => t.embarcacao_id === user?.embarcacao_id) || [];
  const myPendingActions = acoesPendentes?.filter(a => 
    myHotspots.some(h => h.id === a.hotspot_id) && a.status === 'pendente'
  ).length || 0;

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

      {/* Métricas da embarcação */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-8 w-20 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))}
          </>
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
              title="Localização"
              value="Atualizada"
              change={embarcacao?.localizacao || "Não definida"}
              changeType="positive"
              icon={MapPin}
            />
            <MetricCard
              title="Ações Pendentes"
              value={myPendingActions.toString()}
              change={myPendingActions > 0 ? "Aguardando sync" : "Tudo sincronizado"}
              changeType={myPendingActions > 0 ? "negative" : "positive"}
              icon={AlertTriangle}
            />
          </>
        )}
      </div>

      {/* Informações da Embarcação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Informações da Embarcação
          </CardTitle>
        </CardHeader>
        <CardContent>
          {embarcacaoLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : embarcacao ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Ship className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{embarcacao.nome}</h3>
                    <p className="text-muted-foreground capitalize">{embarcacao.tipo}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <StatusBadge status={embarcacao.status as any} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Localização</p>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{embarcacao.localizacao || "Não definida"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Status do Hotspot</p>
                  {myHotspots.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={myHotspots[0].status as any} />
                      <span className="text-sm text-muted-foreground">
                        Última sincronização: {formatTime(myHotspots[0].ultima_sincronizacao)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum hotspot configurado</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm font-medium mb-2">Tripulantes</p>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-semibold">{myTripulantes.length}</span>
                    <span className="text-sm text-muted-foreground">cadastrados</span>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Tripulantes Recentes */}
        <Card className="col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Tripulantes Recentes
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/tripulantes">Ver Todos</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tripulantesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : myTripulantes.length > 0 ? (
              <div className="space-y-4">
                {myTripulantes.slice(0, 4).map((tripulante) => (
                  <div key={tripulante.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{tripulante.nome}</p>
                        <p className="text-sm text-muted-foreground">{tripulante.cargo || 'Tripulante'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {tripulante.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(tripulante.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum tripulante cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades Recentes */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Ações Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {acoesPendentes && acoesPendentes.filter(a => a.status === 'pendente').length > 0 ? (
              <div className="space-y-4">
                {acoesPendentes.filter(a => a.status === 'pendente').slice(0, 5).map((acao, index) => (
                  <div key={acao.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full mt-2 bg-yellow-500 animate-pulse"></div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm leading-relaxed capitalize">{acao.tipo.replace('_', ' ')}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(acao.created_at)}
                        </div>
                      </div>
                    </div>
                    {index < 4 && <div className="border-b"></div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma ação pendente</p>
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
            <CardTitle className="flex items-center gap-2">
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
