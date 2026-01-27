import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Ship } from "lucide-react";
import { EmbarcacaoBasica } from "@/hooks/useGerenteEmbarcacoes";

interface Props {
  embarcacoes: EmbarcacaoBasica[];
  selectedEmbarcacaoId: string | undefined;
  onEmbarcacaoChange: (id: string) => void;
  periodo: number;
  onPeriodoChange: (dias: number) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isLoading?: boolean;
}

const PERIODOS = [
  { value: 7, label: "7 dias" },
  { value: 15, label: "15 dias" },
  { value: 30, label: "30 dias" },
];

export function EmbarcacaoDashboardFilters({
  embarcacoes,
  selectedEmbarcacaoId,
  onEmbarcacaoChange,
  periodo,
  onPeriodoChange,
  searchTerm,
  onSearchChange,
  isLoading,
}: Props) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4 rounded-lg border bg-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Seletor de Embarcação */}
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select
            value={selectedEmbarcacaoId || ""}
            onValueChange={onEmbarcacaoChange}
            disabled={isLoading || embarcacoes.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Selecione uma embarcação" />
            </SelectTrigger>
            <SelectContent>
              {embarcacoes.map((emb) => (
                <SelectItem key={emb.id} value={emb.id}>
                  {emb.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Botões de Período */}
        <div className="flex items-center gap-1">
          {PERIODOS.map((p) => (
            <Button
              key={p.value}
              variant={periodo === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => onPeriodoChange(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Campo de Busca */}
      <div className="relative w-full md:w-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar tripulante..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 w-full md:w-[220px]"
        />
      </div>
    </div>
  );
}
