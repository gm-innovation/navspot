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
import { TripulanteInsert, TripulanteUpdate } from "@/hooks/useTripulantes";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { usePerfisVelocidade } from "@/hooks/usePerfisVelocidade";

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

// Gerar login a partir do nome
function generateLogin(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .join('.');
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
    nome: "",
    login_wifi: "",
    senha_wifi: "",
    email: "",
    cpf: "",
    cargo: "",
    embarcacao_id: "",
    perfil_id: "",
    status: "ativo",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        nome: initialData.nome || "",
        login_wifi: initialData.login_wifi || "",
        senha_wifi: initialData.senha_wifi || "",
        email: initialData.email || "",
        cpf: initialData.cpf || "",
        cargo: initialData.cargo || "",
        embarcacao_id: initialData.embarcacao_id || "",
        perfil_id: initialData.perfil_id || "",
        status: initialData.status || "ativo",
      });
    } else {
      setFormData({
        nome: "",
        login_wifi: "",
        senha_wifi: generatePassword(),
        email: "",
        cpf: "",
        cargo: "",
        embarcacao_id: "",
        perfil_id: "",
        status: "ativo",
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = {
      ...formData,
      perfil_id: formData.perfil_id || null,
    };
    
    if (isEditing && initialData?.id) {
      onSubmit({ ...dataToSubmit, id: initialData.id });
    } else {
      onSubmit(dataToSubmit as TripulanteInsert);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };
      
      // Auto-generate login when name changes (only for new tripulantes)
      if (field === "nome" && !isEditing && !prev.login_wifi) {
        newData.login_wifi = generateLogin(value);
      }
      
      return newData;
    });
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
              : "Cadastre um novo tripulante com credenciais WiFi."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nome" className="text-right">
                Nome
              </Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                className="col-span-3"
                placeholder="João Silva"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="login_wifi" className="text-right">
                Login WiFi
              </Label>
              <Input
                id="login_wifi"
                value={formData.login_wifi}
                onChange={(e) => handleChange("login_wifi", e.target.value)}
                className="col-span-3"
                placeholder="joao.silva"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="senha_wifi" className="text-right">
                Senha WiFi
              </Label>
              <div className="col-span-3 flex gap-2">
                <Input
                  id="senha_wifi"
                  value={formData.senha_wifi}
                  onChange={(e) => handleChange("senha_wifi", e.target.value)}
                  required
                />
                <Button type="button" variant="outline" onClick={handleGeneratePassword}>
                  Gerar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cpf" className="text-right">
                CPF
              </Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => handleChange("cpf", e.target.value)}
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
                value={formData.cargo}
                onChange={(e) => handleChange("cargo", e.target.value)}
                className="col-span-3"
                placeholder="Comandante, Imediato, Tripulante..."
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="embarcacao_id" className="text-right">
                Embarcação
              </Label>
              <Select
                value={formData.embarcacao_id}
                onValueChange={(value) => handleChange("embarcacao_id", value)}
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="perfil_id" className="text-right">
                Perfil
              </Label>
              <Select
                value={formData.perfil_id}
                onValueChange={(value) => handleChange("perfil_id", value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione o perfil (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {perfis?.map((perfil) => (
                    <SelectItem key={perfil.id} value={perfil.id}>
                      {perfil.nome} ({perfil.velocidade_download}/{perfil.velocidade_upload})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
