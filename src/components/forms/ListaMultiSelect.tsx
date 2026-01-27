import { useState } from "react";
import { Check, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Lista {
  id: string;
  nome: string;
  tipo: string;
  descricao?: string | null;
}

interface ListaMultiSelectProps {
  listas: Lista[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ListaMultiSelect({
  listas,
  selectedIds,
  onSelectionChange,
  disabled = false,
  placeholder = "Selecione uma ou mais listas",
}: ListaMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [whitelistOpen, setWhitelistOpen] = useState(true);
  const [blacklistOpen, setBlacklistOpen] = useState(true);

  const whitelists = listas.filter((l) => l.tipo === "whitelist");
  const blacklists = listas.filter((l) => l.tipo === "blacklist");

  const selectedListas = listas.filter((l) => selectedIds.includes(l.id));
  const hasWhitelist = selectedListas.some((l) => l.tipo === "whitelist");
  const hasBlacklist = selectedListas.some((l) => l.tipo === "blacklist");
  const hasMixedTypes = hasWhitelist && hasBlacklist;

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const getDisplayText = () => {
    if (selectedIds.length === 0) return placeholder;
    if (selectedIds.length === 1) {
      const lista = listas.find((l) => l.id === selectedIds[0]);
      return lista?.nome || placeholder;
    }
    return `${selectedIds.length} listas selecionadas`;
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{getDisplayText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-50" align="start">
          <ScrollArea className="max-h-[300px]">
            <div className="p-2">
              {/* Whitelists */}
              {whitelists.length > 0 && (
                <Collapsible open={whitelistOpen} onOpenChange={setWhitelistOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 font-medium text-green-700 dark:text-green-400"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          !whitelistOpen && "-rotate-90"
                        )}
                      />
                      <span>Whitelists (permitir acesso)</span>
                      <Badge variant="outline" className="ml-auto text-xs">
                        {whitelists.length}
                      </Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 space-y-1 mt-1">
                    {whitelists.map((lista) => (
                      <div
                        key={lista.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                          selectedIds.includes(lista.id) && "bg-accent"
                        )}
                        onClick={() => toggleSelection(lista.id)}
                      >
                        <Checkbox
                          checked={selectedIds.includes(lista.id)}
                          onCheckedChange={() => toggleSelection(lista.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <Label className="font-normal cursor-pointer text-sm">
                            {lista.nome}
                          </Label>
                          {lista.descricao && (
                            <p className="text-xs text-muted-foreground truncate">
                              {lista.descricao}
                            </p>
                          )}
                        </div>
                        {selectedIds.includes(lista.id) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Blacklists */}
              {blacklists.length > 0 && (
                <Collapsible
                  open={blacklistOpen}
                  onOpenChange={setBlacklistOpen}
                  className="mt-2"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 font-medium text-red-700 dark:text-red-400"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          !blacklistOpen && "-rotate-90"
                        )}
                      />
                      <span>Blacklists (bloquear acesso)</span>
                      <Badge variant="outline" className="ml-auto text-xs">
                        {blacklists.length}
                      </Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 space-y-1 mt-1">
                    {blacklists.map((lista) => (
                      <div
                        key={lista.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent",
                          selectedIds.includes(lista.id) && "bg-accent"
                        )}
                        onClick={() => toggleSelection(lista.id)}
                      >
                        <Checkbox
                          checked={selectedIds.includes(lista.id)}
                          onCheckedChange={() => toggleSelection(lista.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <Label className="font-normal cursor-pointer text-sm">
                            {lista.nome}
                          </Label>
                          {lista.descricao && (
                            <p className="text-xs text-muted-foreground truncate">
                              {lista.descricao}
                            </p>
                          )}
                        </div>
                        {selectedIds.includes(lista.id) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {listas.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Nenhuma lista disponível
                </p>
              )}
            </div>
          </ScrollArea>

          {selectedIds.length > 0 && (
            <div className="border-t p-2 bg-muted/50">
              <p className="text-xs text-muted-foreground text-center">
                {selectedIds.length} lista(s) selecionada(s)
                {selectedIds.length > 1 && (
                  <span className="font-medium">
                    {" "}
                    → {selectedIds.length} regras serão criadas
                  </span>
                )}
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected badges */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedListas.map((lista) => (
            <Badge
              key={lista.id}
              variant="secondary"
              className={cn(
                "text-xs",
                lista.tipo === "whitelist"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
              )}
            >
              {lista.nome}
              <button
                type="button"
                className="ml-1 hover:text-foreground"
                onClick={() => toggleSelection(lista.id)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Mixed types warning */}
      {hasMixedTypes && (
        <Alert variant="default" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Atenção:</strong> Você selecionou listas de tipos diferentes.
            Whitelists permitem APENAS os domínios listados, blacklists bloqueiam
            os domínios listados. A prioridade definirá qual regra é aplicada primeiro.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
