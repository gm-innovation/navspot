import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Gauge, 
  Settings, 
  Trash2, 
  Download,
  Upload,
  Users,
  Smartphone,
  Shield,
  ShieldOff
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
  usePerfisVelocidade, 
  useCreatePerfilVelocidade, 
  useUpdatePerfilVelocidade, 
  useDeletePerfilVelocidade,
  PerfilWithCount,
  TIPOS_USUARIO,
  MODOS_ACESSO,
  PERIODOS_QUOTA
} from "@/hooks/usePerfisVelocidade";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/AuthContext";
import { RegrasDoPerfil } from "@/components/perfis/RegrasDoPerfil";

export default function PerfisVelocidade() {
  // Enable realtime updates
  useTableRealtime('perfis_velocidade', ['perfis_velocidade']);
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
    quota_periodo: "diario",
    prioridade: 4,
    session_timeout_minutos: "",
    descricao: "",
    max_dispositivos: 1,
    tipo_usuario: "tripulante",
    modo_acesso: "permitir_tudo",
    herdar_regras_empresa: true,
  });

  useEffect(() => {
    if (editingPerfil) {
      setFormData({
        nome: editingPerfil.nome,
        velocidade_download: editingPerfil.velocidade_download,
        velocidade_upload: editingPerfil.velocidade_upload,
        limite_dados_mb: editingPerfil.limite_dados_mb?.toString() || "",
        quota_periodo: (editingPerfil as any).quota_periodo || "diario",
        prioridade: editingPerfil.prioridade,
        session_timeout_minutos: editingPerfil.session_timeout_minutos?.toString() || "",
        descricao: editingPerfil.descricao || "",
        max_dispositivos: editingPerfil.max_dispositivos,
        tipo_usuario: editingPerfil.tipo_usuario,
        modo_acesso: editingPerfil.modo_acesso,
        herdar_regras_empresa: editingPerfil.herdar_regras_empresa,
      });
    } else {
      setFormData({
        nome: "",
        velocidade_download: "10M",
        velocidade_upload: "5M",
        limite_dados_mb: "",
        quota_periodo: "diario",
        prioridade: 4,
        session_timeout_minutos: "",
        descricao: "",
        max_dispositivos: 1,
        tipo_usuario: "tripulante",
        modo_acesso: "permitir_tudo",
        herdar_regras_empresa: true,
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
      quota_periodo: formData.quota_periodo,
      prioridade: formData.prioridade,
      session_timeout_minutos: formData.session_timeout_minutos ? parseInt(formData.session_timeout_minutos) : null,
      descricao: formData.descricao || null,
      max_dispositivos: formData.max_dispositivos,
      tipo_usuario: formData.tipo_usuario,
      modo_acesso: formData.modo_acesso,
      herdar_regras_empresa: formData.herdar_regras_empresa,
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

  const handleChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getPrioridadeLabel = (prioridade: number) => {
    if (prioridade <= 2) return { label: "Alta", color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" };
    if (prioridade <= 4) return { label: "Média", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400" };
    return { label: "Baixa", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400" };
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Velocidade</TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Tripulantes</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfis.map((perfil) => {
                  const tipoLabel = TIPOS_USUARIO.find(t => t.value === perfil.tipo_usuario)?.label || perfil.tipo_usuario;
                  const modoLabel = perfil.modo_acesso === 'permitir_tudo' ? 'Permissivo' : 'Restritivo';
                  return (
                    <TableRow key={perfil.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{perfil.nome}</p>
                          {perfil.descricao && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{perfil.descricao}</p>
                          )}
                          {perfil.limite_dados_mb && (
                            <p className="text-xs text-muted-foreground">Quota: {perfil.limite_dados_mb} MB</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tipoLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Download className="h-3 w-3 text-green-600" />
                          <span>{perfil.velocidade_download}</span>
                          <span className="text-muted-foreground">/</span>
                          <Upload className="h-3 w-3 text-blue-600" />
                          <span>{perfil.velocidade_upload}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{perfil.max_dispositivos}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={perfil.modo_acesso === 'permitir_tudo' 
                            ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                            : "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                          }
                        >
                          {perfil.modo_acesso === 'permitir_tudo' ? (
                            <><Shield className="h-3 w-3 mr-1" />{modoLabel}</>
                          ) : (
                            <><ShieldOff className="h-3 w-3 mr-1" />{modoLabel}</>
                          )}
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
            <EmptyState
              icon={Gauge}
              title="Nenhum perfil cadastrado"
              description="Crie perfis de velocidade para seus tripulantes."
              actionLabel="Novo Perfil"
              onAction={handleCreate}
            />
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {editingPerfil ? "Editar Perfil" : "Novo Perfil de Velocidade"}
            </DialogTitle>
            <DialogDescription>
              Configure os limites de banda e quota para este perfil.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6 py-4">
              {/* Identificação */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Identificação
                </h3>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="nome" className="text-right">
                    Nome *
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
                  <Label htmlFor="descricao" className="text-right">
                    Descrição
                  </Label>
                  <Input
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => handleChange("descricao", e.target.value)}
                    className="col-span-3"
                    placeholder="Descrição opcional do perfil..."
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tipo_usuario" className="text-right">
                    Tipo de Usuário
                  </Label>
                  <Select
                    value={formData.tipo_usuario}
                    onValueChange={(value) => handleChange("tipo_usuario", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-background border shadow-lg">
                      {TIPOS_USUARIO.map(tipo => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Limites de Banda */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Limites de Banda
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="velocidade_download" className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-green-600" />
                      Download
                    </Label>
                    <Input
                      id="velocidade_download"
                      value={formData.velocidade_download}
                      onChange={(e) => handleChange("velocidade_download", e.target.value)}
                      placeholder="10M, 5M, 2M..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="velocidade_upload" className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-600" />
                      Upload
                    </Label>
                    <Input
                      id="velocidade_upload"
                      value={formData.velocidade_upload}
                      onChange={(e) => handleChange("velocidade_upload", e.target.value)}
                      placeholder="5M, 2M, 1M..."
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prioridade">Prioridade (1-8)</Label>
                    <Input
                      id="prioridade"
                      type="number"
                      min={1}
                      max={8}
                      value={formData.prioridade}
                      onChange={(e) => handleChange("prioridade", parseInt(e.target.value) || 4)}
                    />
                    <p className="text-xs text-muted-foreground">1 = Máxima, 8 = Mínima</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_dispositivos">Máx. Dispositivos</Label>
                    <Input
                      id="max_dispositivos"
                      type="number"
                      min={1}
                      max={10}
                      value={formData.max_dispositivos}
                      onChange={(e) => handleChange("max_dispositivos", parseInt(e.target.value) || 1)}
                    />
                    <p className="text-xs text-muted-foreground">Por tripulante</p>
                  </div>
                </div>
              </div>

              {/* Quota de Dados */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Quota de Dados
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="limite_dados_mb">Limite (MB)</Label>
                    <Input
                      id="limite_dados_mb"
                      type="number"
                      value={formData.limite_dados_mb}
                      onChange={(e) => handleChange("limite_dados_mb", e.target.value)}
                      placeholder="Vazio = ilimitado"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quota_periodo">Período de Renovação</Label>
                    <Select
                      value={formData.quota_periodo}
                      onValueChange={(value) => handleChange("quota_periodo", value)}
                      disabled={!formData.limite_dados_mb}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-50 bg-background border shadow-lg">
                        {PERIODOS_QUOTA.map(periodo => (
                          <SelectItem key={periodo.value} value={periodo.value}>
                            {periodo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session_timeout">Timeout de Sessão (minutos)</Label>
                  <Input
                    id="session_timeout"
                    type="number"
                    value={formData.session_timeout_minutos}
                    onChange={(e) => handleChange("session_timeout_minutos", e.target.value)}
                    placeholder="Vazio = sem limite de tempo"
                    className="max-w-xs"
                  />
                </div>
                {formData.limite_dados_mb && (
                  <p className="text-xs text-muted-foreground">
                    ℹ️ A renovação da quota segue o fuso horário configurado na embarcação
                  </p>
                )}
              </div>

              {/* Controle de Acesso */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Controle de Acesso
                </h3>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="modo_acesso" className="text-right">
                    Modo de Acesso
                  </Label>
                  <Select
                    value={formData.modo_acesso}
                    onValueChange={(value) => handleChange("modo_acesso", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-background border shadow-lg">
                      {MODOS_ACESSO.map(modo => (
                        <SelectItem key={modo.value} value={modo.value}>
                          <div className="flex flex-col">
                            <span>{modo.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="herdar_regras" className="text-right">
                    Herdar Regras
                  </Label>
                  <div className="col-span-3 flex items-center gap-3">
                    <Switch
                      id="herdar_regras"
                      checked={formData.herdar_regras_empresa}
                      onCheckedChange={(checked) => handleChange("herdar_regras_empresa", checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formData.herdar_regras_empresa ? "Herda regras da empresa" : "Regras independentes"}
                    </span>
                  </div>
                </div>
                
                {/* Regras de Acesso Aplicadas */}
                {editingPerfil && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Regras de Acesso Aplicadas
                    </h4>
                    <RegrasDoPerfil 
                      perfilId={editingPerfil.id} 
                      herdarRegrasEmpresa={formData.herdar_regras_empresa}
                    />
                  </div>
                )}
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
