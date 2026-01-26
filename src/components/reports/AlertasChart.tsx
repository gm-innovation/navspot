import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertaData } from "@/hooks/useRelatorios";

interface AlertasChartProps {
  data: AlertaData[];
  title?: string;
  description?: string;
  isLoading?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critico: 'hsl(0 84% 60%)',
  aviso: 'hsl(38 92% 50%)',
  info: 'hsl(217 91% 60%)',
};

const SEVERITY_LABELS: Record<string, string> = {
  critico: 'Crítico',
  aviso: 'Aviso',
  info: 'Informativo',
};

export function AlertasChart({ 
  data, 
  title = "Distribuição de Alertas",
  description = "Alertas por severidade",
  isLoading 
}: AlertasChartProps) {
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

  // Aggregate by severity
  const aggregated = data.reduce((acc, item) => {
    const existing = acc.find(a => a.severidade === item.severidade);
    if (existing) {
      existing.total += item.total;
    } else {
      acc.push({ severidade: item.severidade, total: item.total });
    }
    return acc;
  }, [] as { severidade: string; total: number }[]);

  const chartData = aggregated.map(item => ({
    name: SEVERITY_LABELS[item.severidade] || item.severidade,
    value: item.total,
    color: SEVERITY_COLORS[item.severidade] || 'hsl(var(--muted-foreground))',
  }));

  const hasData = chartData.some(d => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum alerta no período selecionado
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [value, 'Total']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
