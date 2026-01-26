import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEventosFeed, formatTimeAgo, EventoFeed } from '@/hooks/useMonitoramento';
import { Activity, AlertTriangle, LogIn, LogOut, Server } from 'lucide-react';
import { useEffect, useState } from 'react';

function EventRow({ evento }: { evento: EventoFeed }) {
  const [timeAgo, setTimeAgo] = useState(formatTimeAgo(evento.timestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(evento.timestamp));
    }, 1000);
    return () => clearInterval(interval);
  }, [evento.timestamp]);

  const getIcon = () => {
    switch (evento.tipo) {
      case 'sessao_iniciada':
        return <LogIn className="h-4 w-4 text-green-500" />;
      case 'sessao_encerrada':
        return <LogOut className="h-4 w-4 text-muted-foreground" />;
      case 'alerta':
        return <AlertTriangle className={`h-4 w-4 ${
          evento.severidade === 'critico' ? 'text-destructive' :
          evento.severidade === 'aviso' ? 'text-yellow-500' :
          'text-blue-500'
        }`} />;
      case 'hotspot_status':
        return <Server className="h-4 w-4 text-primary" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getBadge = () => {
    switch (evento.tipo) {
      case 'sessao_iniciada':
        return <Badge className="bg-green-500 hover:bg-green-600 text-xs">Entrada</Badge>;
      case 'sessao_encerrada':
        return <Badge variant="secondary" className="text-xs">Saída</Badge>;
      case 'alerta':
        if (evento.severidade === 'critico') {
          return <Badge variant="destructive" className="text-xs">Crítico</Badge>;
        }
        if (evento.severidade === 'aviso') {
          return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-xs">Aviso</Badge>;
        }
        return <Badge variant="outline" className="text-xs">Info</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Status</Badge>;
    }
  };

  return (
    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{evento.mensagem}</p>
        <p className="text-xs text-muted-foreground">{timeAgo}</p>
      </div>
      {getBadge()}
    </div>
  );
}

export function EventsFeed() {
  const { data: eventos, isLoading } = useEventosFeed();

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Eventos Recentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : eventos && eventos.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {eventos.map((evento) => (
                <EventRow key={evento.id} evento={evento} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum evento recente</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
