import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  HelpCircle,
  Trash2,
  Check,
  X
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  useDispositivosByTripulante,
  useCreateDispositivo,
  useUpdateDispositivo,
  useDeleteDispositivo,
  useToggleDispositivoAutorizacao,
  TIPOS_DISPOSITIVO,
  formatBytes,
  formatMacAddress,
  DispositivoRegistrado
} from "@/hooks/useDispositivosRegistrados";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TripulanteDevicesTabProps {
  tripulanteId: string;
  tripulanteNome: string;
  maxDispositivos?: number;
}

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  celular: <Smartphone className="h-4 w-4" />,
  notebook: <Laptop className="h-4 w-4" />,
  tablet: <Tablet className="h-4 w-4" />,
  desktop: <Monitor className="h-4 w-4" />,
  outro: <HelpCircle className="h-4 w-4" />,
};

export function TripulanteDevicesTab({ tripulanteId, tripulanteNome, maxDispositivos = 1 }: TripulanteDevicesTabProps) {
  useTableRealtime('dispositivos_registrados', ['dispositivos_registrados']);
  
  const { data: dispositivos, isLoading } = useDispositivosByTripulante(tripulanteId);
  const createDispositivo = useCreateDispositivo();
  const updateDispositivo = useUpdateDispositivo();
  const deleteDispositivo = useDeleteDispositivo();
  const toggleAutorizacao = useToggleDispositivoAutorizacao();

  const [formOpen, setFormOpen] = useState(false);
  const [editingDispositivo, setEditingDispositivo] = useState<DispositivoRegistrado | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dispositivoToDelete, setDispositivoToDelete] = useState<DispositivoRegistrado | null>(null);

  const [formData, setFormData] = useState({
    mac_address: "",
    nome: "",
    tipo: "celular",
    autorizado: true,
  });

  const handleCreate = () => {
    setEditingDispositivo(null);
    setFormData({
      mac_address: "",
      nome: "",
      tipo: "celular",
      autorizado: true,
    });
    setFormOpen(true);
  };

  const handleEdit = (dispositivo: DispositivoRegistrado) => {
    setEditingDispositivo(dispositivo);
    setFormData({
      mac_address: dispositivo.mac_address,
      nome: dispositivo.nome || "",
      tipo: dispositivo.tipo,
      autorizado: dispositivo.autorizado,
    });
    setFormOpen(true);
  };

  const handleDelete = (dispositivo: DispositivoRegistrado) => {
    setDispositivoToDelete(dispositivo);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (dispositivoToDelete) {
      deleteDispositivo.mutate(dispositivoToDelete.id);
      setDeleteDialogOpen(false);
      setDispositivoToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedMac = formatMacAddress(formData.mac_address);
    
    const dataToSubmit = {
      mac_address: formattedMac,
      nome: formData.nome.trim() || null,
      tipo: formData.tipo,
      autorizado: formData.autorizado,
      tripulante_id: tripulanteId,
    };

    if (editingDispositivo) {
      updateDispositivo.mutate({ ...dataToSubmit, id: editingDispositivo.id }, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createDispositivo.mutate(dataToSubmit, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  const handleToggleAutorizacao = (dispositivo: DispositivoRegistrado) => {
    toggleAutorizacao.mutate({ id: dispositivo.id, autorizado: !dispositivo.autorizado });
  };

  const formatLastUsed = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

  const autorizadosCount = dispositivos?.filter(d => d.autorizado).length || 0;
  const canAddMore = autorizadosCount < maxDispositivos;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Dispositivos de {tripulanteNome}</h3>
          <p className="text-sm text-muted-foreground">
            {autorizadosCount} de {maxDispositivos} dispositivo(s) autorizado(s)
          </p>
        </div>
        <Button onClick={handleCreate} size="sm" disabled={!canAddMore}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
      </div>

      {/* Limite Warning */}
      {!canAddMore && dispositivos && dispositivos.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-800">
          <CardContent className="p-3">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Limite de dispositivos atingido. Desautorize um dispositivo para adicionar outro.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de Dispositivos */}
      {dispositivos && dispositivos.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dispositivo</TableHead>
              <TableHead>MAC Address</TableHead>
              <TableHead>Consumo</TableHead>
              <TableHead>Último Uso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispositivos.map((dispositivo) => (
              <TableRow key={dispositivo.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {DEVICE_ICONS[dispositivo.tipo] || DEVICE_ICONS.outro}
                    <div>
                      <p className="font-medium">{dispositivo.nome || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{dispositivo.tipo}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {dispositivo.mac_address}
                  </code>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatBytes(dispositivo.bytes_consumidos)}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatLastUsed(dispositivo.ultimo_uso)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={dispositivo.autorizado}
                      onCheckedChange={() => handleToggleAutorizacao(dispositivo)}
                      disabled={!dispositivo.autorizado && !canAddMore}
                    />
                    <Badge 
                      variant={dispositivo.autorizado ? "default" : "secondary"}
                      className={dispositivo.autorizado 
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                        : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                      }
                    >
                      {dispositivo.autorizado ? (
                        <><Check className="h-3 w-3 mr-1" />Autorizado</>
                      ) : (
                        <><X className="h-3 w-3 mr-1" />Bloqueado</>
                      )}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEdit(dispositivo)}
                    >
                      <Smartphone className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDelete(dispositivo)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          icon={Smartphone}
          title="Nenhum dispositivo registrado"
          description="Adicione dispositivos autorizados para este tripulante."
          actionLabel="Adicionar Dispositivo"
          onAction={handleCreate}
        />
      )}

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {editingDispositivo ? "Editar Dispositivo" : "Novo Dispositivo"}
            </DialogTitle>
            <DialogDescription>
              Registre um dispositivo autorizado para {tripulanteNome}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="mac" className="text-right">
                  MAC *
                </Label>
                <Input
                  id="mac"
                  value={formData.mac_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, mac_address: e.target.value }))}
                  className="col-span-3"
                  placeholder="AA:BB:CC:DD:EE:FF"
                  pattern="^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$"
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nome" className="text-right">
                  Nome
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  className="col-span-3"
                  placeholder="iPhone do João..."
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="tipo" className="text-right">
                  Tipo
                </Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tipo: value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    {TIPOS_DISPOSITIVO.map(tipo => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        <div className="flex items-center gap-2">
                          {DEVICE_ICONS[tipo.value]}
                          {tipo.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="autorizado" className="text-right">
                  Autorizado
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Switch
                    id="autorizado"
                    checked={formData.autorizado}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, autorizado: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.autorizado ? "Pode conectar" : "Bloqueado"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createDispositivo.isPending || updateDispositivo.isPending}>
                {createDispositivo.isPending || updateDispositivo.isPending ? "Salvando..." : editingDispositivo ? "Salvar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dispositivo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o dispositivo "{dispositivoToDelete?.nome || dispositivoToDelete?.mac_address}"?
              O dispositivo não poderá mais se conectar automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
