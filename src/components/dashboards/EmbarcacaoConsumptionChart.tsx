import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Download, Upload } from "lucide-react";
import { ConsumoHistorico } from "@/hooks/useEmbarcacaoDashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  data: ConsumoHistorico[] | undefined;
  isLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const chartConfig: ChartConfig = {
  download: {
    label: "Download",
    color: "hsl(var(--chart-1))",
  },
  upload: {
    label: "Upload",
    color: "hsl(var(--chart-2))",
  },
};

export function EmbarcacaoConsumptionChart({ data, isLoading }: Props) {
  const chartData = data?.map(d => ({
    ...d,
    dataFormatada: format(parseISO(d.data), "dd/MM", { locale: ptBR }),
  })) || [];

  const totalDownload = data?.reduce((acc, d) => acc + d.download, 0) || 0;
  const totalUpload = data?.reduce((acc, d) => acc + d.upload, 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Consumo - Últimos 7 Dias
          </div>
          <div className="flex items-center gap-3 text-sm font-normal">
            <div className="flex items-center gap-1">
              <Download className="h-3.5 w-3.5 text-[hsl(var(--chart-1))]" />
              <span className="text-muted-foreground">{formatBytes(totalDownload)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Upload className="h-3.5 w-3.5 text-[hsl(var(--chart-2))]" />
              <span className="text-muted-foreground">{formatBytes(totalUpload)}</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillUpload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="dataFormatada" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tickFormatter={(value) => formatBytes(value)}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>{formatBytes(value as number)}</span>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="download"
                stroke="hsl(var(--chart-1))"
                fill="url(#fillDownload)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="upload"
                stroke="hsl(var(--chart-2))"
                fill="url(#fillUpload)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <Activity className="h-8 w-8 opacity-50 mr-2" />
            Sem dados de consumo
          </div>
        )}
      </CardContent>
    </Card>
  );
}
