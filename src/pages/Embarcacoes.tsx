import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Ship, Users, Wifi, Plus, Settings, Trash2, Code, Loader2, Search } from "lucide-react";
import { 
  useEmbarcacoes, 
  useDeleteEmbarcacao,
  EmbarcacaoWithStats 
} from "@/hooks/useEmbarcacoes";
import { useHotspots, useGenerateHotspotScript } from "@/hooks/useHotspots";
import { ScriptModal } from "@/components/modals/ScriptModal";
import { useRegrasAcesso } from "@/hooks/useRegrasAcesso";
import { useCreateEmbarcacaoWithHotspot, useUpdateEmbarcacaoWithHotspot } from "@/hooks/useEmbarcacoesWithHotspot";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { EmbarcacaoForm } from "@/components/forms/EmbarcacaoForm";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { getTipoEmbarcacaoLabel } from "@/constants/embarcacoes";
import { useAuth } from "@/contexts/AuthContext";
import { getHotspotRealStatus, getHotspotStatusDisplay } from "@/utils/hotspotStatus";
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
  // Auth and permissions
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole(['super_admin']);

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
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [bootstrapScript, setBootstrapScript] = useState("");
  const [finalizeScript, setFinalizeScript] = useState("");
  const [currentHotspotName, setCurrentHotspotName] = useState("");
  const [currentHotspotId, setCurrentHotspotId] = useState("");
  const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.7");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const generateScript = useGenerateHotspotScript();

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

  // Filter embarcacoes based on search term
  const filteredEmbarcacoes = useMemo(() => {
    if (!embarcacoes) return [];
    if (!searchTerm) return embarcacoes;
    
    const term = searchTerm.toLowerCase();
    return embarcacoes.filter(embarcacao =>
      embarcacao.nome.toLowerCase().includes(term) ||
      embarcacao.empresa_nome?.toLowerCase().includes(term) ||
      embarcacao.tipo.toLowerCase().includes(term)
    );
  }, [embarcacoes, searchTerm]);

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

  const handleGenerateScript = (embarcacao: EmbarcacaoWithStats) => {
    const hotspot = getHotspotForEmbarcacao(embarcacao.id);
    if (!hotspot) return;
    
    setGeneratingFor(embarcacao.id);
    setCurrentHotspotId(hotspot.id);
    setCurrentHotspotName(embarcacao.nome);
    
    generateScript.mutate(hotspot.id, {
      onSuccess: (data) => {
        setBootstrapScript(data.bootstrap_script || "# Script não gerado");
        setFinalizeScript(data.finalize_script || "# Script não gerado");
        setCurrentScriptVersion(data.version || "7.1.7");
        setScriptModalOpen(true);
        setGeneratingFor(null);
      },
      onError: () => {
        setGeneratingFor(null);
      },
    });
  };

  const handleRegenerateScript = () => {
    if (currentHotspotId) {
      generateScript.mutate(currentHotspotId, {
        onSuccess: (data) => {
          setBootstrapScript(data.bootstrap_script || "# Script não gerado");
          setFinalizeScript(data.finalize_script || "# Script não gerado");
          setCurrentScriptVersion(data.version || "7.1.7");
        },
      });
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
  
  // Calculate hotspots online using real status
  const hotspotsOnline = useMemo(() => {
    if (!hotspots) return 0;
    return hotspots.filter((h) => {
      const realStatus = getHotspotRealStatus({
        status: h.status,
        ultima_sincronizacao: h.ultima_sincronizacao,
        sync_interval_minutes: h.sync_interval_minutes || 5,
      });
      return realStatus === 'online';
    }).length;
  }, [hotspots]);

  // Get hotspot status info using real calculated status
  const getHotspotStatusInfo = (embarcacaoId: string) => {
    const hotspot = getHotspotForEmbarcacao(embarcacaoId);
    if (!hotspot) return { status: 'sem_config', label: 'Sem config', color: 'bg-gray-100 text-gray-600' };
    
    const realStatus = getHotspotRealStatus({
      status: hotspot.status,
      ultima_sincronizacao: hotspot.ultima_sincronizacao,
      sync_interval_minutes: hotspot.sync_interval_minutes || 5,
    });
    
    const display = getHotspotStatusDisplay(realStatus);
    return { status: realStatus, ...display };
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
            {isSuperAdmin 
              ? "Gerencie embarcações e suas configurações de rede"
              : "Visualize as embarcações e suas informações"}
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Embarcação
          </Button>
        )}
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

      {/* Lista de embarcações em tabela */}
      {embarcacoes && embarcacoes.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lista de Embarcações</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar embarcações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hotspot</TableHead>
                  <TableHead className="text-center">Tripulantes</TableHead>
                  {isSuperAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmbarcacoes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      Nenhuma embarcação encontrada para "{searchTerm}"
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmbarcacoes.map((embarcacao) => {
                    const hotspotStatus = getHotspotStatusInfo(embarcacao.id);
                    const hotspot = getHotspotForEmbarcacao(embarcacao.id);
                    
                    return (
                      <TableRow key={embarcacao.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Ship className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{embarcacao.nome}</p>
                              {embarcacao.responsavel_nome && (
                                <p className="text-sm text-muted-foreground">
                                  {embarcacao.responsavel_nome}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getTipoEmbarcacaoLabel(embarcacao.tipo)}</TableCell>
                        <TableCell>{embarcacao.empresa_nome || "-"}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={embarcacao.status === "ativo" ? "default" : "secondary"}
                            className={embarcacao.status === "ativo" 
                              ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" 
                              : ""}
                          >
                            {embarcacao.status === "ativo" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={hotspotStatus.color}>
                            <Wifi className="h-3 w-3 mr-1" />
                            {hotspotStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{embarcacao.tripulantes_count || 0}</TableCell>
                        {isSuperAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleEdit(embarcacao)}
                                title="Editar"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleGenerateScript(embarcacao)}
                                disabled={!hotspot || generatingFor === embarcacao.id}
                                title={hotspot ? "Gerar Script MikroTik" : "Configure a rede primeiro"}
                              >
                                {generatingFor === embarcacao.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Code className="h-4 w-4" />
                                )}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDelete(embarcacao)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Ship}
          title="Nenhuma embarcação cadastrada"
          description={isSuperAdmin 
            ? "Comece adicionando sua primeira embarcação." 
            : "Não há embarcações disponíveis para visualização."}
          actionLabel={isSuperAdmin ? "Nova Embarcação" : undefined}
          onAction={isSuperAdmin ? handleCreate : undefined}
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

      {/* Script Modal */}
      <ScriptModal
        open={scriptModalOpen}
        onOpenChange={setScriptModalOpen}
        bootstrapScript={bootstrapScript}
        finalizeScript={finalizeScript}
        hotspotName={currentHotspotName}
        hotspotId={currentHotspotId}
        scriptVersion={currentScriptVersion}
        onRegenerate={handleRegenerateScript}
        isRegenerating={generateScript.isPending}
      />
    </div>
  );
}
