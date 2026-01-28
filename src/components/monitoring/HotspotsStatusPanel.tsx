import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHotspotsStatus, formatTimeAgo, HotspotStatus } from '@/hooks/useMonitoramento';
import { Server, Users, History } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getHotspotRealStatus } from '@/utils/hotspotStatus';

interface HotspotRowProps {
  hotspot: HotspotStatus;
  realStatus: 'online' | 'offline' | 'alerta';
}

function HotspotRow({ hotspot, realStatus }: HotspotRowProps) {
  const [timeAgo, setTimeAgo] = useState(formatTimeAgo(hotspot.ultima_sincronizacao));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(hotspot.ultima_sincronizacao));
    }, 1000);
    return () => clearInterval(interval);
  }, [hotspot.ultima_sincronizacao]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500 hover:bg-green-600">Online</Badge>;
      case 'offline':
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">Alerta</Badge>;
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        );
      case 'offline':
        return <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>;
      default:
        return (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
        );
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="flex items-center gap-3">
        {getStatusIndicator(realStatus)}
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{hotspot.nome}</span>
          </div>
          <p className="text-xs text-muted-foreground">{hotspot.embarcacao_nome}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="flex items-center gap-1 text-sm">
            <Users className="h-3 w-3" />
            <span>{hotspot.sessoes_ativas}</span>
          </div>
          <p className="text-xs text-muted-foreground">Sync: {timeAgo}</p>
        </div>
        {getStatusBadge(realStatus)}
      </div>
    </div>
  );
}

export function HotspotsStatusPanel() {
  const { data: hotspots, isLoading } = useHotspotsStatus();

  // Calculate real status for each hotspot
  const hotspotsWithRealStatus = useMemo(() => {
    if (!hotspots) return [];
    return hotspots.map(h => ({
      ...h,
      realStatus: getHotspotRealStatus({
        status: h.status,
        ultima_sincronizacao: h.ultima_sincronizacao,
        sync_interval_minutes: h.sync_interval_minutes || 5,
      }),
    }));
  }, [hotspots]);

  const onlineCount = hotspotsWithRealStatus.filter(h => h.realStatus === 'online').length;
  const offlineCount = hotspotsWithRealStatus.filter(h => h.realStatus === 'offline').length;
  const alertaCount = hotspotsWithRealStatus.filter(h => h.realStatus === 'alerta').length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Status dos Hotspots</span>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500">{onlineCount} online</Badge>
            {alertaCount > 0 && (
              <Badge className="bg-yellow-500">{alertaCount} alerta</Badge>
            )}
            {offlineCount > 0 && (
              <Badge variant="destructive">{offlineCount} offline</Badge>
            )}
            <Button variant="ghost" size="sm" asChild className="h-7 px-2">
              <Link to="/status-servico" className="flex items-center gap-1">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Histórico</span>
              </Link>
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : hotspotsWithRealStatus && hotspotsWithRealStatus.length > 0 ? (
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {hotspotsWithRealStatus.map((hotspot) => (
              <HotspotRow key={hotspot.id} hotspot={hotspot} realStatus={hotspot.realStatus} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum hotspot configurado</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
