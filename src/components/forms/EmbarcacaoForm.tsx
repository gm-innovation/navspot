import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmbarcacaoInsert, EmbarcacaoUpdate } from "@/hooks/useEmbarcacoes";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useListasAcessoByEmpresa } from "@/hooks/useListasAcesso";
import { TIMEZONES_BRASIL } from "@/hooks/usePerfisVelocidade";
import { HelpCircle, Ship, Wifi, Shield, ShieldOff } from "lucide-react";
import { HotspotInsert, HotspotUpdate } from "@/hooks/useHotspots";

interface EmbarcacaoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    embarcacao: EmbarcacaoInsert | (EmbarcacaoUpdate & { id: string });
    hotspot?: Partial<HotspotInsert | HotspotUpdate>;
    listasAplicadas?: string[];
  }) => void;
  initialData?: EmbarcacaoUpdate & { id: string };
  initialHotspot?: HotspotUpdate & { id: string };
  initialListasAplicadas?: string[];
  isLoading?: boolean;
}

import { TIPOS_EMBARCACAO } from "@/constants/embarcacoes";

const INTERFACE_WIFI_OPTIONS = [
  { value: "wlan1", label: "wlan1" },
  { value: "wlan2", label: "wlan2" },
  { value: "bridge1", label: "bridge1" },
];

