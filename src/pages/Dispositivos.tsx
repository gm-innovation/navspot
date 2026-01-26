import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  Wifi,
  WifiOff,
  Search,
  Plus,
  Filter,
  ShieldCheck,
  ShieldOff,
  Ship,
  User,
  MoreHorizontal,
  Ban,
  Check,
  Eye,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
import {
  useDispositivosRegistrados,
  useCreateDispositivo,
  useBlockDispositivo,
  useUnblockDispositivo,
  DispositivoWithTripulante,
  TIPOS_DISPOSITIVO,
  formatBytes,
  formatMacAddress,
} from "@/hooks/useDispositivosRegistrados";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type FilterStatus = "all" | "autorizado" | "bloqueado";
type FilterType = "all" | "tripulante" | "embarcacao";

const getDeviceIcon = (tipo: string) => {
  switch (tipo) {
    case "celular":
      return Smartphone;
    case "notebook":
      return Laptop;
    case "tablet":
      return Tablet;
    case "desktop":
      return Monitor;
    default:
      return Wifi;
  }
};

export default function Dispositivos() {
  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterEmbarcacao, setFilterEmbarcacao] = useState<string>("all");

  // Modal states
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DispositivoWithTripulante | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // New device form
  const [newDevice, setNewDevice] = useState({
    mac_address: "",
    nome: "",
    tipo: "outro",
    embarcacao_id: "",
    autorizado: true,
  });

  // Queries and mutations
  const { data: dispositivos, isLoading, refetch } = useDispositivosRegistrados();
  const { data: embarcacoes } = useEmbarcacoes();
  const createDispositivo = useCreateDispositivo();
  const blockDispositivo = useBlockDispositivo();
  const unblockDispositivo = useUnblockDispositivo();

  // Filter devices
  const filteredDevices = dispositivos?.filter((device) => {
    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchName = device.nome?.toLowerCase().includes(search);
      const matchMac = device.mac_address.toLowerCase().includes(search);
      const matchTripulante = device.tripulante?.nome?.toLowerCase().includes(search);
      if (!matchName && !matchMac && !matchTripulante) return false;
    }

    // Status filter
    if (filterStatus === "autorizado" && !device.autorizado) return false;
    if (filterStatus === "bloqueado" && device.autorizado) return false;

    // Type filter
    if (filterType === "tripulante" && !device.tripulante_id) return false;
    if (filterType === "embarcacao" && device.tripulante_id) return false;

    // Embarcacao filter
    if (filterEmbarcacao !== "all") {
      if (device.embarcacao_id !== filterEmbarcacao) {
        // Check if tripulante belongs to embarcacao
        // This would require additional data join
        return false;
      }
    }

    return true;
  }) || [];

  // Statistics
  const stats = {
    total: dispositivos?.length || 0,
    autorizados: dispositivos?.filter((d) => d.autorizado).length || 0,
    bloqueados: dispositivos?.filter((d) => !d.autorizado).length || 0,
    tripulantes: dispositivos?.filter((d) => d.tripulante_id).length || 0,
    embarcacoes: dispositivos?.filter((d) => d.embarcacao_id && !d.tripulante_id).length || 0,
  };

  const handleCreateDevice = () => {
    if (!newDevice.mac_address || !newDevice.embarcacao_id) return;

    createDispositivo.mutate(
      {
        mac_address: newDevice.mac_address.toUpperCase().replace(/[^A-F0-9]/g, "").match(/.{1,2}/g)?.join(":") || newDevice.mac_address,
        nome: newDevice.nome || `Equipamento ${newDevice.tipo}`,
        tipo: newDevice.tipo,
        embarcacao_id: newDevice.embarcacao_id,
        autorizado: newDevice.autorizado,
      },
      {
        onSuccess: () => {
          setShowNewDevice(false);
          setNewDevice({ mac_address: "", nome: "", tipo: "outro", embarcacao_id: "", autorizado: true });
        },
      }
    );
  };

  const handleBlock = () => {
    if (!selectedDevice) return;

    blockDispositivo.mutate(
      {
        id: selectedDevice.id,
        bloqueio_motivo: blockReason || "Bloqueado pelo administrador",
      },
      {
        onSuccess: () => {
          setShowBlockModal(false);
          setSelectedDevice(null);
          setBlockReason("");
        },
      }
    );
  };

  const handleUnblock = (device: DispositivoWithTripulante) => {
    unblockDispositivo.mutate(device.id);
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Nunca";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispositivos</h1>
          <p className="text-muted-foreground">
            Gerencie todos os dispositivos cadastrados no sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={() => setShowNewDevice(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Equipamento de Embarcação
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          title="Total"
          value={stats.total}
          icon={Wifi}
        />
        <MetricCard
          title="Autorizados"
          value={stats.autorizados}
          icon={ShieldCheck}
          iconColor="text-green-500"
        />
        <MetricCard
          title="Bloqueados"
          value={stats.bloqueados}
          icon={ShieldOff}
          iconColor="text-red-500"
        />
        <MetricCard
          title="Tripulantes"
          value={stats.tripulantes}
          icon={User}
        />
        <MetricCard
          title="Equipamentos"
          value={stats.embarcacoes}
          icon={Ship}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar MAC, nome ou tripulante..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="autorizado">Autorizados</SelectItem>
              <SelectItem value="bloqueado">Bloqueados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="tripulante">Tripulantes</SelectItem>
              <SelectItem value="embarcacao">Equipamentos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterEmbarcacao} onValueChange={setFilterEmbarcacao}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Embarcação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Embarcações</SelectItem>
              {embarcacoes?.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Devices List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Lista de Dispositivos
            <Badge variant="secondary" className="ml-2">
              {filteredDevices.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : filteredDevices.length > 0 ? (
            <div className="space-y-2">
              {filteredDevices.map((device) => {
                const DeviceIcon = getDeviceIcon(device.tipo);
                const tipoLabel = TIPOS_DISPOSITIVO.find((t) => t.value === device.tipo)?.label || device.tipo;

                return (
                  <div
                    key={device.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50 ${
                      !device.autorizado ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : ""
                    }`}
                  >
                    <div className={`p-2 rounded-full ${device.autorizado ? "bg-primary/10" : "bg-red-100 dark:bg-red-900/30"}`}>
                      <DeviceIcon className={`h-5 w-5 ${device.autorizado ? "text-primary" : "text-red-500"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{device.nome || "Dispositivo"}</p>
                        <Badge variant="outline" className="text-xs">
                          {tipoLabel}
                        </Badge>
                        {!device.autorizado && (
                          <Badge variant="destructive" className="text-xs">
                            <WifiOff className="h-3 w-3 mr-1" />
                            Bloqueado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-mono text-muted-foreground">
                        {formatMacAddress(device.mac_address)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        {device.tripulante ? (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {device.tripulante.nome}
                          </span>
                        ) : device.embarcacao_id ? (
                          <span className="flex items-center gap-1">
                            <Ship className="h-3 w-3" />
                            Equipamento de embarcação
                          </span>
                        ) : null}
                        <span>•</span>
                        <span>Último uso: {formatTimestamp(device.ultimo_uso)}</span>
                        <span>•</span>
                        <span>Consumo: {formatBytes(device.bytes_consumidos)}</span>
                      </div>
                      {device.bloqueio_motivo && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Motivo: {device.bloqueio_motivo}
                        </p>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {device.autorizado ? (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setSelectedDevice(device);
                              setShowBlockModal(true);
                            }}
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Bloquear Dispositivo
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-green-600"
                            onClick={() => handleUnblock(device)}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Desbloquear
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <WifiOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum dispositivo encontrado</p>
              <p className="text-sm">Ajuste os filtros ou cadastre um equipamento de embarcação.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Device Modal */}
      <Dialog open={showNewDevice} onOpenChange={setShowNewDevice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Equipamento de Embarcação</DialogTitle>
            <DialogDescription>
              Cadastre dispositivos de rede como radar, GPS, câmeras, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mac">MAC Address *</Label>
              <Input
                id="mac"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={newDevice.mac_address}
                onChange={(e) => setNewDevice((prev) => ({ ...prev, mac_address: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="nome">Nome do Equipamento</Label>
              <Input
                id="nome"
                placeholder="Ex: Radar Principal"
                value={newDevice.nome}
                onChange={(e) => setNewDevice((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={newDevice.tipo}
                onValueChange={(v) => setNewDevice((prev) => ({ ...prev, tipo: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DISPOSITIVO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="embarcacao">Embarcação *</Label>
              <Select
                value={newDevice.embarcacao_id}
                onValueChange={(v) => setNewDevice((prev) => ({ ...prev, embarcacao_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {embarcacoes?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label htmlFor="autorizado">Autorizado a conectar</Label>
                <p className="text-xs text-muted-foreground">
                  {newDevice.autorizado ? "O dispositivo poderá se conectar à rede" : "O dispositivo será cadastrado bloqueado"}
                </p>
              </div>
              <Switch
                id="autorizado"
                checked={newDevice.autorizado}
                onCheckedChange={(checked) => setNewDevice((prev) => ({ ...prev, autorizado: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDevice(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateDevice}
              disabled={!newDevice.mac_address || !newDevice.embarcacao_id || createDispositivo.isPending}
            >
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Device Modal */}
      <Dialog open={showBlockModal} onOpenChange={setShowBlockModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Dispositivo</DialogTitle>
            <DialogDescription>
              {selectedDevice && (
                <>
                  Você está prestes a bloquear o dispositivo{" "}
                  <strong>{formatMacAddress(selectedDevice.mac_address)}</strong>
                  {selectedDevice.tripulante && (
                    <> de <strong>{selectedDevice.tripulante.nome}</strong></>
                  )}
                  . Este dispositivo não poderá se conectar à rede.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="motivo">Motivo do Bloqueio</Label>
              <Textarea
                id="motivo"
                placeholder="Ex: Dispositivo não autorizado, compartilhamento de credenciais, etc."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlock}
              disabled={blockDispositivo.isPending}
            >
              <Ban className="h-4 w-4 mr-2" />
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
