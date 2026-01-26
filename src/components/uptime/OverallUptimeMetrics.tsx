import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOverallUptime } from '@/hooks/useUptimeMonitor';
import { Clock, Activity, Server, TrendingUp } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
  const getColorClass = (uptime: number) => {
    if (uptime >= 99.9) return 'text-green-600';
    if (uptime >= 99) return 'text-green-500';
    if (uptime >= 95) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className={`text-2xl font-bold ${getColorClass(value)}`}>
            {value.toFixed(3)}%
          </span>
        </div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

export function OverallUptimeMetrics() {
  const { 
    isLoading, 
    uptime_24h, 
    uptime_7d, 
    uptime_30d, 
    uptime_90d,
    totalHotspots,
    onlineCount,
  } = useOverallUptime();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tempo de Atividade Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Tempo de Atividade Geral</span>
          <span className="text-sm font-normal text-muted-foreground">
            {onlineCount}/{totalHotspots} hotspots online
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Últimas 24 Horas"
            value={uptime_24h}
            subtitle="Uptime recente"
            icon={<Clock className="h-5 w-5" />}
          />
          <MetricCard
            title="Últimos 7 Dias"
            value={uptime_7d}
            subtitle="Semana atual"
            icon={<Activity className="h-5 w-5" />}
          />
          <MetricCard
            title="Últimos 30 Dias"
            value={uptime_30d}
            subtitle="Mês atual"
            icon={<Server className="h-5 w-5" />}
          />
          <MetricCard
            title="Últimos 90 Dias"
            value={uptime_90d}
            subtitle="Trimestre"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}
