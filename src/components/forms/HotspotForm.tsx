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
import { HotspotInsert, HotspotUpdate } from "@/hooks/useHotspots";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";

interface HotspotFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: HotspotInsert | (HotspotUpdate & { id: string })) => void;
  initialData?: HotspotUpdate & { id: string };
  isLoading?: boolean;
}

export function HotspotForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: HotspotFormProps) {
  const { data: embarcacoes } = useEmbarcacoes();
  const isEditing = !!initialData;

  const [formData, setFormData] = useState({
    nome: "",
    embarcacao_id: "",
    interface_wifi: "wlan1",
    rede: "192.168.88.0/24",
    max_usuarios: 50,
    sync_interval_minutes: 5,
    status: "offline",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        nome: initialData.nome || "",
        embarcacao_id: initialData.embarcacao_id || "",
        interface_wifi: initialData.interface_wifi || "wlan1",
        rede: initialData.rede || "192.168.88.0/24",
        max_usuarios: initialData.max_usuarios || 50,
        sync_interval_minutes: initialData.sync_interval_minutes || 5,
        status: initialData.status || "offline",
      });
    } else {
      setFormData({
        nome: "",
        embarcacao_id: "",
        interface_wifi: "wlan1",
        rede: "192.168.88.0/24",
        max_usuarios: 50,
        sync_interval_minutes: 5,
        status: "offline",
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && initialData?.id) {
      onSubmit({ ...formData, id: initialData.id });
    } else {
      onSubmit(formData as HotspotInsert);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Hotspot" : "Novo Hotspot"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as configurações do hotspot."
              : "Configure um novo hotspot MikroTik."}
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
                placeholder="Hotspot Principal"
                required
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
              <Label htmlFor="interface_wifi" className="text-right">
                Interface WiFi
              </Label>
              <Select
                value={formData.interface_wifi}
                onValueChange={(value) => handleChange("interface_wifi", value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wlan1">wlan1</SelectItem>
                  <SelectItem value="wlan2">wlan2</SelectItem>
                  <SelectItem value="wlan3">wlan3</SelectItem>
                  <SelectItem value="bridge1">bridge1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rede" className="text-right">
                Rede
              </Label>
              <Input
                id="rede"
                value={formData.rede}
                onChange={(e) => handleChange("rede", e.target.value)}
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
                value={formData.max_usuarios}
                onChange={(e) => handleChange("max_usuarios", parseInt(e.target.value) || 50)}
                className="col-span-3"
                min={1}
                max={500}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sync_interval" className="text-right">
                Sync (min)
              </Label>
              <Input
                id="sync_interval"
                type="number"
                value={formData.sync_interval_minutes}
                onChange={(e) => handleChange("sync_interval_minutes", parseInt(e.target.value) || 5)}
                className="col-span-3"
                min={1}
                max={60}
              />
            </div>

            {isEditing && (
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
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="alerta">Alerta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
