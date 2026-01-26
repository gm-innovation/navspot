import { Card, CardContent } from '@/components/ui/card';
import { Activity, Wifi, Server, Gauge } from 'lucide-react';
import { useLiveMetrics, formatBytes, formatBytesPerSecond, useConsumoAoVivo } from '@/hooks/useMonitoramento';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  className?: string;
  updated?: boolean;
}

function MetricCard({ title, value, subtitle, icon, className, updated }: MetricCardProps) {
  const [pulse, setPulse] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      setPulse(true);
      const timeout = setTimeout(() => setPulse(false), 500);
      prevValue.current = value;
      return () => clearTimeout(timeout);
    }
  }, [value]);

  return (
    <Card className={cn(
      'transition-all duration-300',
      pulse && 'ring-2 ring-primary/50',
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn(
              'text-2xl font-bold transition-all duration-300',
              pulse && 'text-primary'
            )}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            'p-3 rounded-full bg-primary/10 transition-all duration-300',
            pulse && 'bg-primary/20 scale-110'
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface LiveMetricsGridProps {
  autoRefresh: boolean;
}

export function LiveMetricsGrid({ autoRefresh }: LiveMetricsGridProps) {
  const { totalSessoes, totalConsumo, hotspotsOnline, totalHotspots } = useLiveMetrics();
  const snapshots = useConsumoAoVivo(autoRefresh);

  // Calculate current bandwidth from last few snapshots
  const recentSnapshots = snapshots.slice(-5);
  const avgBandwidth = recentSnapshots.length > 0
    ? recentSnapshots.reduce((acc, s) => acc + s.bytes_download + s.bytes_upload, 0) / recentSnapshots.length
    : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Sessões Ativas"
        value={totalSessoes}
        subtitle="Conexões WiFi em uso"
        icon={<Activity className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Consumo Total"
        value={formatBytes(totalConsumo)}
        subtitle="Dados transferidos"
        icon={<Wifi className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Hotspots Online"
        value={`${hotspotsOnline}/${totalHotspots}`}
        subtitle="Roteadores ativos"
        icon={<Server className="h-5 w-5 text-primary" />}
      />
      <MetricCard
        title="Banda Atual"
        value={formatBytesPerSecond(avgBandwidth)}
        subtitle="Velocidade média"
        icon={<Gauge className="h-5 w-5 text-primary" />}
      />
    </div>
  );
}
