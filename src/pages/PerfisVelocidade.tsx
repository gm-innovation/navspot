import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Gauge, 
  Settings, 
  Trash2, 
  Loader2,
  Download,
  Upload,
  Users
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
  usePerfisVelocidade, 
  useCreatePerfilVelocidade, 
  useUpdatePerfilVelocidade, 
  useDeletePerfilVelocidade,
  PerfilWithCount 
} from "@/hooks/usePerfisVelocidade";
import { useAuth } from "@/contexts/AuthContext";

export default function PerfisVelocidade() {
  const { user } = useAuth();
  const { data: perfis, isLoading, error } = usePerfisVelocidade();
  const createPerfil = useCreatePerfilVelocidade();
  const updatePerfil = useUpdatePerfilVelocidade();
  const deletePerfil = useDeletePerfilVelocidade();

  const [formOpen, setFormOpen] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<PerfilWithCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [perfilToDelete, setPerfilToDelete] = useState<PerfilWithCount | null>(null);

  const [formData, setFormData] = useState({
    nome: "",
    velocidade_download: "10M",
    velocidade_upload: "5M",
    limite_dados_mb: "",
    prioridade: 4,
    session_timeout_minutos: "",
    descricao: "",
  });

  useEffect(() => {
    if (editingPerfil) {
      setFormData({
        nome: editingPerfil.nome,
        velocidade_download: editingPerfil.velocidade_download,
        velocidade_upload: editingPerfil.velocidade_upload,
        limite_dados_mb: editingPerfil.limite_dados_mb?.toString() || "",
        prioridade: editingPerfil.prioridade,
        session_timeout_minutos: editingPerfil.session_timeout_minutos?.toString() || "",
        descricao: editingPerfil.descricao || "",
      });
    } else {
      setFormData({
        nome: "",
        velocidade_download: "10M",
        velocidade_upload: "5M",
        limite_dados_mb: "",
        prioridade: 4,
        session_timeout_minutos: "",
        descricao: "",
      });
    }
  }, [editingPerfil, formOpen]);

  const handleCreate = () => {
    setEditingPerfil(null);
    setFormOpen(true);
  };

  const handleEdit = (perfil: PerfilWithCount) => {
    setEditingPerfil(perfil);
    setFormOpen(true);
  };

  const handleDelete = (perfil: PerfilWithCount) => {
    setPerfilToDelete(perfil);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (perfilToDelete) {
      deletePerfil.mutate(perfilToDelete.id);
      setDeleteDialogOpen(false);
      setPerfilToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const dataToSubmit = {
      nome: formData.nome,
      velocidade_download: formData.velocidade_download,
      velocidade_upload: formData.velocidade_upload,
      limite_dados_mb: formData.limite_dados_mb ? parseInt(formData.limite_dados_mb) : null,
      prioridade: formData.prioridade,
      session_timeout_minutos: formData.session_timeout_minutos ? parseInt(formData.session_timeout_minutos) : null,
      descricao: formData.descricao || null,
      empresa_id: user?.empresa_id || "",
    };

    if (editingPerfil) {
      updatePerfil.mutate({ ...dataToSubmit, id: editingPerfil.id }, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createPerfil.mutate(dataToSubmit, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getPrioridadeLabel = (prioridade: number) => {
    if (prioridade <= 2) return { label: "Alta", color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" };
    if (prioridade <= 4) return { label: "Média", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400" };
    return { label: "Baixa", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400" };
  };

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
        <p className="text-destructive">Erro ao carregar perfis: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Perfis de Velocidade</h1>
          <p className="text-muted-foreground">
            Gerencie os perfis de banda, quota e QoS para os tripulantes
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Perfil
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{perfis?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total de Perfis</p>
            </div>
            <Gauge className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">
                {perfis?.reduce((acc, p) => acc + (p.tripulantes_count || 0), 0) || 0}
              </p>
              <p className="text-sm text-muted-foreground">Tripulantes Vinculados</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">
                {perfis?.filter((p) => p.limite_dados_mb).length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Com Quota</p>
            </div>
            <Download className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de Perfis */}
      <Card>
        <CardHeader>
          <CardTitle>Perfis Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {perfis && perfis.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Velocidade</TableHead>
                  <TableHead>Quota</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Tripulantes</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfis.map((perfil) => {
                  const prioridadeInfo = getPrioridadeLabel(perfil.prioridade);
                  return (
                    <TableRow key={perfil.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{perfil.nome}</p>
                          {perfil.descricao && (
                            <p className="text-sm text-muted-foreground">{perfil.descricao}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Download className="h-4 w-4 text-green-600" />
                          <span>{perfil.velocidade_download}</span>
                          <span className="text-muted-foreground">/</span>
                          <Upload className="h-4 w-4 text-blue-600" />
                          <span>{perfil.velocidade_upload}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {perfil.limite_dados_mb ? (
                          <span className="text-sm">{perfil.limite_dados_mb} MB</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Ilimitado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={prioridadeInfo.color}>
                          {prioridadeInfo.label} ({perfil.prioridade})
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{perfil.tripulantes_count || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(perfil)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDelete(perfil)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Gauge className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Nenhum perfil cadastrado</h3>
              <p className="text-muted-foreground mb-4">Crie perfis de velocidade para seus tripulantes.</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Perfil
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingPerfil ? "Editar Perfil" : "Novo Perfil de Velocidade"}
            </DialogTitle>
            <DialogDescription>
              Configure os limites de banda e quota para este perfil.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nome" className="text-right">
                  Nome
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  className="col-span-3"
                  placeholder="Comandante, Oficiais, Tripulação..."
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="velocidade_download" className="text-right">
                  Download
                </Label>
                <Input
                  id="velocidade_download"
                  value={formData.velocidade_download}
                  onChange={(e) => handleChange("velocidade_download", e.target.value)}
                  className="col-span-3"
                  placeholder="10M, 5M, 2M..."
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="velocidade_upload" className="text-right">
                  Upload
                </Label>
                <Input
                  id="velocidade_upload"
                  value={formData.velocidade_upload}
                  onChange={(e) => handleChange("velocidade_upload", e.target.value)}
                  className="col-span-3"
                  placeholder="5M, 2M, 1M..."
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="limite_dados_mb" className="text-right">
                  Quota (MB)
                </Label>
                <Input
                  id="limite_dados_mb"
                  type="number"
                  value={formData.limite_dados_mb}
                  onChange={(e) => handleChange("limite_dados_mb", e.target.value)}
                  className="col-span-3"
                  placeholder="Vazio = ilimitado"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="prioridade" className="text-right">
                  Prioridade
                </Label>
                <Input
                  id="prioridade"
                  type="number"
                  min={1}
                  max={8}
                  value={formData.prioridade}
                  onChange={(e) => handleChange("prioridade", parseInt(e.target.value) || 4)}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="session_timeout" className="text-right">
                  Timeout (min)
                </Label>
                <Input
                  id="session_timeout"
                  type="number"
                  value={formData.session_timeout_minutos}
                  onChange={(e) => handleChange("session_timeout_minutos", e.target.value)}
                  className="col-span-3"
                  placeholder="Vazio = sem limite"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descricao" className="text-right">
                  Descrição
                </Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleChange("descricao", e.target.value)}
                  className="col-span-3"
                  placeholder="Descrição opcional..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPerfil.isPending || updatePerfil.isPending}>
                {createPerfil.isPending || updatePerfil.isPending ? "Salvando..." : editingPerfil ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o perfil "{perfilToDelete?.nome}"? 
              {(perfilToDelete?.tripulantes_count || 0) > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Atenção: {perfilToDelete?.tripulantes_count} tripulante(s) usam este perfil.
                </span>
              )}
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
