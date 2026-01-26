import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useConsumoAoVivo, formatBytesPerSecond } from '@/hooks/useMonitoramento';

interface LiveConsumptionChartProps {
  autoRefresh: boolean;
}

export function LiveConsumptionChart({ autoRefresh }: LiveConsumptionChartProps) {
  const snapshots = useConsumoAoVivo(autoRefresh);

  const chartData = snapshots.map((s, index) => ({
    time: index,
    download: s.bytes_download,
    upload: s.bytes_upload,
  }));

  // Fill with zeros if we don't have enough data
  while (chartData.length < 60) {
    chartData.unshift({
      time: -chartData.length,
      download: 0,
      upload: 0,
    });
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-2 shadow-lg">
          <p className="text-sm">
            <span className="text-blue-500">↓ Download:</span>{' '}
            {formatBytesPerSecond(payload[0]?.value || 0)}
          </p>
          <p className="text-sm">
            <span className="text-green-500">↑ Upload:</span>{' '}
            {formatBytesPerSecond(payload[1]?.value || 0)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {autoRefresh && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${autoRefresh ? 'bg-primary' : 'bg-muted'}`}></span>
          </span>
          Consumo em Tempo Real
          <span className="text-sm font-normal text-muted-foreground">
            (últimos 60 segundos)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="time" 
                tick={false}
                axisLine={false}
              />
              <YAxis 
                tickFormatter={(value) => formatBytesPerSecond(value).replace('/s', '')}
                tick={{ fontSize: 10 }}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value) => value === 'download' ? 'Download' : 'Upload'}
              />
              <Area
                type="monotone"
                dataKey="download"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorDownload)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="upload"
                stroke="hsl(142 76% 36%)"
                fillOpacity={1}
                fill="url(#colorUpload)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
