import { useState } from "react";
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
import { EmbarcacaoInsert, EmbarcacaoUpdate } from "@/hooks/useEmbarcacoes";
import { useEmpresas } from "@/hooks/useEmpresas";

interface EmbarcacaoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: EmbarcacaoInsert | (EmbarcacaoUpdate & { id: string })) => void;
  initialData?: EmbarcacaoUpdate & { id: string };
  isLoading?: boolean;
}

const tiposEmbarcacao = [
  "navio",
  "lancha",
  "iate",
  "barco",
  "petroleiro",
  "cargueiro",
  "ferry",
  "rebocador",
];

export function EmbarcacaoForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: EmbarcacaoFormProps) {
  const { data: empresas } = useEmpresas();
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    nome: initialData?.nome || "",
    tipo: initialData?.tipo || "navio",
    empresa_id: initialData?.empresa_id || "",
    responsavel_nome: initialData?.responsavel_nome || "",
    responsavel_email: initialData?.responsavel_email || "",
    localizacao: initialData?.localizacao || "",
    status: initialData?.status || "ativo",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && initialData?.id) {
      onSubmit({ ...formData, id: initialData.id });
    } else {
      onSubmit(formData as EmbarcacaoInsert);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Embarcação" : "Nova Embarcação"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados da embarcação."
              : "Preencha os dados para cadastrar uma nova embarcação."}
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
                  {tiposEmbarcacao.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
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
              <Label htmlFor="localizacao" className="text-right">
                Localização
              </Label>
              <Input
                id="localizacao"
                value={formData.localizacao}
                onChange={(e) => handleChange("localizacao", e.target.value)}
                className="col-span-3"
                placeholder="Porto de Santos"
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
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
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
