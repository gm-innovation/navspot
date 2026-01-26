import { Bell, AlertTriangle, AlertCircle, Info, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications, getSeverityColor, NotificationAlerta } from "@/hooks/useNotifications";
import { useResolveAlerta } from "@/hooks/useAlertas";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function getSeverityIcon(severidade: string) {
  switch (severidade) {
    case 'critical':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case 'info':
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function NotificationItem({ 
  notification, 
  onResolve 
}: { 
  notification: NotificationAlerta; 
  onResolve: (id: string) => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const location = notification.hotspots?.nome || 
    notification.embarcacoes?.nome || 
    notification.empresas?.nome || 
    'Sistema';

  return (
    <DropdownMenuItem className="flex items-start gap-3 p-3 cursor-default focus:bg-muted/50">
      <div className="mt-0.5">
        {getSeverityIcon(notification.severidade)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-clamp-2">
          {notification.mensagem}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{location}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onResolve(notification.id);
        }}
        title="Marcar como resolvido"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
    </DropdownMenuItem>
  );
}

export function NotificationsDropdown() {
  const { data, isLoading } = useNotifications(5);
  const resolveAlerta = useResolveAlerta();

  const unreadCount = data?.unreadCount || 0;
  const notifications = data?.notifications || [];
  const hasCritical = notifications.some(n => n.severidade === 'critical');

  const handleResolve = (id: string) => {
    resolveAlerta.mutate(id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs",
                hasCritical && "animate-pulse"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-hidden">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} não lido{unreadCount > 1 ? 's' : ''}
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação pendente
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onResolve={handleResolve}
              />
            ))
          )}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to="/alertas" className="flex items-center justify-center gap-2 py-2">
            <span className="text-sm">Ver todos os alertas</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
