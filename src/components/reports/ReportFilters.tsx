import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { getDateRangePreset } from "@/utils/exportUtils";

export interface FilterValues {
  periodo: string;
  dataInicio: Date;
  dataFim: Date;
  empresaId?: string;
  embarcacaoId?: string;
  agruparPor: 'dia' | 'semana' | 'mes';
}

interface ReportFiltersProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
}

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
  { value: '90dias', label: 'Últimos 90 dias' },
  { value: 'personalizado', label: 'Personalizado' },
];

const AGRUPAMENTOS = [
  { value: 'dia', label: 'Por dia' },
  { value: 'semana', label: 'Por semana' },
  { value: 'mes', label: 'Por mês' },
];

export function ReportFilters({ filters, onFiltersChange }: ReportFiltersProps) {
  const { user } = useAuth();
  const { data: empresas = [] } = useEmpresas();
  const { data: embarcacoes = [] } = useEmbarcacoes();
  const [showCustomDates, setShowCustomDates] = useState(filters.periodo === 'personalizado');

  const handlePeriodoChange = (periodo: string) => {
    if (periodo === 'personalizado') {
      setShowCustomDates(true);
      onFiltersChange({ ...filters, periodo });
    } else {
      setShowCustomDates(false);
      const { start, end } = getDateRangePreset(periodo);
      onFiltersChange({ 
        ...filters, 
        periodo,
        dataInicio: start,
        dataFim: end,
      });
    }
  };

  const handleEmpresaChange = (empresaId: string) => {
    onFiltersChange({ 
      ...filters, 
      empresaId: empresaId === 'todas' ? undefined : empresaId,
      embarcacaoId: undefined, // Reset embarcação when empresa changes
    });
  };

  const handleEmbarcacaoChange = (embarcacaoId: string) => {
    onFiltersChange({ 
      ...filters, 
      embarcacaoId: embarcacaoId === 'todas' ? undefined : embarcacaoId,
    });
  };

  const filteredEmbarcacoes = filters.empresaId 
    ? embarcacoes.filter(e => e.empresa_id === filters.empresaId)
    : embarcacoes;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-lg">
      {/* Período */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Período:</span>
        <Select value={filters.periodo} onValueChange={handlePeriodoChange}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Datas personalizadas */}
      {showCustomDates && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal bg-background")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(filters.dataInicio, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dataInicio}
                onSelect={(date) => date && onFiltersChange({ ...filters, dataInicio: date })}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal bg-background")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(filters.dataFim, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dataFim}
                onSelect={(date) => date && onFiltersChange({ ...filters, dataFim: date })}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </>
      )}

      {/* Agrupamento */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Agrupar:</span>
        <Select 
          value={filters.agruparPor} 
          onValueChange={(v) => onFiltersChange({ ...filters, agruparPor: v as 'dia' | 'semana' | 'mes' })}
        >
          <SelectTrigger className="w-[120px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGRUPAMENTOS.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empresa (apenas Super Admin) */}
      {user?.role === 'super_admin' && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Empresa:</span>
          <Select value={filters.empresaId || 'todas'} onValueChange={handleEmpresaChange}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {empresas.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Embarcação (Super Admin e Empresa Admin) */}
      {(user?.role === 'super_admin' || user?.role === 'empresa_admin') && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Embarcação:</span>
          <Select value={filters.embarcacaoId || 'todas'} onValueChange={handleEmbarcacaoChange}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as embarcações</SelectItem>
              {filteredEmbarcacoes.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
