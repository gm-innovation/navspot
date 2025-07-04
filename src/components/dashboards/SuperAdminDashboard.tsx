
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wifi, 
  Ship, 
  Users, 
  AlertTriangle, 
  Activity,
  MapPin,
  Clock,
  TrendingUp,
  Building2,
  Key,
  Settings
} from "lucide-react";

export function SuperAdminDashboard() {
  const recentHotspots = [
    { id: 1, name: "Embarcação Atlas", status: "ativo", location: "Porto de Santos", lastUpdate: "2 min atrás" },
    { id: 2, name: "Navio Esperança", status: "inativo", location: "Porto do Rio", lastUpdate: "15 min atrás" },
    { id: 3, name: "Lancha Marina", status: "ativo", location: "Marina da Glória", lastUpdate: "5 min atrás" },
    { id: 4, name: "Iate Poseidon", status: "alerta", location: "Angra dos Reis", lastUpdate: "1 min atrás" }
  ];

  const recentAlerts = [
    { id: 1, message: "Hotspot Navio Esperança está offline há 15 minutos", type: "erro", time: "15:32" },
    { id: 2, message: "Nova embarcação cadastrada: Iate Poseidon", type: "info", time: "14:20" },
    { id: 3, message: "Limite de usuários atingido na Embarcação Atlas", type: "aviso", time: "13:45" }
  ];

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
          <Button>
            <Key className="h-4 w-4 mr-2" />
            Configurar API
          </Button>
          <Button variant="outline">
            <Building2 className="h-4 w-4 mr-2" />
            Gerenciar Empresas
          </Button>
        </div>
      </div>

      {/* Métricas globais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total de Hotspots"
          value="24"
          change="+2 este mês"
          changeType="positive"
          icon={Wifi}
        />
        <MetricCard
          title="Embarcações Ativas"
          value="18"
          change="+12% vs mês anterior"
          changeType="positive"
          icon={Ship}
        />
        <MetricCard
          title="Usuários Totais"
          value="342"
          change="+24 novos"
          changeType="positive"
          icon={Users}
        />
        <MetricCard
          title="Alertas Críticos"
          value="3"
          change="2 precisam atenção"
          changeType="negative"
          icon={AlertTriangle}
        />
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
              <Button variant="outline" size="sm">
                Ver Todos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentHotspots.map((hotspot) => (
                <div key={hotspot.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-navspot-blue-500"></div>
                    <div>
                      <p className="font-medium">{hotspot.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {hotspot.location}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={hotspot.status as any} />
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {hotspot.lastUpdate}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alertas Críticos */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Badge 
                      variant={alert.type === "erro" ? "destructive" : alert.type === "aviso" ? "secondary" : "default"}
                      className="mt-0.5"
                    >
                      {alert.type}
                    </Badge>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-relaxed">{alert.message}</p>
                      <p className="text-xs text-muted-foreground">{alert.time}</p>
                    </div>
                  </div>
                  {alert.id !== recentAlerts.length && <div className="border-b"></div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botões de Gerenciamento */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações da API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Gerencie tokens da API WiFi Manager
            </p>
            <Button className="w-full">
              <Key className="h-4 w-4 mr-2" />
              Configurar Token
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Empresas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Cadastre e gerencie empresas cliente
            </p>
            <Button className="w-full" variant="outline">
              <Building2 className="h-4 w-4 mr-2" />
              Gerenciar Empresas
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Cadastre administradores e usuários
            </p>
            <Button className="w-full" variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Gerenciar Usuários
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
