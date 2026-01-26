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
import { Card, CardContent } from "@/components/ui/card";
import { 
  User, 
  Smartphone, 
  Activity,
  Download,
  Clock,
  Ship
} from "lucide-react";
import { TripulanteDevicesTab } from "@/components/TripulanteDevicesTab";
import { TripulanteWithDetails } from "@/hooks/useTripulantes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TripulanteDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripulante: TripulanteWithDetails | null;
}

export function TripulanteDetailsModal({ open, onOpenChange, tripulante }: TripulanteDetailsModalProps) {
  const [activeTab, setActiveTab] = useState("info");

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
