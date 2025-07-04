
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
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

export function GerenteEmbarcacaoDashboard() {
  const { user } = useAuth();

  // Dados da embarcação vinculada
  const embarcacao = {
    id: 1,
    name: "Embarcação Atlas",
    tipo: "Navio Cargueiro",
    status: "ativo",
    location: "Porto de Santos",
    tripulantes: 45,
    hotspotStatus: "ativo",
    ultimaAtualizacao: "2 min atrás"
  };

  const tripulantesRecentes = [
    { id: 1, name: "João Silva", cargo: "Marinheiro", status: "ativo", cadastro: "Hoje" },
    { id: 2, name: "Maria Santos", cargo: "Comandante", status: "ativo", cadastro: "Ontem" },
    { id: 3, name: "Pedro Costa", cargo: "Oficial", status: "ativo", cadastro: "2 dias atrás" },
    { id: 4, name: "Ana Oliveira", cargo: "Imediato", status: "ativo", cadastro: "3 dias atrás" }
  ];

  const alertasEmbarcacao = [
    { id: 1, message: "Tripulante João Silva foi cadastrado", type: "info", time: "10:30" },
    { id: 2, message: "Hotspot funcionando normalmente", type: "success", time: "09:15" },
    { id: 3, message: "Backup de dados realizado", type: "info", time: "08:00" }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minha Embarcação</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {user?.name} - Gerencie sua embarcação
          </p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Cadastrar Tripulante
        </Button>
      </div>

      {/* Métricas da embarcação */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Tripulantes Ativos"
          value={embarcacao.tripulantes.toString()}
          change="+3 esta semana"
          changeType="positive"
          icon={Users}
        />
        <MetricCard
          title="Status Hotspot"
          value={embarcacao.hotspotStatus === "ativo" ? "Online" : "Offline"}
          change={embarcacao.ultimaAtualizacao}
          changeType={embarcacao.hotspotStatus === "ativo" ? "positive" : "negative"}
          icon={Wifi}
        />
        <MetricCard
          title="Localização"
          value="Atualizada"
          change={embarcacao.location}
          changeType="positive"
          icon={MapPin}
        />
        <MetricCard
          title="Alertas"
          value="0"
          change="Tudo funcionando"
          changeType="positive"
          icon={AlertTriangle}
        />
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
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-navspot-blue-100 dark:bg-navspot-blue-900/20 flex items-center justify-center">
                  <Ship className="h-6 w-6 text-navspot-blue-600 dark:text-navspot-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{embarcacao.name}</h3>
                  <p className="text-muted-foreground">{embarcacao.tipo}</p>
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
                    <span className="text-sm">{embarcacao.location}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Status do Hotspot</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={embarcacao.hotspotStatus as any} />
                  <span className="text-sm text-muted-foreground">
                    Última atualização: {embarcacao.ultimaAtualizacao}
                  </span>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-2">Tripulantes</p>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg font-semibold">{embarcacao.tripulantes}</span>
                  <span className="text-sm text-muted-foreground">cadastrados</span>
                </div>
              </div>
            </div>
          </div>
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
              <Button variant="outline" size="sm">
                Ver Todos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tripulantesRecentes.map((tripulante) => (
                <div key={tripulante.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-navspot-blue-100 dark:bg-navspot-blue-900/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-navspot-blue-600 dark:text-navspot-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">{tripulante.name}</p>
                      <p className="text-sm text-muted-foreground">{tripulante.cargo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {tripulante.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {tripulante.cadastro}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Atividades Recentes */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Atividades Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alertasEmbarcacao.map((alert) => (
                <div key={alert.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`h-2 w-2 rounded-full mt-2 ${
                      alert.type === "success" ? "bg-green-500" : 
                      alert.type === "info" ? "bg-blue-500" : "bg-yellow-500"
                    }`}></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-relaxed">{alert.message}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {alert.time}
                      </div>
                    </div>
                  </div>
                  {alert.id !== alertasEmbarcacao.length && <div className="border-b"></div>}
                </div>
              ))}
            </div>
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
            <Button className="w-full">
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Tripulante
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
            <Button variant="outline" className="w-full">
              <Activity className="h-4 w-4 mr-2" />
              Ver Status
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
