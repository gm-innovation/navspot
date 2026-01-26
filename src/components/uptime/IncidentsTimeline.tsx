import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useIncidentsTimeline, Incident } from '@/hooks/useUptimeMonitor';
import { AlertTriangle, Clock, Server, CheckCircle2 } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface IncidentGroupProps {
  date: string;
  incidents: Incident[];
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'menos de 1 minuto';
  if (minutes < 60) return `${Math.round(minutes)} minutos`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
  return `${hours}h ${mins}min`;
}

function IncidentGroup({ date, incidents }: IncidentGroupProps) {
  const totalDuration = incidents.reduce((sum, i) => sum + i.duration_minutes, 0);
  const parsedDate = parseISO(date);
  
  return (
    <div className="border-l-2 border-destructive/50 pl-4 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs">
          {format(parsedDate, "d 'de' MMMM, yyyy", { locale: ptBR })}
        </Badge>
      </div>
      
      <div className="space-y-3">
        {incidents.map((incident) => (
          <div 
            key={incident.id} 
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <AlertTriangle className={`h-5 w-5 mt-0.5 ${
              incident.status === 'offline' ? 'text-destructive' : 'text-yellow-500'
            }`} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{incident.hotspot_nome}</span>
                <span className="text-sm text-muted-foreground">
                  ({incident.embarcacao_nome})
                </span>
              </div>
              
              <p className="text-sm text-muted-foreground mt-1">
                Ficou {incident.status === 'offline' ? 'offline' : 'em alerta'} por{' '}
                <span className="font-medium">{formatDuration(incident.duration_minutes)}</span>
              </p>
              
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {format(incident.started_at, "HH:mm", { locale: ptBR })}
                  {incident.ended_at && (
                    <> - {format(incident.ended_at, "HH:mm", { locale: ptBR })}</>
                  )}
                </span>
                {!incident.ended_at && (
                  <Badge variant="destructive" className="text-xs">
                    Em andamento
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
        <span>
          {incidents.length === 1 
            ? 'Houve apenas uma interrupção neste dia.' 
            : `Houve ${incidents.length} interrupções neste dia.`}
        </span>
        <span>•</span>
        <span>Tempo total offline: {formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
}

export function IncidentsTimeline({ days = 7 }: { days?: number }) {
  const { data, isLoading } = useIncidentsTimeline(days);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Atualizações de Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const dateEntries = Object.entries(data?.groupedByDate || {}).sort(
    ([a], [b]) => b.localeCompare(a)
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Atualizações de Status</span>
          <span className="text-sm font-normal text-muted-foreground">
            Últimos {days} dias
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dateEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
            <h3 className="font-medium text-lg">Nenhum incidente</h3>
            <p className="text-muted-foreground text-sm">
              Todos os sistemas estiveram operacionais nos últimos {days} dias.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateEntries.map(([date, incidents]) => (
              <IncidentGroup key={date} date={date} incidents={incidents} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
