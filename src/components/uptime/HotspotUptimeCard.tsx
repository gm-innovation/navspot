import { Badge } from '@/components/ui/badge';
import { UptimeBar } from './UptimeBar';
import { UptimeData } from '@/hooks/useUptimeMonitor';
import { Server, Ship } from 'lucide-react';

interface HotspotUptimeCardProps {
  hotspot: UptimeData;
}

function getStatusBadge(status: 'online' | 'offline' | 'alert') {
  switch (status) {
    case 'online':
      return <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
    case 'offline':
      return <Badge variant="destructive">Offline</Badge>;
    default:
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Alerta</Badge>;
  }
}

function getStatusIndicator(status: 'online' | 'offline' | 'alert') {
  switch (status) {
    case 'online':
      return (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
        </span>
      );
    case 'offline':
      return <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>;
    default:
      return (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
        </span>
      );
  }
}

export function HotspotUptimeCard({ hotspot }: HotspotUptimeCardProps) {
  return (
    <div className="p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIndicator(hotspot.status_atual)}
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{hotspot.hotspot_nome}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Ship className="h-3 w-3" />
              <span>{hotspot.embarcacao_nome}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold text-green-600">
              {hotspot.uptime_90d.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">últimos 90 dias</div>
          </div>
          {getStatusBadge(hotspot.status_atual)}
        </div>
      </div>
      <UptimeBar days={hotspot.daily_status} height={24} />
    </div>
  );
}
