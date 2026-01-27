export const TIPOS_EMBARCACAO = [
  { value: "psv", label: "PSV (Platform Supply Vessel)" },
  { value: "ahts", label: "AHTS (Anchor Handling Tug Supply)" },
  { value: "plsv", label: "PLSV (Pipe Laying Support Vessel)" },
  { value: "osrv", label: "OSRV (Oil Spill Response Vessel)" },
  { value: "dsv", label: "DSV (Diving Support Vessel)" },
  { value: "rsv", label: "RSV (ROV Support Vessel)" },
  { value: "fpso", label: "FPSO" },
  { value: "fso", label: "FSO" },
  { value: "drill_ship", label: "Drill Ship" },
  { value: "sonda", label: "Sonda / Plataforma" },
  { value: "jack_up", label: "Jack-up" },
  { value: "semi_submersivel", label: "Semi-submersível" },
  { value: "rebocador_offshore", label: "Rebocador Offshore" },
  { value: "flotel", label: "Flotel" },
  { value: "outro", label: "Outro" },
] as const;

export type TipoEmbarcacao = typeof TIPOS_EMBARCACAO[number]['value'];

export function getTipoEmbarcacaoLabel(tipo: string): string {
  const found = TIPOS_EMBARCACAO.find(t => t.value === tipo);
  if (found) return found.label;
  // Fallback para tipos legados
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
