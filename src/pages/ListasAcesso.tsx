import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  List, 
  Settings, 
  Trash2, 
  Copy,
  Shield,
  ShieldOff,
  Globe,
  Mail,
  MessageCircle,
  Video,
  Music,
  Briefcase,
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
  useListasAcesso, 
  useCreateListaAcesso, 
  useUpdateListaAcesso, 
  useDeleteListaAcesso,
  useCreateListaFromTemplate,
  TEMPLATES_LISTAS,
  ListaWithRulesCount 
} from "@/hooks/useListasAcesso";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "Comunicação - WhatsApp": <MessageCircle className="h-4 w-4" />,
  "Comunicação - Email": <Mail className="h-4 w-4" />,
  "Comunicação - Telegram": <MessageCircle className="h-4 w-4" />,
  "Redes Sociais": <Globe className="h-4 w-4" />,
  "Streaming de Vídeo": <Video className="h-4 w-4" />,
  "Streaming de Música": <Music className="h-4 w-4" />,
  "Trabalho - Google Workspace": <Briefcase className="h-4 w-4" />,
  "Trabalho - Microsoft 365": <Briefcase className="h-4 w-4" />,
};

export default function ListasAcesso() {
  // Enable realtime updates
  useTableRealtime('listas_acesso', ['listas_acesso']);
  const { user } = useAuth();
  const { data: listas, isLoading, error } = useListasAcesso();
  const { data: empresas } = useEmpresas();
  const createLista = useCreateListaAcesso();
  const updateLista = useUpdateListaAcesso();
  const deleteLista = useDeleteListaAcesso();
  const createFromTemplate = useCreateListaFromTemplate();

  const [formOpen, setFormOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingLista, setEditingLista] = useState<ListaWithRulesCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listaToDelete, setListaToDelete] = useState<ListaWithRulesCount | null>(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState("");
  const [templateEmpresaId, setTemplateEmpresaId] = useState("");

  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    tipo: "whitelist" as "whitelist" | "blacklist",
    dominios: [] as string[],
    aplicativos: [] as string[],
    ativo: true,
  });

  const [newDominio, setNewDominio] = useState("");
  const [newAplicativo, setNewAplicativo] = useState("");

  useEffect(() => {
    if (editingLista) {
      setFormData({
        nome: editingLista.nome,
        descricao: editingLista.descricao || "",
        tipo: editingLista.tipo as "whitelist" | "blacklist",
        dominios: (editingLista.dominios as string[]) || [],
        aplicativos: (editingLista.aplicativos as string[]) || [],
        ativo: editingLista.ativo,
      });
      setSelectedEmpresaId(editingLista.empresa_id);
    } else {
      setFormData({
        nome: "",
        descricao: "",
        tipo: "whitelist",
        dominios: [],
        aplicativos: [],
        ativo: true,
      });
      // For non-super_admin, auto-select their empresa
      setSelectedEmpresaId(user?.role !== 'super_admin' ? (user?.empresa_id || "") : "");
    }
    setNewDominio("");
    setNewAplicativo("");
  }, [editingLista, formOpen, user]);

  const handleCreate = () => {
    setEditingLista(null);
    setFormOpen(true);
  };

  const handleEdit = (lista: ListaWithRulesCount) => {
    setEditingLista(lista);
    setFormOpen(true);
  };

  const handleDelete = (lista: ListaWithRulesCount) => {
    setListaToDelete(lista);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (listaToDelete) {
      deleteLista.mutate(listaToDelete.id);
      setDeleteDialogOpen(false);
      setListaToDelete(null);
    }
  };

  const handleAddDominio = () => {
    const dominio = newDominio.trim().toLowerCase();
    if (dominio && !formData.dominios.includes(dominio)) {
      // Basic validation for domain format
      if (dominio.length > 0 && dominio.length < 256) {
        setFormData(prev => ({
          ...prev,
          dominios: [...prev.dominios, dominio]
        }));
        setNewDominio("");
      }
    }
  };

  const handleRemoveDominio = (dominio: string) => {
    setFormData(prev => ({
      ...prev,
      dominios: prev.dominios.filter(d => d !== dominio)
    }));
  };

  const handleAddAplicativo = () => {
    const app = newAplicativo.trim().toLowerCase();
    if (app && !formData.aplicativos.includes(app)) {
      if (app.length > 0 && app.length < 100) {
        setFormData(prev => ({
          ...prev,
          aplicativos: [...prev.aplicativos, app]
        }));
        setNewAplicativo("");
      }
    }
  };

  const handleRemoveAplicativo = (app: string) => {
    setFormData(prev => ({
      ...prev,
      aplicativos: prev.aplicativos.filter(a => a !== app)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome.trim()) {
      toast({
        title: "Erro",
        description: "O nome da lista é obrigatório.",
        variant: "destructive"
      });
      return;
    }

    const empresaId = user?.role === 'super_admin' 
      ? selectedEmpresaId 
      : user?.empresa_id;

    if (!empresaId) {
      toast({
        title: "Erro",
        description: "Selecione uma empresa.",
        variant: "destructive"
      });
      return;
    }

    const dataToSubmit = {
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim() || null,
      tipo: formData.tipo,
      dominios: formData.dominios as unknown as Json,
      aplicativos: formData.aplicativos as unknown as Json,
      portas: [] as unknown as Json,
      ativo: formData.ativo,
      empresa_id: empresaId,
    };

    if (editingLista) {
      updateLista.mutate({ ...dataToSubmit, id: editingLista.id }, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createLista.mutate(dataToSubmit, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  const handleCreateFromTemplate = (template: typeof TEMPLATES_LISTAS[number]) => {
    const empresaId = user?.role === 'super_admin' 
      ? templateEmpresaId 
      : user?.empresa_id;

    if (!empresaId) {
      toast({
        title: "Erro",
        description: "Selecione uma empresa para criar a lista.",
        variant: "destructive"
      });
      return;
    }
    
    createFromTemplate.mutate(
      { template, empresaId },
      { onSuccess: () => {
        setTemplateModalOpen(false);
        setTemplateEmpresaId("");
      }}
    );
  };

  const handleCopyDominios = (lista: ListaWithRulesCount) => {
    const dominios = (lista.dominios as string[]) || [];
    navigator.clipboard.writeText(dominios.join('\n'));
    toast({
      title: "Copiado!",
      description: `${dominios.length} domínio(s) copiado(s) para a área de transferência.`,
    });
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

  const whitelists = listas?.filter(l => l.tipo === 'whitelist') || [];
  const blacklists = listas?.filter(l => l.tipo === 'blacklist') || [];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Listas de Acesso</h1>
          <p className="text-muted-foreground">
            Gerencie listas de sites e aplicativos permitidos ou bloqueados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateModalOpen(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Usar Template
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Lista
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{listas?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total de Listas</p>
            </div>
            <List className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{whitelists.length}</p>
              <p className="text-sm text-muted-foreground">Whitelists</p>
            </div>
            <Shield className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{blacklists.length}</p>
              <p className="text-sm text-muted-foreground">Blacklists</p>
            </div>
            <ShieldOff className="h-8 w-8 text-red-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">
                {listas?.reduce((acc, l) => acc + ((l.dominios as string[])?.length || 0), 0) || 0}
              </p>
              <p className="text-sm text-muted-foreground">Domínios Cadastrados</p>
            </div>
            <Globe className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Lista de Listas */}
      <Card>
        <CardHeader>
          <CardTitle>Listas Cadastradas</CardTitle>
          <CardDescription>
            Whitelists permitem apenas os domínios listados. Blacklists bloqueiam os domínios listados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listas && listas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Domínios</TableHead>
                  <TableHead>Apps</TableHead>
                  <TableHead>Regras</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listas.map((lista) => (
                  <TableRow key={lista.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{lista.nome}</p>
                        {lista.descricao && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{lista.descricao}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary" 
                        className={lista.tipo === 'whitelist' 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                          : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                        }
                      >
                        {lista.tipo === 'whitelist' ? (
                          <><Shield className="h-3 w-3 mr-1" />Whitelist</>
                        ) : (
                          <><ShieldOff className="h-3 w-3 mr-1" />Blacklist</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {((lista.dominios as string[])?.length || 0)} domínio(s)
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {((lista.aplicativos as string[])?.length || 0)} app(s)
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lista.regras_count || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={lista.ativo ? "default" : "secondary"}>
                        {lista.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleCopyDominios(lista)}
                          title="Copiar domínios"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEdit(lista)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(lista)}
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
              icon={List}
              title="Nenhuma lista cadastrada"
              description="Crie listas de acesso para controlar sites e aplicativos."
              actionLabel="Nova Lista"
              onAction={handleCreate}
            />
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLista ? "Editar Lista" : "Nova Lista de Acesso"}
            </DialogTitle>
            <DialogDescription>
              Configure os domínios e aplicativos para esta lista.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {/* Empresa - apenas para super_admin */}
              {user?.role === 'super_admin' && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="empresa" className="text-right">
                    Empresa *
                  </Label>
                  <Select
                    value={selectedEmpresaId}
                    onValueChange={setSelectedEmpresaId}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-background border shadow-lg">
                      {empresas?.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Nome */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nome" className="text-right">
                  Nome
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  className="col-span-3"
                  placeholder="Comunicação, Redes Sociais..."
                  maxLength={100}
                  required
                />
              </div>

              {/* Tipo */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="tipo" className="text-right">
                  Tipo
                </Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value: "whitelist" | "blacklist") => 
                    setFormData(prev => ({ ...prev, tipo: value }))
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    <SelectItem value="whitelist">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-green-600" />
                        Whitelist (Permitir apenas estes)
                      </div>
                    </SelectItem>
                    <SelectItem value="blacklist">
                      <div className="flex items-center gap-2">
                        <ShieldOff className="h-4 w-4 text-red-600" />
                        Blacklist (Bloquear estes)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Descrição */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descricao" className="text-right">
                  Descrição
                </Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  className="col-span-3"
                  placeholder="Descrição opcional..."
                  maxLength={500}
                  rows={2}
                />
              </div>

              {/* Domínios */}
              <div className="grid grid-cols-4 gap-4">
                <Label className="text-right pt-2">
                  Domínios
                </Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newDominio}
                      onChange={(e) => setNewDominio(e.target.value)}
                      placeholder="*.whatsapp.net, google.com..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDominio();
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddDominio} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 min-h-[40px] p-2 border rounded-md bg-muted/50">
                    {formData.dominios.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Nenhum domínio adicionado</span>
                    ) : (
                      formData.dominios.map((dominio) => (
                        <Badge key={dominio} variant="secondary" className="gap-1">
                          {dominio}
                          <button
                            type="button"
                            onClick={() => handleRemoveDominio(dominio)}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use * como wildcard. Ex: *.google.com para incluir todos os subdomínios.
                  </p>
                </div>
              </div>

              {/* Aplicativos */}
              <div className="grid grid-cols-4 gap-4">
                <Label className="text-right pt-2">
                  Aplicativos
                </Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newAplicativo}
                      onChange={(e) => setNewAplicativo(e.target.value)}
                      placeholder="whatsapp, youtube, spotify..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAplicativo();
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddAplicativo} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 min-h-[40px] p-2 border rounded-md bg-muted/50">
                    {formData.aplicativos.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Nenhum aplicativo adicionado</span>
                    ) : (
                      formData.aplicativos.map((app) => (
                        <Badge key={app} variant="secondary" className="gap-1">
                          {app}
                          <button
                            type="button"
                            onClick={() => handleRemoveAplicativo(app)}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Ativo */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="ativo" className="text-right">
                  Ativa
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ativo: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.ativo ? "Lista ativa" : "Lista inativa"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLista.isPending || updateLista.isPending}>
                {createLista.isPending || updateLista.isPending ? "Salvando..." : editingLista ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Templates Modal */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Templates Predefinidos</DialogTitle>
            <DialogDescription>
              Selecione um template para criar uma lista de acesso rapidamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Empresa selector for super_admin */}
            {user?.role === 'super_admin' && (
              <div className="grid grid-cols-4 items-center gap-4 pb-4 border-b">
                <Label className="text-right">Empresa *</Label>
                <Select
                  value={templateEmpresaId}
                  onValueChange={setTemplateEmpresaId}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    {empresas?.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="grid gap-3 max-h-[350px] overflow-y-auto">
              {TEMPLATES_LISTAS.map((template) => (
                <Card 
                  key={template.nome} 
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                    user?.role === 'super_admin' && !templateEmpresaId ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  onClick={() => handleCreateFromTemplate(template)}
                >
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      template.tipo === 'whitelist' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {TEMPLATE_ICONS[template.nome] || <Globe className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{template.nome}</p>
                        <Badge variant="outline" className="text-xs">
                          {template.tipo}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{template.descricao}</p>
                      <div className="flex flex-wrap gap-1">
                        {template.dominios.slice(0, 3).map((d) => (
                          <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                        ))}
                        {template.dominios.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{template.dominios.length - 3} mais
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a lista "{listaToDelete?.nome}"? 
              {(listaToDelete?.regras_count || 0) > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Atenção: {listaToDelete?.regras_count} regra(s) usam esta lista e serão removidas.
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
