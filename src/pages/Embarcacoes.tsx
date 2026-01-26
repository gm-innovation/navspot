import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ship, MapPin, Users, Wifi, Plus, Settings, Trash2, Loader2 } from "lucide-react";
import { 
  useEmbarcacoes, 
  useCreateEmbarcacao, 
  useUpdateEmbarcacao, 
  useDeleteEmbarcacao,
  EmbarcacaoWithStats 
} from "@/hooks/useEmbarcacoes";
import { EmbarcacaoForm } from "@/components/forms/EmbarcacaoForm";
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
  const { data: embarcacoes, isLoading, error } = useEmbarcacoes();
  const createEmbarcacao = useCreateEmbarcacao();
  const updateEmbarcacao = useUpdateEmbarcacao();
  const deleteEmbarcacao = useDeleteEmbarcacao();

  const [formOpen, setFormOpen] = useState(false);
  const [editingEmbarcacao, setEditingEmbarcacao] = useState<EmbarcacaoWithStats | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [embarcacaoToDelete, setEmbarcacaoToDelete] = useState<EmbarcacaoWithStats | null>(null);

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
  const totalHotspots = embarcacoes?.reduce((acc, e) => acc + (e.hotspots_count || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-destructive">Erro ao carregar embarcações: {error.message}</p>
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
            Gerencie todas as embarcações cadastradas no sistema
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
              <p className="text-2xl font-bold">{totalHotspots}</p>
              <p className="text-sm text-muted-foreground">Hotspots</p>
            </div>
            <Wifi className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de embarcações */}
      {embarcacoes && embarcacoes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {embarcacoes.map((embarcacao) => (
            <Card key={embarcacao.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Ship className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{embarcacao.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground capitalize">{embarcacao.tipo}</p>
                    </div>
                  </div>
                  <Badge 
                    variant={embarcacao.status === "ativo" ? "default" : "secondary"}
                    className={embarcacao.status === "ativo" ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : ""}
                  >
                    {embarcacao.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
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

                {/* Localização */}
                {embarcacao.localizacao && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{embarcacao.localizacao}</span>
                  </div>
                )}

                {/* Empresa */}
                {embarcacao.empresa_nome && (
                  <p className="text-xs text-muted-foreground">
                    Empresa: {embarcacao.empresa_nome}
                  </p>
                )}

                {/* Estatísticas */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{embarcacao.hotspots_count || 0}</p>
                    <p className="text-xs text-muted-foreground">Hotspots</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{embarcacao.tripulantes_count || 0}</p>
                    <p className="text-xs text-muted-foreground">Tripulantes</p>
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
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ship className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma embarcação cadastrada</h3>
            <p className="text-muted-foreground mb-4">Comece adicionando sua primeira embarcação.</p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Embarcação
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Form Modal */}
      <EmbarcacaoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingEmbarcacao || undefined}
        isLoading={createEmbarcacao.isPending || updateEmbarcacao.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a embarcação "{embarcacaoToDelete?.nome}"? 
              Esta ação não pode ser desfeita e todos os hotspots e tripulantes associados 
              podem ser afetados.
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
