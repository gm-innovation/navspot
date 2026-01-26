import { Badge } from "@/components/ui/badge";
import { Clock, Check, AlertTriangle, Loader2 } from "lucide-react";

interface ActionStatusBadgeProps {
  status: "pendente" | "executado" | "erro";
  showIcon?: boolean;
}

export function ActionStatusBadge({ status, showIcon = true }: ActionStatusBadgeProps) {
  const statusConfig = {
    pendente: {
      label: "Pendente",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    executado: {
      label: "Executado",
      className: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      icon: <Check className="h-3 w-3" />,
    },
    erro: {
      label: "Erro",
      className: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant="secondary" className={`${config.className} gap-1`}>
      {showIcon && config.icon}
      {config.label}
    </Badge>
  );
}
