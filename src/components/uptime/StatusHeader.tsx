import { Card, CardContent } from '@/components/ui/card';
import { useOverallUptime } from '@/hooks/useUptimeMonitor';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function StatusHeader() {
  const { isLoading, allOnline, lastIncident, onlineCount, totalHotspots } = useOverallUptime();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasPartialIssues = onlineCount > 0 && onlineCount < totalHotspots;
  const allOffline = onlineCount === 0 && totalHotspots > 0;

  const getStatusConfig = () => {
    if (allOffline) {
      return {
        icon: <XCircle className="h-8 w-8 text-destructive" />,
        title: 'Todos os Sistemas Offline',
        subtitle: 'Problemas críticos detectados em todos os hotspots',
        bgClass: 'bg-destructive/10 border-destructive/30',
        textClass: 'text-destructive',
      };
    }
    if (hasPartialIssues) {
      return {
        icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
        title: 'Problemas Parciais Detectados',
        subtitle: `${totalHotspots - onlineCount} de ${totalHotspots} hotspots com problemas`,
        bgClass: 'bg-yellow-500/10 border-yellow-500/30',
        textClass: 'text-yellow-600',
      };
    }
    return {
      icon: <CheckCircle2 className="h-8 w-8 text-green-500" />,
      title: 'Todos os Sistemas Operacionais',
      subtitle: lastIncident
        ? `Última interrupção detectada ${formatDistanceToNow(lastIncident, { 
            locale: ptBR, 
            addSuffix: true 
          })}`
        : 'Nenhuma interrupção registrada recentemente',
      bgClass: 'bg-green-500/10 border-green-500/30',
      textClass: 'text-green-600',
    };
  };

  const config = getStatusConfig();

  return (
    <Card className={`border ${config.bgClass}`}>
      <CardContent className="py-6">
        <div className="flex items-center gap-4">
          {config.icon}
          <div>
            <h2 className={`text-xl font-semibold ${config.textClass}`}>
              {config.title}
            </h2>
            <p className="text-muted-foreground text-sm">
              {config.subtitle}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
