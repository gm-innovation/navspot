import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LiveMetricsGrid } from '@/components/monitoring/LiveMetricsGrid';
import { LiveConsumptionChart } from '@/components/monitoring/LiveConsumptionChart';
import { ActiveSessionsTable } from '@/components/monitoring/ActiveSessionsTable';
import { HotspotsStatusPanel } from '@/components/monitoring/HotspotsStatusPanel';
import { EventsFeed } from '@/components/monitoring/EventsFeed';
import { useMonitoramentoRealtime } from '@/hooks/useMonitoramentoRealtime';
import { Activity, RefreshCw } from 'lucide-react';

export default function Monitoramento() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Enable realtime subscriptions
  useMonitoramentoRealtime({
    enabled: autoRefresh,
    onSessaoChange: () => setLastUpdate(new Date()),
    onHotspotChange: () => setLastUpdate(new Date()),
    onAlertaChange: () => setLastUpdate(new Date()),
  });

  // Update timestamp every second when auto-refresh is on
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      // Force re-render for time display
    }, 1000);
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Monitoramento em Tempo Real</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Last Update */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} 
              style={{ animationDuration: '3s' }} 
            />
            <span>Última atualização: {formatTime(lastUpdate)}</span>
          </div>

          {/* Auto-refresh Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto-refresh
            </Label>
            {autoRefresh ? (
              <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>
            ) : (
              <Badge variant="secondary">Pausado</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Live Metrics */}
      <LiveMetricsGrid autoRefresh={autoRefresh} />

      {/* Live Consumption Chart */}
      <LiveConsumptionChart autoRefresh={autoRefresh} />

      {/* Active Sessions */}
      <ActiveSessionsTable />

      {/* Bottom Grid: Hotspots and Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HotspotsStatusPanel />
        <EventsFeed />
      </div>
    </div>
  );
}
