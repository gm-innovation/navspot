import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";

interface TopDuracao {
  id: string;
  nome: string;
  cargo: string | null;
  duracao_segundos: number;
}

interface Props {
  data: TopDuracao[] | undefined;
  isLoading: boolean;
  periodoDias?: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return `${hours}h`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

const chartConfig: ChartConfig = {
  duracao_segundos: {
    label: "Tempo de Uso",
    color: "hsl(var(--chart-3))",
  },
};

const colors = [
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
];

export function EmbarcacaoTopDuration({ data, isLoading, periodoDias = 7 }: Props) {
  const chartData = data?.map((d, idx) => ({
    nome: d.nome.split(' ')[0], // First name only for chart
    nomeCompleto: d.nome,
    cargo: d.cargo,
    duracao_segundos: d.duracao_segundos,
    duracaoFormatada: formatDuration(d.duracao_segundos),
    fill: colors[idx % colors.length],
  })) || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-5 w-5" />
          Maior Tempo de Uso ({periodoDias} dias)
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
                tickFormatter={(value) => formatDurationShort(value)}
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
                        <span>{formatDuration(value as number)}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="duracao_segundos" radius={4}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <User className="h-8 w-8 opacity-50 mr-2" />
            Sem dados de uso
          </div>
        )}
      </CardContent>
    </Card>
  );
}
