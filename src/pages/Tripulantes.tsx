import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Plus, 
  Users,
  UserCheck,
  Crown,
  Anchor,
  Settings,
  Trash2,
  Ban,
  LogOut,
  RotateCcw,
  QrCode,
  Eye
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  useTripulantes, 
  useCreateTripulante, 
  useUpdateTripulante, 
  useDeleteTripulante,
  useCreateTripulanteAction,
  TripulanteWithDetails 
} from "@/hooks/useTripulantes";
import { useTripulantesRealtime } from "@/hooks/useRealtimeSubscription";
import { TripulanteForm } from "@/components/forms/TripulanteForm";
import { QRCodeModal } from "@/components/modals/QRCodeModal";
import { TripulanteDetailsModal } from "@/components/modals/TripulanteDetailsModal";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Tripulantes() {
  // Enable realtime updates
  useTripulantesRealtime();
  const { data: tripulantes, isLoading, error } = useTripulantes();
  const createTripulante = useCreateTripulante();
  const updateTripulante = useUpdateTripulante();
  const deleteTripulante = useDeleteTripulante();
  const createAction = useCreateTripulanteAction();

  const [searchTerm, setSearchTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTripulante, setEditingTripulante] = useState<TripulanteWithDetails | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tripulanteToDelete, setTripulanteToDelete] = useState<TripulanteWithDetails | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrTripulante, setQrTripulante] = useState<TripulanteWithDetails | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTripulante, setSelectedTripulante] = useState<TripulanteWithDetails | null>(null);

  const filteredTripulantes = tripulantes?.filter(tripulante =>
    tripulante.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tripulante.embarcacao_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tripulante.login_wifi.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getTipoIcon = (cargo: string | null) => {
    if (!cargo) return <Anchor className="h-4 w-4 text-muted-foreground" />;
    const cargoLower = cargo.toLowerCase();
    if (cargoLower.includes("comandante")) return <Crown className="h-4 w-4 text-yellow-600" />;
    if (cargoLower.includes("imediato") || cargoLower.includes("oficial")) return <UserCheck className="h-4 w-4 text-blue-600" />;
    if (cargoLower.includes("chefe") || cargoLower.includes("engenheiro")) return <Settings className="h-4 w-4 text-orange-600" />;
    return <Anchor className="h-4 w-4 text-muted-foreground" />;
  };

  const getTipoBadgeColor = (cargo: string | null) => {
    if (!cargo) return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    const cargoLower = cargo.toLowerCase();
    if (cargoLower.includes("comandante")) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
    if (cargoLower.includes("imediato") || cargoLower.includes("oficial")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
    if (cargoLower.includes("chefe") || cargoLower.includes("engenheiro")) return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400";
    return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
  };

  const handleCreate = () => {
    setEditingTripulante(null);
    setFormOpen(true);
  };

  const handleEdit = (tripulante: TripulanteWithDetails) => {
    setEditingTripulante(tripulante);
    setFormOpen(true);
  };

  const handleDelete = (tripulante: TripulanteWithDetails) => {
    setTripulanteToDelete(tripulante);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (tripulanteToDelete) {
      deleteTripulante.mutate(tripulanteToDelete.id);
      setDeleteDialogOpen(false);
      setTripulanteToDelete(null);
    }
  };

  const handleSubmit = (data: any) => {
    if (editingTripulante) {
      updateTripulante.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createTripulante.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  // Actions
  const handleBlock = (tripulante: TripulanteWithDetails) => {
    const newStatus = tripulante.status === "bloqueado" ? "ativo" : "bloqueado";
    updateTripulante.mutate({ id: tripulante.id, status: newStatus });
    createAction.mutate({
      tripulanteId: tripulante.id,
      tipo: newStatus === "bloqueado" ? "disable_user" : "enable_user",
      payload: { disabled: newStatus === "bloqueado" },
    });
  };

  const handleKick = (tripulante: TripulanteWithDetails) => {
    createAction.mutate({
      tripulanteId: tripulante.id,
      tipo: "kick_session",
      payload: {},
    });
  };

  const handleResetPassword = (tripulante: TripulanteWithDetails) => {
    const newPassword = Math.random().toString(36).slice(-8);
    updateTripulante.mutate({ id: tripulante.id, senha_wifi: newPassword });
    createAction.mutate({
      tripulanteId: tripulante.id,
      tipo: "update_password",
      payload: { password: newPassword },
    });
  };

  const handleShowQR = (tripulante: TripulanteWithDetails) => {
    setQrTripulante(tripulante);
    setQrModalOpen(true);
  };

  const handleShowDetails = (tripulante: TripulanteWithDetails) => {
    setSelectedTripulante(tripulante);
    setDetailsModalOpen(true);
  };

  const formatLastLogin = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Calculate stats
  const totalTripulantes = tripulantes?.length || 0;
  const ativos = tripulantes?.filter((t) => t.status === "ativo").length || 0;
  const comandantes = tripulantes?.filter((t) => t.cargo?.toLowerCase().includes("comandante")).length || 0;
  const onlineHoje = tripulantes?.filter((t) => {
    if (!t.ultimo_login) return false;
    const today = new Date();
    const loginDate = new Date(t.ultimo_login);
    return loginDate.toDateString() === today.toDateString();
  }).length || 0;

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <ErrorState 
          message={error.message} 
          onRetry={() => window.location.reload()} 
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tripulantes</h1>
          <p className="text-muted-foreground">
            Gerencie todos os tripulantes cadastrados no sistema
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Tripulante
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{totalTripulantes}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">{ativos}</p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{comandantes}</p>
              <p className="text-sm text-muted-foreground">Comandantes</p>
            </div>
            <Crown className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{onlineHoje}</p>
              <p className="text-sm text-muted-foreground">Online Hoje</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de tripulantes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Tripulantes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar tripulantes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[300px]"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTripulantes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tripulante</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Embarcação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Consumo</TableHead>
                  <TableHead>Último Login</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTripulantes.map((tripulante) => (
                  <TableRow key={tripulante.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tripulante.nome}</p>
                        <p className="text-sm text-muted-foreground">@{tripulante.login_wifi}</p>
                        {tripulante.cpf && (
                          <p className="text-xs text-muted-foreground">{tripulante.cpf}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTipoIcon(tripulante.cargo)}
                        <Badge 
                          variant="secondary"
                          className={getTipoBadgeColor(tripulante.cargo)}
                        >
                          {tripulante.cargo || "Tripulante"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{tripulante.embarcacao_nome}</span>
                        {tripulante.perfil_nome && (
                          <p className="text-xs text-muted-foreground">Perfil: {tripulante.perfil_nome}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={tripulante.status === "ativo" ? "default" : "secondary"}
                        className={
                          tripulante.status === "ativo" 
                            ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" 
                            : tripulante.status === "bloqueado"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                        }
                      >
                        {tripulante.status === "ativo" ? "Ativo" : tripulante.status === "bloqueado" ? "Bloqueado" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{formatBytes(tripulante.bytes_consumidos)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatLastLogin(tripulante.ultimo_login)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-50 bg-background border shadow-lg">
                          <DropdownMenuItem onClick={() => handleShowDetails(tripulante)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShowQR(tripulante)}>
                            <QrCode className="h-4 w-4 mr-2" />
                            QR Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(tripulante)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleBlock(tripulante)}>
                            <Ban className="h-4 w-4 mr-2" />
                            {tripulante.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleKick(tripulante)}>
                            <LogOut className="h-4 w-4 mr-2" />
                            Desconectar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(tripulante)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Resetar Senha
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(tripulante)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Users}
              title="Nenhum tripulante encontrado"
              description={searchTerm ? "Tente ajustar sua busca." : "Comece adicionando seu primeiro tripulante."}
              actionLabel={!searchTerm ? "Novo Tripulante" : undefined}
              onAction={!searchTerm ? handleCreate : undefined}
            />
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <TripulanteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingTripulante || undefined}
        isLoading={createTripulante.isPending || updateTripulante.isPending}
      />

      {/* QR Code Modal */}
      <QRCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        tripulante={qrTripulante}
      />

      {/* Details Modal with Devices Tab */}
      <TripulanteDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        tripulante={selectedTripulante}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o tripulante "{tripulanteToDelete?.nome}"? 
              Esta ação não pode ser desfeita e as credenciais WiFi serão invalidadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
