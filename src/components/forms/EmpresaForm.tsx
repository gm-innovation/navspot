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
import { EmpresaInsert, EmpresaUpdate } from "@/hooks/useEmpresas";
import { Building2 } from "lucide-react";

interface EmpresaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: EmpresaInsert | (EmpresaUpdate & { id: string })) => void;
  initialData?: EmpresaUpdate & { id: string };
  isLoading?: boolean;
}

export function EmpresaForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: EmpresaFormProps) {
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    nome: "",
    cnpj: "",
    email: "",
    telefone: "",
    endereco: "",
    status: "ativo",
    logo_url: "",
    cor_primaria: "#1E3A8A",
    cor_secundaria: "#38BDF8",
    cor_fundo: "#F8FAFC",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        nome: initialData.nome || "",
        cnpj: initialData.cnpj || "",
        email: initialData.email || "",
        telefone: initialData.telefone || "",
        endereco: initialData.endereco || "",
        status: initialData.status || "ativo",
        logo_url: (initialData as any).logo_url || "",
        cor_primaria: (initialData as any).cor_primaria || "#1E3A8A",
        cor_secundaria: (initialData as any).cor_secundaria || "#38BDF8",
        cor_fundo: (initialData as any).cor_fundo || "#F8FAFC",
      });
    } else {
      setFormData({
        nome: "",
        cnpj: "",
        email: "",
        telefone: "",
        endereco: "",
        status: "ativo",
        logo_url: "",
        cor_primaria: "#1E3A8A",
        cor_secundaria: "#38BDF8",
        cor_fundo: "#F8FAFC",
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && initialData?.id) {
      onSubmit({ ...formData, id: initialData.id });
    } else {
      onSubmit(formData as EmpresaInsert);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Format CNPJ as user types
  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  // Format phone as user types
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {isEditing ? "Editar Empresa" : "Nova Empresa"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados cadastrais da empresa."
              : "Preencha os dados para cadastrar uma nova empresa."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nome" className="text-right">
                Nome *
              </Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                className="col-span-3"
                placeholder="Nome da empresa"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cnpj" className="text-right">
                CNPJ
              </Label>
              <Input
                id="cnpj"
                value={formData.cnpj}
                onChange={(e) => handleChange("cnpj", formatCNPJ(e.target.value))}
                className="col-span-3"
                placeholder="00.000.000/0000-00"
              />
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
                placeholder="contato@empresa.com.br"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="telefone" className="text-right">
                Telefone
              </Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) => handleChange("telefone", formatPhone(e.target.value))}
                className="col-span-3"
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endereco" className="text-right">
                Endereço
              </Label>
              <Input
                id="endereco"
                value={formData.endereco}
                onChange={(e) => handleChange("endereco", e.target.value)}
                className="col-span-3"
                placeholder="Endereço completo"
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

            {/* Portal WiFi Branding Section */}
            <div className="col-span-4 pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-4">Portal WiFi (Branding)</p>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="logo_url" className="text-right">
                URL do Logo
              </Label>
              <Input
                id="logo_url"
                value={formData.logo_url}
                onChange={(e) => handleChange("logo_url", e.target.value)}
                className="col-span-3"
                placeholder="https://exemplo.com/logo.png"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cor_primaria" className="text-right">
                Cor Primária
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="cor_primaria"
                  value={formData.cor_primaria}
                  onChange={(e) => handleChange("cor_primaria", e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={formData.cor_primaria}
                  onChange={(e) => handleChange("cor_primaria", e.target.value)}
                  className="flex-1"
                  placeholder="#1E3A8A"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cor_secundaria" className="text-right">
                Cor Secundária
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="cor_secundaria"
                  value={formData.cor_secundaria}
                  onChange={(e) => handleChange("cor_secundaria", e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={formData.cor_secundaria}
                  onChange={(e) => handleChange("cor_secundaria", e.target.value)}
                  className="flex-1"
                  placeholder="#38BDF8"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cor_fundo" className="text-right">
                Cor de Fundo
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="cor_fundo"
                  value={formData.cor_fundo}
                  onChange={(e) => handleChange("cor_fundo", e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={formData.cor_fundo}
                  onChange={(e) => handleChange("cor_fundo", e.target.value)}
                  className="flex-1"
                  placeholder="#F8FAFC"
                />
              </div>
            </div>

            {/* Preview */}
            {(formData.logo_url || formData.cor_primaria !== "#1E3A8A") && (
              <div className="col-span-4 mt-2">
                <p className="text-xs text-muted-foreground mb-2">Preview do Portal:</p>
                <div 
                  className="rounded-lg p-4 flex items-center gap-3"
                  style={{ backgroundColor: formData.cor_fundo }}
                >
                  {formData.logo_url ? (
                    <img 
                      src={formData.logo_url} 
                      alt="Logo preview" 
                      className="h-8 w-auto object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${formData.cor_primaria}20` }}
                    >
                      <Building2 className="h-4 w-4" style={{ color: formData.cor_primaria }} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold" style={{ color: formData.cor_primaria }}>
                      {formData.nome || "Nome da Empresa"}
                    </p>
                    <p className="text-xs" style={{ color: formData.cor_secundaria }}>
                      WiFi Marítimo
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !formData.nome.trim()}>
              {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