export function EmbarcacaoForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  initialHotspot,
  initialListasAplicadas = [],
  isLoading,
}: EmbarcacaoFormProps) {
  const { data: empresas } = useEmpresas();
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    nome: "",
    tipo: "navio",
    empresa_id: "",
    responsavel_nome: "",
    responsavel_email: "",
    status: "ativo",
    timezone: "",
  });

  const [hotspotData, setHotspotData] = useState({
    interface_wifi: "wlan1",
    rede: "192.168.88.0/24",
    max_usuarios: 50,
    sync_interval_minutes: 5,
  });

  const [listasAplicadas, setListasAplicadas] = useState<string[]>([]);

  // Fetch listas for selected empresa
  const { data: listasDisponiveis, isLoading: isLoadingListas } = useListasAcessoByEmpresa(formData.empresa_id);

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        nome: initialData.nome || "",
        tipo: initialData.tipo || "navio",
        empresa_id: initialData.empresa_id || "",
        responsavel_nome: initialData.responsavel_nome || "",
        responsavel_email: initialData.responsavel_email || "",
        status: initialData.status || "ativo",
        timezone: initialData.timezone || "",
      });
      setListasAplicadas(initialListasAplicadas);
    } else {
      setFormData({
        nome: "",
        tipo: "navio",
        empresa_id: "",
        responsavel_nome: "",
        responsavel_email: "",
        status: "ativo",
        timezone: "",
      });
      setListasAplicadas([]);
    }
  }, [initialData, initialListasAplicadas]);

  useEffect(() => {
    if (initialHotspot) {
      setHotspotData({
        interface_wifi: initialHotspot.interface_wifi || "wlan1",
        rede: initialHotspot.rede || "192.168.88.0/24",
        max_usuarios: initialHotspot.max_usuarios || 50,
        sync_interval_minutes: initialHotspot.sync_interval_minutes || 5,
      });
    } else {
      setHotspotData({
        interface_wifi: "wlan1",
        rede: "192.168.88.0/24",
        max_usuarios: 50,
        sync_interval_minutes: 5,
      });
    }
  }, [initialHotspot]);

  // Reset listas when empresa changes (unless editing)
  useEffect(() => {
    if (!isEditing) {
      setListasAplicadas([]);
    }
  }, [formData.empresa_id, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && initialData?.id) {
      onSubmit({
        embarcacao: { ...formData, timezone: formData.timezone || null, id: initialData.id },
        hotspot: initialHotspot?.id 
          ? { ...hotspotData, id: initialHotspot.id }
          : hotspotData,
        listasAplicadas,
      });
    } else {
      onSubmit({
        embarcacao: { ...formData, timezone: formData.timezone || null } as EmbarcacaoInsert,
        hotspot: hotspotData,
        listasAplicadas,
      });
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleHotspotChange = (field: string, value: string | number) => {
    setHotspotData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleLista = (listaId: string) => {
    setListasAplicadas(prev => 
      prev.includes(listaId) 
        ? prev.filter(id => id !== listaId)
        : [...prev, listaId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            {isEditing ? "Editar Embarcação" : "Nova Embarcação"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados da embarcação e suas configurações de rede."
              : "Preencha os dados para cadastrar uma nova embarcação."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* Dados Gerais */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Dados Gerais</h3>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nome" className="text-right">
                  Nome
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  className="col-span-3"
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="tipo" className="text-right">
                  Tipo
                </Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => handleChange("tipo", value)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_EMBARCACAO.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="empresa_id" className="text-right">
                  Empresa
                </Label>
                <Select
                  value={formData.empresa_id}
                  onValueChange={(value) => handleChange("empresa_id", value)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas?.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="responsavel_nome" className="text-right">
                  Responsável
                </Label>
                <Input
                  id="responsavel_nome"
                  value={formData.responsavel_nome}
                  onChange={(e) => handleChange("responsavel_nome", e.target.value)}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="responsavel_email" className="text-right">
                  Email
                </Label>
                <Input
                  id="responsavel_email"
                  type="email"
                  value={formData.responsavel_email}
                  onChange={(e) => handleChange("responsavel_email", e.target.value)}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange("status", value)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Fuso Horário */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Fuso Horário Predominante *
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Fuso onde a embarcação opera na maior parte do tempo. 
                      Afeta a renovação de quotas de dados (ex: meia-noite local).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="timezone" className="text-right">
                  Fuso *
                </Label>
                <Select
                  value={formData.timezone || ""}
                  onValueChange={(value) => handleChange("timezone", value)}
                  required
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione o fuso horário" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border shadow-lg">
                    {TIMEZONES_BRASIL.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                ℹ️ Campo obrigatório. Define o horário local para renovação de quotas.
              </p>
            </div>

            <Separator />

            {/* Configurações de Rede (Hotspot) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Configurações de Rede (Hotspot)
                </h3>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="interface_wifi" className="text-right">
                  Interface WiFi
                </Label>
                <Select
                  value={hotspotData.interface_wifi}
                  onValueChange={(value) => handleHotspotChange("interface_wifi", value)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERFACE_WIFI_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rede" className="text-right">
                  Rede
                </Label>
                <Input
                  id="rede"
                  value={hotspotData.rede}
                  onChange={(e) => handleHotspotChange("rede", e.target.value)}
                  className="col-span-3"
                  placeholder="192.168.88.0/24"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="max_usuarios" className="text-right">
                  Max Usuários
                </Label>
                <Input
                  id="max_usuarios"
                  type="number"
                  min={1}
                  value={hotspotData.max_usuarios}
                  onChange={(e) => handleHotspotChange("max_usuarios", parseInt(e.target.value) || 50)}
                  className="col-span-3"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="sync_interval" className="text-right">
                  Intervalo Sync
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="sync_interval"
                    type="number"
                    min={1}
                    max={60}
                    value={hotspotData.sync_interval_minutes}
                    onChange={(e) => handleHotspotChange("sync_interval_minutes", parseInt(e.target.value) || 5)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">minutos</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Controle de Acesso - Listas */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Controle de Acesso
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Selecione as listas de acesso que serão aplicadas automaticamente 
                      a esta embarcação. Regras de acesso serão criadas para cada lista selecionada.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {!formData.empresa_id ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center border rounded-md bg-muted/30">
                  Selecione uma empresa para ver as listas de acesso disponíveis
                </p>
              ) : isLoadingListas ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  Carregando listas...
                </p>
              ) : !listasDisponiveis || listasDisponiveis.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center border rounded-md bg-muted/30">
                  Nenhuma lista de acesso cadastrada para esta empresa.
                  <br />
                  <span className="text-xs">Crie listas em "Listas de Acesso" antes de aplicar.</span>
                </p>
              ) : (
                <div className="space-y-2 border rounded-md p-3 max-h-[180px] overflow-y-auto">
                  {listasDisponiveis.map((lista) => (
                    <div 
                      key={lista.id} 
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleLista(lista.id)}
                    >
                      <Checkbox
                        checked={listasAplicadas.includes(lista.id)}
                        onCheckedChange={() => toggleLista(lista.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {lista.tipo === 'whitelist' ? (
                            <Shield className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5 text-red-600" />
                          )}
                          <span className="text-sm font-medium">{lista.nome}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              lista.tipo === 'whitelist' 
                                ? 'text-green-600 border-green-600' 
                                : 'text-red-600 border-red-600'
                            }`}
                          >
                            {lista.tipo}
                          </Badge>
                        </div>
                        {lista.descricao && (
                          <p className="text-xs text-muted-foreground mt-0.5">{lista.descricao}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {listasAplicadas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {listasAplicadas.length} lista(s) selecionada(s). Regras de acesso serão criadas automaticamente.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.nome.trim() || !formData.empresa_id || !formData.timezone}>
              {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}