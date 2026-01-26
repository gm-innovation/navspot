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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TripulanteInsert, TripulanteUpdate } from "@/hooks/useTripulantes";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { usePerfisVelocidade } from "@/hooks/usePerfisVelocidade";
import { Info, RefreshCw } from "lucide-react";

interface TripulanteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TripulanteInsert | (TripulanteUpdate & { id: string })) => void;
  initialData?: TripulanteUpdate & { id: string };
  isLoading?: boolean;
}

// Gerar senha aleatória
function generatePassword(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Gerar login aleatório
function generateLogin(): string {
  const prefix = 'user';
  const randomNum = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${randomNum}`;
}

interface ConfigPersonalizada {
  velocidade_download: string;
  velocidade_upload: string;
  max_dispositivos: number;
  modo_acesso: string;
}

export function TripulanteForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: TripulanteFormProps) {
  const { data: embarcacoes } = useEmbarcacoes();
  const { data: perfis } = usePerfisVelocidade();
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    login_wifi: "",
    senha_wifi: "",
    embarcacao_id: "",
    modo_config: "perfil" as "perfil" | "personalizado",
    perfil_id: "",
    // Config personalizada
    velocidade_download: "5M",
    velocidade_upload: "2M",
    max_dispositivos: 1,
    modo_acesso: "permitir_tudo",
  });

  // Extra fields for editing mode
  const [editFields, setEditFields] = useState({
    nome: "",
    email: "",
    cpf: "",
    cargo: "",
    status: "ativo",
  });

  useEffect(() => {
    if (initialData) {
      // Check if has custom config
      const configPersonalizada = initialData.config_personalizada as unknown as ConfigPersonalizada | null;
      const hasCustomConfig = !!configPersonalizada;
      
      setFormData({
        login_wifi: initialData.login_wifi || "",
        senha_wifi: initialData.senha_wifi || "",
        embarcacao_id: initialData.embarcacao_id || "",
        modo_config: hasCustomConfig ? "personalizado" : "perfil",
        perfil_id: initialData.perfil_id || "",
        velocidade_download: configPersonalizada?.velocidade_download || "5M",
        velocidade_upload: configPersonalizada?.velocidade_upload || "2M",
        max_dispositivos: configPersonalizada?.max_dispositivos || 1,
        modo_acesso: configPersonalizada?.modo_acesso || "permitir_tudo",
      });
      setEditFields({
        nome: initialData.nome || "",
        email: initialData.email || "",
        cpf: initialData.cpf || "",
        cargo: initialData.cargo || "",
        status: initialData.status || "ativo",
      });
    } else {
      setFormData({
        login_wifi: generateLogin(),
        senha_wifi: generatePassword(),
        embarcacao_id: "",
        modo_config: "perfil",
        perfil_id: "",
        velocidade_download: "5M",
        velocidade_upload: "2M",
        max_dispositivos: 1,
        modo_acesso: "permitir_tudo",
      });
      setEditFields({
        nome: "",
        email: "",
        cpf: "",
        cargo: "",
        status: "ativo",
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditing && initialData?.id) {
      // Editing mode - include all fields
      const configPersonalizada = formData.modo_config === "personalizado" ? {
        velocidade_download: formData.velocidade_download,
        velocidade_upload: formData.velocidade_upload,
        max_dispositivos: formData.max_dispositivos,
        modo_acesso: formData.modo_acesso,
      } : null;

      onSubmit({
        id: initialData.id,
        login_wifi: formData.login_wifi,
        senha_wifi: formData.senha_wifi,
        embarcacao_id: formData.embarcacao_id,
        perfil_id: formData.modo_config === "perfil" ? formData.perfil_id || null : null,
        config_personalizada: configPersonalizada,
        nome: editFields.nome,
        email: editFields.email || null,
        cpf: editFields.cpf || null,
        cargo: editFields.cargo || null,
        status: editFields.status,
      });
    } else {
      // Creating mode - simplified
      const configPersonalizada = formData.modo_config === "personalizado" ? {
        velocidade_download: formData.velocidade_download,
        velocidade_upload: formData.velocidade_upload,
        max_dispositivos: formData.max_dispositivos,
        modo_acesso: formData.modo_acesso,
      } : null;

      onSubmit({
        nome: formData.login_wifi, // Nome = login initially
        login_wifi: formData.login_wifi,
        senha_wifi: formData.senha_wifi,
        embarcacao_id: formData.embarcacao_id,
        perfil_id: formData.modo_config === "perfil" ? formData.perfil_id || null : null,
        config_personalizada: configPersonalizada,
        status: "pendente_cadastro",
      } as TripulanteInsert);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditFieldChange = (field: string, value: string) => {
    setEditFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerateLogin = () => {
    setFormData((prev) => ({ ...prev, login_wifi: generateLogin() }));
  };

  const handleGeneratePassword = () => {
    setFormData((prev) => ({ ...prev, senha_wifi: generatePassword() }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Tripulante" : "Novo Tripulante"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados do tripulante."
              : "Cadastre um novo tripulante. Os dados pessoais serão preenchidos pelo próprio tripulante."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Credenciais WiFi */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground">Credenciais WiFi</h3>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="login_wifi" className="text-right">
                  Login
                </Label>
                <div className="col-span-3 flex gap-2">
                  <Input
                    id="login_wifi"
                    value={formData.login_wifi}
                    onChange={(e) => handleChange("login_wifi", e.target.value)}
                    placeholder="user1234"
                    required
                  />
                  <Button type="button" variant="outline" size="icon" onClick={handleGenerateLogin}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="senha_wifi" className="text-right">
                  Senha
                </Label>
                <div className="col-span-3 flex gap-2">
                  <Input
                    id="senha_wifi"
                    value={formData.senha_wifi}
                    onChange={(e) => handleChange("senha_wifi", e.target.value)}
                    required
                  />
                  <Button type="button" variant="outline" size="icon" onClick={handleGeneratePassword}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Embarcação */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="embarcacao_id" className="text-right">
                Embarcação
              </Label>
              <Select
                value={formData.embarcacao_id}
                onValueChange={(value) => handleChange("embarcacao_id", value)}
                required
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione a embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {embarcacoes?.map((emb) => (
                    <SelectItem key={emb.id} value={emb.id}>
                      {emb.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Modo de Configuração */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground">Configuração de Acesso</h3>
              
              <RadioGroup
                value={formData.modo_config}
                onValueChange={(value) => handleChange("modo_config", value)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="perfil" id="perfil" />
                  <Label htmlFor="perfil" className="cursor-pointer">
                    Usar Perfil Pré-configurado
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="personalizado" id="personalizado" />
                  <Label htmlFor="personalizado" className="cursor-pointer">
                    Configuração Personalizada
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Perfil Select (conditional) */}
            {formData.modo_config === "perfil" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="perfil_id" className="text-right">
                  Perfil
                </Label>
                <Select
                  value={formData.perfil_id}
                  onValueChange={(value) => handleChange("perfil_id", value)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {perfis?.map((perfil) => (
                      <SelectItem key={perfil.id} value={perfil.id}>
                        {perfil.nome} ({perfil.velocidade_download}/{perfil.velocidade_upload}) - {perfil.max_dispositivos} disp.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Custom Config Fields (conditional) */}
            {formData.modo_config === "personalizado" && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="velocidade_download" className="text-right">
                    Download
                  </Label>
                  <Select
                    value={formData.velocidade_download}
                    onValueChange={(value) => handleChange("velocidade_download", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1M">1 Mbps</SelectItem>
                      <SelectItem value="2M">2 Mbps</SelectItem>
                      <SelectItem value="5M">5 Mbps</SelectItem>
                      <SelectItem value="10M">10 Mbps</SelectItem>
                      <SelectItem value="20M">20 Mbps</SelectItem>
                      <SelectItem value="50M">50 Mbps</SelectItem>
                      <SelectItem value="100M">100 Mbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="velocidade_upload" className="text-right">
                    Upload
                  </Label>
                  <Select
                    value={formData.velocidade_upload}
                    onValueChange={(value) => handleChange("velocidade_upload", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="512K">512 Kbps</SelectItem>
                      <SelectItem value="1M">1 Mbps</SelectItem>
                      <SelectItem value="2M">2 Mbps</SelectItem>
                      <SelectItem value="5M">5 Mbps</SelectItem>
                      <SelectItem value="10M">10 Mbps</SelectItem>
                      <SelectItem value="20M">20 Mbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="max_dispositivos" className="text-right">
                    Dispositivos
                  </Label>
                  <Select
                    value={String(formData.max_dispositivos)}
                    onValueChange={(value) => handleChange("max_dispositivos", parseInt(value))}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 dispositivo</SelectItem>
                      <SelectItem value="2">2 dispositivos</SelectItem>
                      <SelectItem value="3">3 dispositivos</SelectItem>
                      <SelectItem value="5">5 dispositivos</SelectItem>
                      <SelectItem value="10">10 dispositivos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="modo_acesso" className="text-right">
                    Acesso
                  </Label>
                  <Select
                    value={formData.modo_acesso}
                    onValueChange={(value) => handleChange("modo_acesso", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permitir_tudo">Permitir tudo</SelectItem>
                      <SelectItem value="bloquear_tudo">Bloquear tudo (apenas whitelist)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Edit Mode - Extra Fields */}
            {isEditing && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Dados Pessoais</h3>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="nome" className="text-right">
                    Nome
                  </Label>
                  <Input
                    id="nome"
                    value={editFields.nome}
                    onChange={(e) => handleEditFieldChange("nome", e.target.value)}
                    className="col-span-3"
                    placeholder="João Silva"
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={editFields.email}
                    onChange={(e) => handleEditFieldChange("email", e.target.value)}
                    className="col-span-3"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="cpf" className="text-right">
                    CPF
                  </Label>
                  <Input
                    id="cpf"
                    value={editFields.cpf}
                    onChange={(e) => handleEditFieldChange("cpf", e.target.value)}
                    className="col-span-3"
                    placeholder="123.456.789-00"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="cargo" className="text-right">
                    Cargo
                  </Label>
                  <Input
                    id="cargo"
                    value={editFields.cargo}
                    onChange={(e) => handleEditFieldChange("cargo", e.target.value)}
                    className="col-span-3"
                    placeholder="Comandante, Imediato..."
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="status" className="text-right">
                    Status
                  </Label>
                  <Select
                    value={editFields.status}
                    onValueChange={(value) => handleEditFieldChange("status", value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="pendente_cadastro">Pendente Cadastro</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Info message for new registrations */}
            {!isEditing && (
              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p className="text-muted-foreground">
                  Os dados pessoais (nome, email, CPF, cargo) serão preenchidos pelo próprio tripulante 
                  no primeiro acesso via QR Code.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.embarcacao_id}>
              {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
