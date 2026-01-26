import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/utils/exportUtils";
import type { TopConsumidor } from "@/hooks/useRelatorios";

interface TopConsumidoresChartProps {
  data: TopConsumidor[];
  title?: string;
  description?: string;
  isLoading?: boolean;
}

export function TopConsumidoresChart({ 
  data, 
  title = "Top Consumidores",
  description = "Maiores consumidores de dados",
  isLoading 
}: TopConsumidoresChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Carregando...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    nome: item.nome.length > 20 ? item.nome.substring(0, 20) + '...' : item.nome,
    fullNome: item.nome,
    bytes: item.bytes_consumidos,
    tipo: item.tipo,
    cargo: item.cargo,
    embarcacao: item.embarcacao_nome,
  }));

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum consumo registrado no período
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <XAxis 
                  type="number"
                  tickFormatter={(value) => formatBytes(value)}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  type="category"
                  dataKey="nome"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  width={80}
                />
                <Tooltip 
                  formatter={(value: number) => [formatBytes(value), 'Consumo']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      const data = payload[0].payload;
                      return (
                        `${data.fullNome}${data.cargo ? ` (${data.cargo})` : ''}${data.embarcacao ? ` - ${data.embarcacao}` : ''}`
                      );
                    }
                    return label;
                  }}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="bytes" 
                  radius={[0, 4, 4, 0]}
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.tipo === 'tripulante' ? 'hsl(var(--primary))' : 'hsl(210 40% 60%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
