import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Ship, User, Edit3 } from "lucide-react";
import {
  useDispositivosRegistrados,
  DispositivoWithTripulante,
  formatMacAddress,
  TIPOS_DISPOSITIVO,
} from "@/hooks/useDispositivosRegistrados";

interface DeviceSelectorFieldProps {
  value: string;
  onChange: (macAddress: string) => void;
  empresaId?: string;
}

export function DeviceSelectorField({
  value,
  onChange,
  empresaId,
}: DeviceSelectorFieldProps) {
  const [manualMode, setManualMode] = useState(false);
  const { data: dispositivos } = useDispositivosRegistrados();

  // Separate devices by category
  const equipamentos = dispositivos?.filter(d => {
    const tipo = TIPOS_DISPOSITIVO.find(t => t.value === d.tipo);
    return tipo?.categoria === 'embarcacao' || (d.embarcacao_id && !d.tripulante_id);
  }) || [];

  const dispositivosTripulantes = dispositivos?.filter(d => {
    const tipo = TIPOS_DISPOSITIVO.find(t => t.value === d.tipo);
    return tipo?.categoria === 'pessoal' || d.tripulante_id;
  }) || [];

  const getDeviceLabel = (device: DispositivoWithTripulante) => {
    const name = device.nome || "Dispositivo";
    const mac = formatMacAddress(device.mac_address);
    if (device.tripulante) {
      return `${name} - ${device.tripulante.nome} (${mac})`;
    }
    return `${name} (${mac})`;
  };

  // Find the selected device to show in the trigger
  const selectedDevice = dispositivos?.find(d => d.mac_address === value);

  return (
    <div className="grid grid-cols-4 items-start gap-4">
      <Label className="text-right pt-2">
        Dispositivo
      </Label>
      <div className="col-span-3 space-y-3">
        {/* Toggle between selector and manual */}
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id="manual-mode"
            checked={manualMode}
            onCheckedChange={setManualMode}
          />
          <Label htmlFor="manual-mode" className="text-sm cursor-pointer flex items-center gap-1">
            <Edit3 className="h-3 w-3" />
            Digitar MAC manualmente
          </Label>
        </div>

        {manualMode ? (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="AA:BB:CC:DD:EE:FF"
            maxLength={17}
          />
        ) : (
          <Select
            value={value || "_none_"}
            onValueChange={(val) => onChange(val === "_none_" ? "" : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um dispositivo (opcional)" />
            </SelectTrigger>
            <SelectContent className="z-50 bg-background border shadow-lg max-h-[300px]">
              <SelectItem value="_none_">
                <span className="text-muted-foreground">Nenhum (todos os dispositivos)</span>
              </SelectItem>
              
              {equipamentos.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-1 text-xs">
                    <Ship className="h-3 w-3" />
                    Equipamentos de Embarcação
                  </SelectLabel>
                  {equipamentos.map((device) => (
                    <SelectItem key={device.id} value={device.mac_address}>
                      <div className="flex items-center gap-2">
                        <Ship className="h-3 w-3 text-muted-foreground" />
                        {getDeviceLabel(device)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {dispositivosTripulantes.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-1 text-xs">
                    <User className="h-3 w-3" />
                    Dispositivos de Tripulantes
                  </SelectLabel>
                  {dispositivosTripulantes.map((device) => (
                    <SelectItem key={device.id} value={device.mac_address}>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {getDeviceLabel(device)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {equipamentos.length === 0 && dispositivosTripulantes.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Nenhum dispositivo cadastrado
                </div>
              )}
            </SelectContent>
          </Select>
        )}

        {selectedDevice && !manualMode && (
          <p className="text-xs text-muted-foreground">
            {selectedDevice.tripulante 
              ? `Dispositivo de ${selectedDevice.tripulante.nome}`
              : "Equipamento de embarcação"
            }
          </p>
        )}
      </div>
    </div>
  );
}
