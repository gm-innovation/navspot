import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  ShieldCheck, 
  Settings, 
  Trash2, 
  GripVertical,
  ArrowUp,
  ArrowDown,
  Clock,
  Calendar,
  Ship,
  User
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
  useRegrasAcesso, 
  useCreateRegraAcesso, 
  useUpdateRegraAcesso, 
  useDeleteRegraAcesso,
  useUpdateRegrasPrioridade,
  useCreateMultipleRegras,
  DIAS_SEMANA,
  RegraWithRelations 
} from "@/hooks/useRegrasAcesso";
import { ListaMultiSelect } from "@/components/forms/ListaMultiSelect";
import { useListasAcesso } from "@/hooks/useListasAcesso";
import { usePerfisVelocidade } from "@/hooks/usePerfisVelocidade";
import { useTripulantes } from "@/hooks/useTripulantes";
import { useHotspots } from "@/hooks/useHotspots";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDispositivosRegistrados, formatMacAddress, TIPOS_DISPOSITIVO } from "@/hooks/useDispositivosRegistrados";
import { useTableRealtime } from "@/hooks/useRealtimeSubscription";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";
import { Checkbox } from "@/components/ui/checkbox";
import { DeviceSelectorField } from "@/components/forms/DeviceSelectorField";

export default function RegrasAcesso() {
  // Enable realtime updates
  useTableRealtime('regras_acesso', ['regras_acesso']);
  const { user } = useAuth();
  const { data: regras, isLoading, error } = useRegrasAcesso();
  const { data: listas } = useListasAcesso();
  const { data: perfis } = usePerfisVelocidade();
  const { data: tripulantes } = useTripulantes();
  const { data: hotspots } = useHotspots();
  const { data: empresas } = useEmpresas();
  const { data: dispositivos } = useDispositivosRegistrados();
  
  const createRegra = useCreateRegraAcesso();
  const createMultipleRegras = useCreateMultipleRegras();
  const updateRegra = useUpdateRegraAcesso();
  const deleteRegra = useDeleteRegraAcesso();
  const updatePrioridades = useUpdateRegrasPrioridade();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<RegraWithRelations | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [regraToDelete, setRegraToDelete] = useState<RegraWithRelations | null>(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState("");

  const [formData, setFormData] = useState({
    lista_id: "",
    lista_ids: [] as string[],
    perfil_id: "",
    tripulante_id: "",
    mac_address: "",
    hotspot_id: "",
    prioridade: 100,
    horario_inicio: "",
    horario_fim: "",
    dias_semana: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as string[],
    ativo: true,
  });

  useEffect(() => {
    if (editingRegra) {
      setFormData({
        lista_id: editingRegra.lista_id,
        lista_ids: [editingRegra.lista_id], // For editing, use single list
        perfil_id: editingRegra.perfil_id || "",
        tripulante_id: editingRegra.tripulante_id || "",
        mac_address: editingRegra.mac_address || "",
        hotspot_id: editingRegra.hotspot_id || "",
        prioridade: editingRegra.prioridade,
        horario_inicio: editingRegra.horario_inicio || "",
        horario_fim: editingRegra.horario_fim || "",
        dias_semana: (editingRegra.dias_semana as string[]) || ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
        ativo: editingRegra.ativo,
      });
      setSelectedEmpresaId(editingRegra.empresa_id);
    } else {
      setFormData({
        lista_id: "",
        lista_ids: [],
        perfil_id: "",
        tripulante_id: "",
        mac_address: "",
        hotspot_id: "",
        prioridade: 100,
        horario_inicio: "",
        horario_fim: "",
        dias_semana: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
        ativo: true,
      });
      // For non-super_admin, auto-select their empresa
      setSelectedEmpresaId(user?.role !== 'super_admin' ? (user?.empresa_id || "") : "");
    }
  }, [editingRegra, formOpen, user]);

  const handleCreate = () => {
    setEditingRegra(null);
    setFormOpen(true);
  };

  const handleEdit = (regra: RegraWithRelations) => {
    setEditingRegra(regra);
    setFormOpen(true);
  };

  const handleDelete = (regra: RegraWithRelations) => {
    setRegraToDelete(regra);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (regraToDelete) {
      deleteRegra.mutate(regraToDelete.id);
      setDeleteDialogOpen(false);
      setRegraToDelete(null);
    }
  };

  const handleMovePriority = (regra: RegraWithRelations, direction: 'up' | 'down') => {
    if (!regras) return;
    
    const currentIndex = regras.findIndex(r => r.id === regra.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= regras.length) return;
    
    const updates = [
      { id: regra.id, prioridade: regras[targetIndex].prioridade },
      { id: regras[targetIndex].id, prioridade: regra.prioridade },
    ];
    
    updatePrioridades.mutate(updates);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

    // Editing mode: use single lista_id
    if (editingRegra) {
      if (!formData.lista_id) {
        toast({
          title: "Erro",
          description: "Selecione uma lista de acesso.",
          variant: "destructive"
        });
        return;
      }

      const dataToSubmit = {
        lista_id: formData.lista_id,
        perfil_id: formData.perfil_id || null,
        tripulante_id: formData.tripulante_id || null,
        mac_address: formData.mac_address.trim() || null,
        hotspot_id: formData.hotspot_id || null,
        prioridade: formData.prioridade,
        horario_inicio: formData.horario_inicio || null,
        horario_fim: formData.horario_fim || null,
        dias_semana: formData.dias_semana as unknown as Json,
        ativo: formData.ativo,
        empresa_id: empresaId,
      };

      updateRegra.mutate({ ...dataToSubmit, id: editingRegra.id }, {
        onSuccess: () => setFormOpen(false),
      });
      return;
    }

    // Creating mode: use lista_ids for batch creation
    if (formData.lista_ids.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione ao menos uma lista de acesso.",
        variant: "destructive"
      });
      return;
    }

    // Create multiple rules (one per selected list)
    const basePrioridade = formData.prioridade;
    const regrasToCreate = formData.lista_ids.map((lista_id, index) => ({
      lista_id,
      perfil_id: formData.perfil_id || null,
      tripulante_id: formData.tripulante_id || null,
      mac_address: formData.mac_address.trim() || null,
      hotspot_id: formData.hotspot_id || null,
      prioridade: basePrioridade + index,
      horario_inicio: formData.horario_inicio || null,
      horario_fim: formData.horario_fim || null,
      dias_semana: formData.dias_semana as unknown as Json,
      ativo: formData.ativo,
      empresa_id: empresaId,
    }));

    createMultipleRegras.mutate(regrasToCreate, {
      onSuccess: () => setFormOpen(false),
    });
  };

  const toggleDia = (dia: string) => {
    setFormData(prev => ({
      ...prev,
      dias_semana: prev.dias_semana.includes(dia)
        ? prev.dias_semana.filter(d => d !== dia)
        : [...prev.dias_semana, dia]
    }));
  };

  const getAplicacaoLabel = (regra: RegraWithRelations) => {
    if (regra.mac_address) {
      const device = dispositivos?.find(d => d.mac_address === regra.mac_address);
      if (device) {
        return (
          <span className="flex items-center gap-1">
            {device.tripulante_id ? <User className="h-3 w-3" /> : <Ship className="h-3 w-3" />}
            {device.nome || formatMacAddress(regra.mac_address)}
          </span>
        );
      }
      return `MAC: ${formatMacAddress(regra.mac_address)}`;
    }
    if (regra.tripulante) return `Tripulante: ${regra.tripulante.nome}`;
    if (regra.perfil) return `Perfil: ${regra.perfil.nome}`;
    if (regra.hotspot) return `Hotspot: ${regra.hotspot.nome}`;
    return "Global (Empresa)";
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
          <h1 className="text-3xl font-bold tracking-tight">Regras de Acesso</h1>
          <p className="text-muted-foreground">
            Configure regras de firewall vinculando listas a perfis, tripulantes ou dispositivos
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">{regras?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total de Regras</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">
                {regras?.filter(r => r.ativo).length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Regras Ativas</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-2xl font-bold">
                {regras?.filter(r => r.horario_inicio).length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Com Agendamento</p>
            </div>
            <Clock className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Hierarquia de Regras */}
      <Card>
        <CardHeader>
          <CardTitle>Hierarquia de Prioridades</CardTitle>
          <CardDescription>
            Regras com menor número de prioridade são aplicadas primeiro. Regras mais específicas (MAC, tripulante) sobrescrevem regras gerais (perfil, global).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Lista de Regras */}
      <Card>
        <CardHeader>
          <CardTitle>Regras Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {regras && regras.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Ordem</TableHead>
                  <TableHead>Lista</TableHead>
                  <TableHead>Aplica-se a</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regras.map((regra, index) => (
                  <TableRow key={regra.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{regra.prioridade}</span>
                        <div className="flex flex-col ml-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handleMovePriority(regra, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handleMovePriority(regra, 'down')}
                            disabled={index === regras.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{regra.lista?.nome || '-'}</p>
                        <Badge 
                          variant="outline" 
                          className={regra.lista?.tipo === 'whitelist' 
                            ? "text-green-600 border-green-600" 
                            : "text-red-600 border-red-600"
                          }
                        >
                          {regra.lista?.tipo}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{getAplicacaoLabel(regra)}</span>
                    </TableCell>
                    <TableCell>
                      {regra.horario_inicio ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {regra.horario_inicio} - {regra.horario_fim}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">24h</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={regra.ativo ? "default" : "secondary"}>
                        {regra.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEdit(regra)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(regra)}
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
              icon={ShieldCheck}
              title="Nenhuma regra cadastrada"
              description="Crie regras de acesso para controlar o tráfego de rede."
              actionLabel="Nova Regra"
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
              {editingRegra ? "Editar Regra" : "Nova Regra de Acesso"}
            </DialogTitle>
            <DialogDescription>
              Configure a regra de acesso e defina onde ela será aplicada.
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

              {/* Lista de Acesso */}
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">
                  Lista(s) *
                </Label>
                <div className="col-span-3">
                  {editingRegra ? (
                    // Editing mode: single select
                    <Select
                      value={formData.lista_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, lista_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma lista" />
                      </SelectTrigger>
                      <SelectContent className="z-50 bg-background border shadow-lg">
                        {listas?.filter(lista => 
                          user?.role === 'super_admin' 
                            ? (!selectedEmpresaId || lista.empresa_id === selectedEmpresaId)
                            : true
                        ).map(lista => (
                          <SelectItem key={lista.id} value={lista.id}>
                            {lista.nome} ({lista.tipo})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    // Creating mode: multi-select
                    <ListaMultiSelect
                      listas={listas?.filter(lista => 
                        user?.role === 'super_admin' 
                          ? (!selectedEmpresaId || lista.empresa_id === selectedEmpresaId)
                          : true
                      ) || []}
                      selectedIds={formData.lista_ids}
                      onSelectionChange={(ids) => setFormData(prev => ({ ...prev, lista_ids: ids }))}
                    />
                  )}
                </div>
              </div>

              {/* Nota: A ação (permitir/bloquear) é determinada pelo tipo da lista */}

              {/* Prioridade */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="prioridade" className="text-right">
                  Prioridade
                </Label>
                <Input
                  id="prioridade"
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.prioridade}
                  onChange={(e) => setFormData(prev => ({ ...prev, prioridade: parseInt(e.target.value) || 100 }))}
                  className="col-span-3"
                />
              </div>

              {/* Aplicar a - Perfil */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="perfil" className="text-right">
                  Perfil
                </Label>
                <Select
                  value={formData.perfil_id || "_none_"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, perfil_id: value === "_none_" ? "" : value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Todos os perfis (global)" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    <SelectItem value="_none_">Todos os perfis (global)</SelectItem>
                    {perfis?.map(perfil => (
                      <SelectItem key={perfil.id} value={perfil.id}>
                        {perfil.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tripulante específico */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="tripulante" className="text-right">
                  Tripulante
                </Label>
                <Select
                  value={formData.tripulante_id || "_none_"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tripulante_id: value === "_none_" ? "" : value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Nenhum (usar perfil)" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg max-h-[200px]">
                    <SelectItem value="_none_">Nenhum (usar perfil)</SelectItem>
                    {tripulantes?.map(trip => (
                      <SelectItem key={trip.id} value={trip.id}>
                        {trip.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* MAC Address - Device Selector */}
              <DeviceSelectorField
                value={formData.mac_address}
                onChange={(mac) => setFormData(prev => ({ ...prev, mac_address: mac }))}
                empresaId={selectedEmpresaId}
              />

              {/* Hotspot */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="hotspot" className="text-right">
                  Hotspot
                </Label>
                <Select
                  value={formData.hotspot_id || "_none_"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, hotspot_id: value === "_none_" ? "" : value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Todos os hotspots" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    <SelectItem value="_none_">Todos os hotspots</SelectItem>
                    {hotspots?.map(hs => (
                      <SelectItem key={hs.id} value={hs.id}>
                        {hs.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Horário */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">
                  Horário
                </Label>
                <div className="col-span-3 flex gap-2 items-center">
                  <Input
                    type="time"
                    value={formData.horario_inicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={formData.horario_fim}
                    onChange={(e) => setFormData(prev => ({ ...prev, horario_fim: e.target.value }))}
                    className="w-32"
                  />
                </div>
              </div>

              {/* Dias da Semana */}
              <div className="grid grid-cols-4 gap-4">
                <Label className="text-right pt-2">
                  Dias
                </Label>
                <div className="col-span-3 flex flex-wrap gap-2">
                  {DIAS_SEMANA.map(dia => (
                    <div key={dia.value} className="flex items-center gap-1">
                      <Checkbox
                        id={dia.value}
                        checked={formData.dias_semana.includes(dia.value)}
                        onCheckedChange={() => toggleDia(dia.value)}
                      />
                      <Label htmlFor={dia.value} className="text-sm cursor-pointer">
                        {dia.label.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
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
                    {formData.ativo ? "Regra ativa" : "Regra inativa"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMultipleRegras.isPending || updateRegra.isPending}>
                {createMultipleRegras.isPending || updateRegra.isPending 
                  ? "Salvando..." 
                  : editingRegra 
                    ? "Salvar" 
                    : formData.lista_ids.length > 1 
                      ? `Cadastrar ${formData.lista_ids.length} regras`
                      : "Cadastrar"
                }
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
              Tem certeza que deseja excluir esta regra de acesso?
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
