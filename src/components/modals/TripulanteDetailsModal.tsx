import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Smartphone, 
  Activity,
  Download,
  Clock,
  Ship,
  AlertTriangle,
  Bell
} from "lucide-react";
import { TripulanteDevicesTab } from "@/components/TripulanteDevicesTab";
import { TripulanteWithDetails } from "@/hooks/useTripulantes";
import { useTripulanteAlertas } from "@/hooks/useTripulanteAlertas";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TripulanteDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripulante: TripulanteWithDetails | null;
}

export function TripulanteDetailsModal({ open, onOpenChange, tripulante }: TripulanteDetailsModalProps) {
  const [activeTab, setActiveTab] = useState("info");
  const { data: alertas } = useTripulanteAlertas(tripulante?.id);

  if (!tripulante) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatLastLogin = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

  // Calculate quota percentage
  const quotaPercentual = tripulante.quota_percentual ?? (
    tripulante.limite_dados_mb 
      ? (tripulante.bytes_consumidos / (tripulante.limite_dados_mb * 1024 * 1024)) * 100 
      : 0
  );

  // Format block reason
  const formatBloqueioMotivo = (motivo: string | null): string => {
    if (!motivo) return "";
    const motivos: Record<string, string> = {
      'manual': 'Bloqueio manual',
      'quota_exceeded': 'Quota de dados excedida',
      'device_limit': 'Limite de dispositivos atingido',
      'device_sharing': 'Compartilhamento de credenciais',
      'security': 'Motivo de segurança',
    };
    return motivos[motivo] || motivo;
  };

  // Get severity color for alerts
  const getSeveridadeColor = (severidade: string): string => {
    const colors: Record<string, string> = {
      'critical': 'border-destructive text-destructive',
      'warning': 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
      'info': 'border-blue-500 text-blue-600 dark:text-blue-400',
    };
    return colors[severidade] || 'border-muted text-muted-foreground';
  };

  // Get max_dispositivos from profile if available, default to 1
  const maxDispositivos = 2; // TODO: Get from perfil when relation is loaded

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {tripulante.nome}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            @{tripulante.login_wifi}
            <Badge 
              variant={tripulante.status === "ativo" ? "default" : "secondary"}
              className={
                tripulante.status === "ativo" 
                  ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                  : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
              }
            >
              {tripulante.status}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Informações
            </TabsTrigger>
            <TabsTrigger value="dispositivos" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Dispositivos
            </TabsTrigger>
            <TabsTrigger value="consumo" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Consumo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <User className="h-4 w-4" />
                    <span className="text-sm">Cargo</span>
                  </div>
                  <p className="font-medium">{tripulante.cargo || "Não informado"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Ship className="h-4 w-4" />
                    <span className="text-sm">Embarcação</span>
                  </div>
                  <p className="font-medium">{tripulante.embarcacao_nome || "Não atribuída"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Download className="h-4 w-4" />
                    <span className="text-sm">Perfil de Velocidade</span>
                  </div>
                  <p className="font-medium">{tripulante.perfil_nome || "Padrão"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Último Login</span>
                  </div>
                  <p className="font-medium">{formatLastLogin(tripulante.ultimo_login)}</p>
                </CardContent>
              </Card>
            </div>

            {tripulante.email && (
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Email</div>
                  <p className="font-medium">{tripulante.email}</p>
                </CardContent>
              </Card>
            )}

            {tripulante.cpf && (
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">CPF</div>
                  <p className="font-medium">{tripulante.cpf}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="dispositivos" className="mt-4">
            <TripulanteDevicesTab 
              tripulanteId={tripulante.id}
              tripulanteNome={tripulante.nome}
              maxDispositivos={maxDispositivos}
            />
          </TabsContent>

          <TabsContent value="consumo" className="mt-4 space-y-4">
            {/* Quota Progress Bar */}
            {tripulante.limite_dados_mb && (
              <Card className={quotaPercentual >= 100 ? "border-destructive" : quotaPercentual >= 80 ? "border-yellow-500" : ""}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      {quotaPercentual >= 100 && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      Quota de Dados
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatBytes(tripulante.bytes_consumidos)} / {tripulante.limite_dados_mb} MB
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(quotaPercentual, 100)} 
                    className={`h-3 ${quotaPercentual >= 100 ? "[&>div]:bg-destructive" : quotaPercentual >= 80 ? "[&>div]:bg-yellow-500" : ""}`}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className={`text-sm font-medium ${quotaPercentual >= 100 ? "text-destructive" : quotaPercentual >= 80 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                      {Math.round(quotaPercentual)}% utilizado
                    </span>
                    {quotaPercentual >= 100 && (
                      <Badge variant="destructive" className="text-xs">
                        Quota Excedida
                      </Badge>
                    )}
                  </div>
                  {quotaPercentual >= 100 && (
                    <p className="text-xs text-destructive mt-2">
                      O usuário foi desconectado automaticamente por exceder a quota de dados.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Block reason if blocked */}
            {tripulante.status === 'bloqueado' && tripulante.bloqueio_motivo && (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Usuário Bloqueado</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Motivo:</strong> {formatBloqueioMotivo(tripulante.bloqueio_motivo)}
                  </p>
                  {tripulante.bloqueado_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Bloqueado {formatLastLogin(tripulante.bloqueado_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Download className="h-4 w-4" />
                    <span className="text-sm">Total Consumido</span>
                  </div>
                  <p className="text-2xl font-bold">{formatBytes(tripulante.bytes_consumidos)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm">Status</span>
                  </div>
                  <Badge 
                    variant={tripulante.status === "ativo" ? "default" : "secondary"}
                    className={
                      tripulante.status === "ativo" 
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                        : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    }
                  >
                    {tripulante.status === "ativo" ? "Ativo" : tripulante.status === "bloqueado" ? "Bloqueado" : "Inativo"}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Recent Alerts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Alertas Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {alertas && alertas.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {alertas.map(alerta => (
                      <div key={alerta.id} className="flex items-start gap-2 text-sm py-2 border-b last:border-0">
                        <Badge 
                          variant="outline" 
                          className={`${getSeveridadeColor(alerta.severidade)} text-xs shrink-0`}
                        >
                          {alerta.severidade}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-muted-foreground truncate">{alerta.mensagem}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatLastLogin(alerta.created_at)}
                            {alerta.resolvido && <span className="text-green-600 ml-2">✓ Resolvido</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum alerta recente</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-2">Credenciais WiFi</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Login</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded">{tripulante.login_wifi}</code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Senha</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded">{tripulante.senha_wifi}</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
