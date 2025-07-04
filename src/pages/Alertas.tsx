
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Bell, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings
} from "lucide-react";

export default function Alertas() {
  const alertas = [
    {
      id: 1,
      tipo: "crítico",
      titulo: "Hotspot Offline",
      descricao: "Navio Esperança está sem conexão há 15 minutos",
      embarcacao: "Esperança Transportes",
      timestamp: "15:32 - Hoje",
      status: "ativo",
      acao: "Notificação enviada por email"
    },
    {
      id: 2,
      tipo: "aviso",
      titulo: "Limite de Usuários",
      descricao: "Iate Poseidon atingiu 90% da capacidade (23/25 usuários)",
      embarcacao: "Poseidon Luxury",
      timestamp: "14:45 - Hoje",
      status: "ativo",
      acao: "WhatsApp enviado"
    },
    {
      id: 3,
      tipo: "info",
      titulo: "Nova Embarcação",
      descricao: "Embarcação Marina Express foi cadastrada no sistema",
      embarcacao: "Marina Express",
      timestamp: "13:20 - Hoje",
      status: "resolvido",
      acao: "Log registrado"
    },
    {
      id: 4,
      tipo: "crítico",
      titulo: "Falha de Sincronização",
      descricao: "Erro ao sincronizar dados com a API WiFi Manager",
      embarcacao: "Sistema Geral",
      timestamp: "12:15 - Hoje",
      status: "resolvido",
      acao: "Webhook disparado"
    },
    {
      id: 5,
      tipo: "aviso",
      titulo: "Sinal Fraco",
      descricao: "Qualidade do sinal do Atlas Marine está em 45%",
      embarcacao: "Atlas Marine",
      timestamp: "11:30 - Hoje",
      status: "ativo",
      acao: "Alerta no painel"
    }
  ];

  const getAlertIcon = (tipo: string) => {
    switch (tipo) {
      case "crítico":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "aviso":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "info":
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const getAlertBadgeColor = (tipo: string) => {
    switch (tipo) {
      case "crítico":
        return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400";
      case "aviso":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "info":
        return "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const alertasAtivos = alertas.filter(a => a.status === "ativo").length;
  const alertasCriticos = alertas.filter(a => a.tipo === "crítico" && a.status === "ativo").length;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alertas e Logs</h1>
          <p className="text-muted-foreground">
            Monitore todos os alertas e histórico de ações do sistema
          </p>
        </div>
        <Button variant="outline">
          <Settings className="h-4 w-4 mr-2" />
          Configurar Alertas
        </Button>
      </div>

      {/* Dashboard de alertas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{alertas.length}</p>
              <p className="text-sm text-muted-foreground">Total Hoje</p>
            </div>
            <Bell className="h-8 w-8 text-navspot-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-red-600">{alertasCriticos}</p>
              <p className="text-sm text-muted-foreground">Críticos</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-yellow-600">2</p>
              <p className="text-sm text-muted-foreground">Avisos</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">{alertas.filter(a => a.status === "resolvido").length}</p>
              <p className="text-sm text-muted-foreground">Resolvidos</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Histórico de Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {alertas.map((alerta) => (
              <div key={alerta.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                <div className="flex-shrink-0 mt-1">
                  {getAlertIcon(alerta.tipo)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge 
                      variant="secondary"
                      className={getAlertBadgeColor(alerta.tipo)}
                    >
                      {alerta.tipo.charAt(0).toUpperCase() + alerta.tipo.slice(1)}
                    </Badge>
                    <Badge 
                      variant={alerta.status === "ativo" ? "destructive" : "default"}
                      className={alerta.status === "resolvido" ? 
                        "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : 
                        ""
                      }
                    >
                      {alerta.status === "ativo" ? "Ativo" : "Resolvido"}
                    </Badge>
                  </div>
                  
                  <h3 className="font-semibold text-foreground mb-1">
                    {alerta.titulo}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-2">
                    {alerta.descricao}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {alerta.timestamp}
                    </div>
                    <span>•</span>
                    <span>{alerta.embarcacao}</span>
                    <span>•</span>
                    <span>{alerta.acao}</span>
                  </div>
                </div>
                
                <div className="flex-shrink-0">
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configurações de alertas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Canais de Notificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">Notificações por email</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">Mensagens via WhatsApp</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Webhook</p>
                <p className="text-sm text-muted-foreground">Integração via webhook</p>
              </div>
              <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
                Configurar
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações Automáticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-resolução</p>
                <p className="text-sm text-muted-foreground">Resolver alertas automaticamente</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Agrupamento</p>
                <p className="text-sm text-muted-foreground">Agrupar alertas similares</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Escalação</p>
                <p className="text-sm text-muted-foreground">Escalar alertas não resolvidos</p>
              </div>
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                Configurar
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
