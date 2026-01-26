
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Ship, 
  Users, 
  AlertTriangle, 
  Activity,
  MapPin,
  Clock,
  UserPlus,
  Wifi
} from "lucide-react";

export function EmpresaAdminDashboard() {
  const { user } = useAuth();

  const embarcacoesDaEmpresa = [
    { id: 1, name: "Embarcação Atlas", tipo: "Navio Cargueiro", status: "ativo", location: "Porto de Santos", tripulantes: 45, hotspotStatus: "ativo" },
    { id: 2, name: "Navio Esperança", tipo: "Petroleiro", status: "ativo", location: "Porto do Rio", tripulantes: 32, hotspotStatus: "inativo" },
    { id: 3, name: "Lancha Marina", tipo: "Lancha", status: "ativo", location: "Marina da Glória", tripulantes: 12, hotspotStatus: "ativo" }
  ];

  const alertasEmpresa = [
    { id: 1, message: "Hotspot Navio Esperança está offline há 15 minutos", embarcacao: "Navio Esperança", type: "erro", time: "15:32" },
    { id: 2, message: "Tripulante João Silva foi cadastrado na Embarcação Atlas", embarcacao: "Embarcação Atlas", type: "info", time: "14:20" },
    { id: 3, message: "Limite de usuários atingido na Embarcação Atlas", embarcacao: "Embarcação Atlas", type: "aviso", time: "13:45" }
  ];

  const totalTripulantes = embarcacoesDaEmpresa.reduce((sum, emb) => sum + emb.tripulantes, 0);
  const hotspotsAtivos = embarcacoesDaEmpresa.filter(emb => emb.hotspotStatus === "ativo").length;
  const hotspotsInativos = embarcacoesDaEmpresa.filter(emb => emb.hotspotStatus === "inativo").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard da Empresa</h1>
          <p className="text-muted-foreground">
            Bem-vindo - Gerencie suas embarcações
          </p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Cadastrar Tripulante
        </Button>
      </div>

      {/* Métricas da empresa */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Embarcações"
          value={embarcacoesDaEmpresa.length.toString()}
          change="Todas ativas"
          changeType="positive"
          icon={Ship}
        />
        <MetricCard
          title="Tripulantes Ativos"
          value={totalTripulantes.toString()}
          change="+5 este mês"
          changeType="positive"
          icon={Users}
        />
        <MetricCard
          title="Hotspots Ativos"
          value={hotspotsAtivos.toString()}
          change={`${hotspotsInativos} inativos`}
          changeType={hotspotsInativos > 0 ? "negative" : "positive"}
          icon={Wifi}
        />
        <MetricCard
          title="Alertas Ativos"
          value={alertasEmpresa.filter(a => a.type === "erro").length.toString()}
          change="Últimas 24h"
          changeType="negative"
          icon={AlertTriangle}
        />
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
              <Button variant="outline" size="sm">
                Ver Detalhes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {embarcacoesDaEmpresa.map((embarcacao) => (
                <div key={embarcacao.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-navspot-blue-100 dark:bg-navspot-blue-900/20 flex items-center justify-center">
                      <Ship className="h-5 w-5 text-navspot-blue-600 dark:text-navspot-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">{embarcacao.name}</p>
                      <p className="text-sm text-muted-foreground">{embarcacao.tipo}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {embarcacao.location}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-sm font-medium">{embarcacao.tripulantes}</p>
                      <p className="text-xs text-muted-foreground">Tripulantes</p>
                    </div>
                    <StatusBadge status={embarcacao.hotspotStatus as any} />
                  </div>
                </div>
              ))}
            </div>
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
            <div className="space-y-4">
              {alertasEmpresa.map((alert) => (
                <div key={alert.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`h-2 w-2 rounded-full mt-2 ${
                      alert.type === "erro" ? "bg-red-500" : 
                      alert.type === "aviso" ? "bg-yellow-500" : "bg-blue-500"
                    }`}></div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-relaxed">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">{alert.embarcacao}</p>
                      <p className="text-xs text-muted-foreground">{alert.time}</p>
                    </div>
                  </div>
                  {alert.id !== alertasEmpresa.length && <div className="border-b"></div>}
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
              <Activity className="h-5 w-5" />
              Status dos Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Ativos</span>
                <span className="text-sm font-medium text-green-600">{hotspotsAtivos}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Hotspots Inativos</span>
                <span className="text-sm font-medium text-red-600">{hotspotsInativos}</span>
              </div>
              <Button variant="outline" size="sm" className="w-full">
                Monitorar Hotspots
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
              Cadastre e gerencie tripulantes das suas embarcações
            </p>
            <Button className="w-full">
              <UserPlus className="h-4 w-4 mr-2" />
              Cadastrar Tripulante
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
