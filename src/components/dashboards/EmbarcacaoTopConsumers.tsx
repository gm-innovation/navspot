import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, User } from "lucide-react";
import { TopConsumidor } from "@/hooks/useEmbarcacaoDashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";

interface Props {
  data: TopConsumidor[] | undefined;
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
  bytes_consumidos: {
    label: "Consumo",
    color: "hsl(var(--chart-1))",
  },
};

const colors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function EmbarcacaoTopConsumers({ data, isLoading }: Props) {
  const chartData = data?.map((d, idx) => ({
    nome: d.nome.split(' ')[0], // First name only for chart
    nomeCompleto: d.nome,
    cargo: d.cargo,
    bytes_consumidos: d.bytes_consumidos,
    consumoFormatado: formatBytes(d.bytes_consumidos),
    fill: colors[idx % colors.length],
  })) || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5" />
          Top Consumidores de Dados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart 
              data={chartData} 
              layout="vertical" 
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <XAxis 
                type="number" 
                tickFormatter={(value) => formatBytes(value)}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                type="category" 
                dataKey="nome" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, props) => (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{props.payload?.nomeCompleto}</span>
                        <span className="text-xs text-muted-foreground">{props.payload?.cargo || 'Tripulante'}</span>
                        <span>{formatBytes(value as number)}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="bytes_consumidos" radius={4}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <User className="h-8 w-8 opacity-50 mr-2" />
            Sem dados de consumo
          </div>
        )}
      </CardContent>
    </Card>
  );
}
