
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "ativo" | "inativo" | "alerta" | "manutencao";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variants = {
    ativo: "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400",
    inativo: "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400",
    alerta: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400",
    manutencao: "bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-900/20 dark:text-gray-400"
  };

  const labels = {
    ativo: "Ativo",
    inativo: "Inativo",
    alerta: "Alerta",
    manutencao: "Manutenção"
  };

  return (
    <Badge 
      variant="secondary" 
      className={cn(variants[status], className)}
    >
      {labels[status]}
    </Badge>
  );
}
