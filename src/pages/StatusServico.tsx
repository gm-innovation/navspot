import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusHeader } from '@/components/uptime/StatusHeader';
import { HotspotUptimeCard } from '@/components/uptime/HotspotUptimeCard';
import { OverallUptimeMetrics } from '@/components/uptime/OverallUptimeMetrics';
import { IncidentsTimeline } from '@/components/uptime/IncidentsTimeline';
import { useHotspotsUptime } from '@/hooks/useUptimeMonitor';
import { RefreshCw, Server, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function StatusServico() {
  const { data: hotspotsUptime, isLoading, refetch, isFetching } = useHotspotsUptime();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [timelineDays, setTimelineDays] = useState(7);

  useEffect(() => {
    if (!isFetching) {
      setLastUpdate(new Date());
    }
  }, [isFetching]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Status do Serviço</h1>
          <p className="text-muted-foreground">
            Monitoramento de disponibilidade dos hotspots
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Última atualização: {format(lastUpdate, "HH:mm:ss", { locale: ptBR })}
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Status Header */}
      <StatusHeader />

      {/* Uptime por Hotspot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Tempo de Atividade - Últimos 90 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : hotspotsUptime && hotspotsUptime.length > 0 ? (
            <div className="space-y-4">
              {hotspotsUptime.map((hotspot) => (
                <HotspotUptimeCard key={hotspot.hotspot_id} hotspot={hotspot} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum hotspot configurado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overall Metrics */}
      <OverallUptimeMetrics />

      {/* Incidents Timeline */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant={timelineDays === 7 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimelineDays(7)}
          >
            7 dias
          </Button>
          <Button
            variant={timelineDays === 30 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimelineDays(30)}
          >
            30 dias
          </Button>
          <Button
            variant={timelineDays === 90 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimelineDays(90)}
          >
            90 dias
          </Button>
        </div>
        <IncidentsTimeline days={timelineDays} />
      </div>
    </div>
  );
}
