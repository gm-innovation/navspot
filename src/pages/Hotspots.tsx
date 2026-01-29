import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { 
  Search, 
  Filter, 
  Plus, 
  Wifi,
  Settings,
  AlertTriangle,
  Code,
  Trash2
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
  useHotspots, 
  useCreateHotspot, 
  useUpdateHotspot, 
  useDeleteHotspot,
  useGenerateHotspotScript,
  HotspotWithDetails 
} from "@/hooks/useHotspots";
import { useHotspotsRealtime } from "@/hooks/useRealtimeSubscription";
import { HotspotForm } from "@/components/forms/HotspotForm";
import { ScriptModal } from "@/components/modals/ScriptModal";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Hotspots() {
  // Enable realtime updates
  useHotspotsRealtime();
  const { data: hotspots, isLoading, error } = useHotspots();
  const createHotspot = useCreateHotspot();
  const updateHotspot = useUpdateHotspot();
  const deleteHotspot = useDeleteHotspot();
  const generateScript = useGenerateHotspotScript();

  const [searchTerm, setSearchTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState<HotspotWithDetails | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hotspotToDelete, setHotspotToDelete] = useState<HotspotWithDetails | null>(null);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [bootstrapScript, setBootstrapScript] = useState("");
  const [finalizeScript, setFinalizeScript] = useState("");
  const [currentHotspotName, setCurrentHotspotName] = useState("");
  const [currentHotspotId, setCurrentHotspotId] = useState("");

  const filteredHotspots = hotspots?.filter(hotspot =>
    hotspot.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hotspot.embarcacao_nome?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleCreate = () => {
    setEditingHotspot(null);
    setFormOpen(true);
  };

  const handleEdit = (hotspot: HotspotWithDetails) => {
    setEditingHotspot(hotspot);
    setFormOpen(true);
  };

  const handleDelete = (hotspot: HotspotWithDetails) => {
    setHotspotToDelete(hotspot);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (hotspotToDelete) {
      deleteHotspot.mutate(hotspotToDelete.id);
      setDeleteDialogOpen(false);
      setHotspotToDelete(null);
    }
  };

  const handleSubmit = (data: any) => {
    if (editingHotspot) {
      updateHotspot.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createHotspot.mutate(data, {
        onSuccess: (newHotspot) => {
          setFormOpen(false);
          // Auto-generate script for new hotspot
          handleGenerateScript(newHotspot.id, newHotspot.nome);
        },
      });
    }
  };

  const handleGenerateScript = async (hotspotId: string, hotspotName: string) => {
    setCurrentHotspotId(hotspotId);
    setCurrentHotspotName(hotspotName);
    
    generateScript.mutate(hotspotId, {
      onSuccess: (data) => {
        setBootstrapScript(data.bootstrap_script || "# Script não gerado");
        setFinalizeScript(data.finalize_script || "# Script não gerado");
        setScriptModalOpen(true);
      },
    });
  };

  const handleRegenerateScript = () => {
    if (currentHotspotId) {
      generateScript.mutate(currentHotspotId, {
        onSuccess: (data) => {
          setBootstrapScript(data.bootstrap_script || "# Script não gerado");
          setFinalizeScript(data.finalize_script || "# Script não gerado");
        },
      });
    }
  };

  // Calculate stats
  const totalHotspots = hotspots?.length || 0;
  const online = hotspots?.filter((h) => h.status === "online").length || 0;
  const offline = hotspots?.filter((h) => h.status === "offline").length || 0;
  const alertas = hotspots?.filter((h) => h.status === "alerta").length || 0;

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Nunca";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "Inválido";
    }
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Hotspots</h1>
          <p className="text-muted-foreground">
            Monitore e gerencie todos os hotspots Wi-Fi das embarcações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Hotspot
          </Button>
        </div>
      </div>

      {/* Estatísticas rápidas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{totalHotspots}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Wifi className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">{online}</p>
              <p className="text-sm text-muted-foreground">Online</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-red-600">{offline}</p>
              <p className="text-sm text-muted-foreground">Offline</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-yellow-600">{alertas}</p>
              <p className="text-sm text-muted-foreground">Alertas</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
      </div>

      {/* Filtros e busca */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Hotspots</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar hotspots..."
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
          {filteredHotspots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotspot</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Configuração</TableHead>
                  <TableHead>Última Sincronização</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHotspots.map((hotspot) => (
                  <TableRow key={hotspot.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{hotspot.nome}</p>
                        <p className="text-sm text-muted-foreground">{hotspot.embarcacao_nome}</p>
                        {hotspot.empresa_nome && (
                          <p className="text-xs text-muted-foreground">{hotspot.empresa_nome}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={hotspot.status as any} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>Interface: {hotspot.interface_wifi}</p>
                        <p className="text-muted-foreground">Rede: {hotspot.rede}</p>
                        <p className="text-muted-foreground">Max: {hotspot.max_usuarios} usuários</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatLastSync(hotspot.ultima_sincronizacao)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleGenerateScript(hotspot.id, hotspot.nome)}
                          disabled={generateScript.isPending}
                        >
                          <Code className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEdit(hotspot)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(hotspot)}
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
              icon={Wifi}
              title="Nenhum hotspot encontrado"
              description={searchTerm ? "Tente ajustar sua busca." : "Comece adicionando seu primeiro hotspot."}
              actionLabel={!searchTerm ? "Novo Hotspot" : undefined}
              onAction={!searchTerm ? handleCreate : undefined}
            />
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <HotspotForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingHotspot || undefined}
        isLoading={createHotspot.isPending || updateHotspot.isPending}
      />

      {/* Script Modal */}
      <ScriptModal
        open={scriptModalOpen}
        onOpenChange={setScriptModalOpen}
        bootstrapScript={bootstrapScript}
        finalizeScript={finalizeScript}
        hotspotName={currentHotspotName}
        onRegenerate={handleRegenerateScript}
        isRegenerating={generateScript.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o hotspot "{hotspotToDelete?.nome}"? 
              Esta ação não pode ser desfeita.
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
