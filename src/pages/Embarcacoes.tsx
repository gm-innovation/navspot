import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ship, Users, Wifi, Plus, Settings, Trash2, Clock } from "lucide-react";
import { 
  useEmbarcacoes, 
  useDeleteEmbarcacao,
  EmbarcacaoWithStats 
} from "@/hooks/useEmbarcacoes";
import { useHotspots } from "@/hooks/useHotspots";
import { useRegrasAcesso } from "@/hooks/useRegrasAcesso";
import { useCreateEmbarcacaoWithHotspot, useUpdateEmbarcacaoWithHotspot } from "@/hooks/useEmbarcacoesWithHotspot";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { EmbarcacaoForm } from "@/components/forms/EmbarcacaoForm";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { TIMEZONES_BRASIL } from "@/hooks/usePerfisVelocidade";
import { getTipoEmbarcacaoLabel } from "@/constants/embarcacoes";
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

export default function Embarcacoes() {
  // Enable realtime updates
  useTableRealtime('embarcacoes', ['embarcacoes']);
  useTableRealtime('hotspots', ['hotspots']);
  
  const { data: embarcacoes, isLoading, error } = useEmbarcacoes();
  const { data: hotspots } = useHotspots();
  const { data: regras } = useRegrasAcesso();
  const createEmbarcacao = useCreateEmbarcacaoWithHotspot();
  const updateEmbarcacao = useUpdateEmbarcacaoWithHotspot();
  const deleteEmbarcacao = useDeleteEmbarcacao();

  const [formOpen, setFormOpen] = useState(false);
  const [editingEmbarcacao, setEditingEmbarcacao] = useState<EmbarcacaoWithStats | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [embarcacaoToDelete, setEmbarcacaoToDelete] = useState<EmbarcacaoWithStats | null>(null);

  // Get hotspot for a specific embarcacao
  const getHotspotForEmbarcacao = (embarcacaoId: string) => {
    return hotspots?.find(h => h.embarcacao_id === embarcacaoId);
  };

  // Get applied listas for a hotspot
  const getListasAplicadasForHotspot = (hotspotId: string | undefined) => {
    if (!hotspotId || !regras) return [];
    return regras
      .filter(r => r.hotspot_id === hotspotId)
      .map(r => r.lista_id);
  };

  // Memoize listas aplicadas for editing embarcacao
  const editingListasAplicadas = useMemo(() => {
    if (!editingEmbarcacao) return [];
    const hotspot = getHotspotForEmbarcacao(editingEmbarcacao.id);
    return getListasAplicadasForHotspot(hotspot?.id);
  }, [editingEmbarcacao, hotspots, regras]);

  const handleCreate = () => {
    setEditingEmbarcacao(null);
    setFormOpen(true);
  };

  const handleEdit = (embarcacao: EmbarcacaoWithStats) => {
    setEditingEmbarcacao(embarcacao);
    setFormOpen(true);
  };

  const handleDelete = (embarcacao: EmbarcacaoWithStats) => {
    setEmbarcacaoToDelete(embarcacao);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (embarcacaoToDelete) {
      deleteEmbarcacao.mutate(embarcacaoToDelete.id);
      setDeleteDialogOpen(false);
      setEmbarcacaoToDelete(null);
    }
  };

  const handleSubmit = (data: any) => {
    if (editingEmbarcacao) {
      updateEmbarcacao.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createEmbarcacao.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  // Calculate stats
  const totalEmbarcacoes = embarcacoes?.length || 0;
  const ativas = embarcacoes?.filter((e) => e.status === "ativo").length || 0;
  const totalTripulantes = embarcacoes?.reduce((acc, e) => acc + (e.tripulantes_count || 0), 0) || 0;
  const hotspotsOnline = hotspots?.filter((h) => h.status === "online").length || 0;

  // Get timezone label
  const getTimezoneLabel = (timezone: string | null) => {
    if (!timezone) return null;
    const tz = TIMEZONES_BRASIL.find(t => t.value === timezone);
    return tz?.label || timezone;
  };

  // Get hotspot status info
  const getHotspotStatusInfo = (embarcacaoId: string) => {
    const hotspot = getHotspotForEmbarcacao(embarcacaoId);
    if (!hotspot) return { status: 'sem_config', label: 'Sem config', color: 'bg-gray-100 text-gray-600' };
    
    if (hotspot.status === 'online') {
      return { status: 'online', label: 'Online', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' };
    }
    return { status: 'offline', label: 'Offline', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' };
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
          <h1 className="text-3xl font-bold tracking-tight">Embarcações</h1>
          <p className="text-muted-foreground">
            Gerencie embarcações e suas configurações de rede
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Embarcação
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{totalEmbarcacoes}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
            <Ship className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">{ativas}</p>
              <p className="text-sm text-muted-foreground">Ativas</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{totalTripulantes}</p>
              <p className="text-sm text-muted-foreground">Tripulantes</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold text-green-600">{hotspotsOnline}</p>
              <p className="text-sm text-muted-foreground">Hotspots Online</p>
            </div>
            <Wifi className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de embarcações */}
      {embarcacoes && embarcacoes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {embarcacoes.map((embarcacao) => {
            const hotspotStatus = getHotspotStatusInfo(embarcacao.id);
            const hotspot = getHotspotForEmbarcacao(embarcacao.id);
            
            return (
              <Card key={embarcacao.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Ship className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{embarcacao.nome}</CardTitle>
                        <p className="text-sm text-muted-foreground">{getTipoEmbarcacaoLabel(embarcacao.tipo)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge 
                        variant={embarcacao.status === "ativo" ? "default" : "secondary"}
                        className={embarcacao.status === "ativo" ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : ""}
                      >
                        {embarcacao.status === "ativo" ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline" className={hotspotStatus.color}>
                        <Wifi className="h-3 w-3 mr-1" />
                        {hotspotStatus.label}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Responsável */}
                  {embarcacao.responsavel_nome && (
                    <div>
                      <p className="text-sm font-medium">{embarcacao.responsavel_nome}</p>
                      <p className="text-sm text-muted-foreground">{embarcacao.responsavel_email}</p>
                    </div>
                  )}

                  {/* Timezone */}
                  {embarcacao.timezone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{getTimezoneLabel(embarcacao.timezone)}</span>
                    </div>
                  )}

                  {/* Empresa */}
                  {embarcacao.empresa_nome && (
                    <p className="text-xs text-muted-foreground">
                      Empresa: {embarcacao.empresa_nome}
                    </p>
                  )}

                  {/* Hotspot info */}
                  {hotspot && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                      <div className="flex justify-between">
                        <span>Rede: {hotspot.rede}</span>
                        <span>Sync: {hotspot.sync_interval_minutes}min</span>
                      </div>
                    </div>
                  )}

                  {/* Estatísticas */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{embarcacao.tripulantes_count || 0}</p>
                      <p className="text-xs text-muted-foreground">Tripulantes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{hotspot?.max_usuarios || 0}</p>
                      <p className="text-xs text-muted-foreground">Max Usuários</p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleEdit(embarcacao)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(embarcacao)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Ship}
          title="Nenhuma embarcação cadastrada"
          description="Comece adicionando sua primeira embarcação."
          actionLabel="Nova Embarcação"
          onAction={handleCreate}
        />
      )}

      {/* Form Modal */}
      <EmbarcacaoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingEmbarcacao || undefined}
        initialHotspot={editingEmbarcacao ? getHotspotForEmbarcacao(editingEmbarcacao.id) : undefined}
        initialListasAplicadas={editingListasAplicadas}
        isLoading={createEmbarcacao.isPending || updateEmbarcacao.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a embarcação "{embarcacaoToDelete?.nome}"? 
              Esta ação não pode ser desfeita e o hotspot associado também será removido.
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
