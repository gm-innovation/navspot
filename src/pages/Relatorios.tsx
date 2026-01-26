import { useState } from "react";
import { Building2, Ship, Users, Wifi, Activity, AlertTriangle, FileBarChart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ReportCard } from "@/components/reports/ReportCard";
import { ReportFilters, FilterValues } from "@/components/reports/ReportFilters";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ConsumoChart } from "@/components/reports/ConsumoChart";
import { SessoesChart } from "@/components/reports/SessoesChart";
import { AlertasChart } from "@/components/reports/AlertasChart";
import { TopConsumidoresChart } from "@/components/reports/TopConsumidoresChart";
import { 
  useRelatorioConsumo, 
  useRelatorioSessoes, 
  useRelatorioAlertas,
  useTopConsumidores,
  useRelatorioEmpresas,
  useRelatorioEmbarcacoes,
  useRelatorioMetricasGerais,
} from "@/hooks/useRelatorios";
import { formatBytes, exportToCSV, exportToPDF, getDateRangePreset } from "@/utils/exportUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Relatorios() {
  const { user } = useAuth();
  const { start, end } = getDateRangePreset('30dias');
  
  const [filters, setFilters] = useState<FilterValues>({
    periodo: '30dias',
    dataInicio: start,
    dataFim: end,
    agruparPor: 'dia',
    empresaId: user?.role === 'empresa_admin' ? user.empresa_id || undefined : undefined,
    embarcacaoId: user?.role === 'gerente_embarcacao' ? user.embarcacao_id || undefined : undefined,
  });

  const relatorioFilters = {
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
    empresaId: filters.empresaId,
    embarcacaoId: filters.embarcacaoId,
    agruparPor: filters.agruparPor,
  };

  const { data: consumoData = [], isLoading: loadingConsumo } = useRelatorioConsumo(relatorioFilters);
  const { data: sessoesData = [], isLoading: loadingSessoes } = useRelatorioSessoes(relatorioFilters);
  const { data: alertasData = [], isLoading: loadingAlertas } = useRelatorioAlertas(relatorioFilters);
  const { data: topConsumidores = [], isLoading: loadingTop } = useTopConsumidores(relatorioFilters);
  const { data: metricas, isLoading: loadingMetricas } = useRelatorioMetricasGerais(relatorioFilters);
  const { data: empresasData = [] } = useRelatorioEmpresas();
  const { data: embarcacoesData = [] } = useRelatorioEmbarcacoes(filters.empresaId);

  const handleExportCSV = () => {
    const exportData = topConsumidores.map(c => ({
      nome: c.nome,
      tipo: c.tipo === 'tripulante' ? 'Tripulante' : 'Dispositivo',
      cargo: c.cargo || '-',
      embarcacao: c.embarcacao_nome || '-',
      consumo_bytes: c.bytes_consumidos,
      consumo_formatado: formatBytes(c.bytes_consumidos),
    }));
    
    exportToCSV(exportData, `relatorio-consumo-${filters.periodo}`);
  };

  const handleExportPDF = () => {
    const exportData = topConsumidores.map(c => ({
      nome: c.nome,
      tipo: c.tipo === 'tripulante' ? 'Tripulante' : 'Dispositivo',
      cargo: c.cargo || '-',
      embarcacao: c.embarcacao_nome || '-',
      consumo: c.bytes_consumidos,
    }));

    exportToPDF({
      data: exportData,
      filename: `relatorio-consumo-${filters.periodo}`,
      title: 'Relatório de Consumo',
      subtitle: `Período: ${filters.dataInicio.toLocaleDateString('pt-BR')} a ${filters.dataFim.toLocaleDateString('pt-BR')}`,
      columns: [
        { key: 'nome', label: 'Nome' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'cargo', label: 'Cargo' },
        { key: 'embarcacao', label: 'Embarcação' },
        { key: 'consumo', label: 'Consumo', format: (v) => formatBytes(v as number) },
      ],
    });
  };

  const getRoleTitle = () => {
    switch (user?.role) {
      case 'super_admin':
        return 'Relatórios - Visão Global';
      case 'empresa_admin':
        return 'Relatórios - Minha Empresa';
      case 'gerente_embarcacao':
        return 'Relatórios - Minha Embarcação';
      default:
        return 'Relatórios';
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBarChart className="h-6 w-6" />
            {getRoleTitle()}
          </h1>
          <p className="text-muted-foreground">
            Análise de consumo, sessões e alertas
          </p>
        </div>
        <ExportButtons 
          onExportCSV={handleExportCSV} 
          onExportPDF={handleExportPDF}
          disabled={loadingTop || topConsumidores.length === 0}
        />
      </div>

      {/* Filters */}
      <ReportFilters filters={filters} onFiltersChange={setFilters} />

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {user?.role === 'super_admin' && (
          <ReportCard
            title="Empresas"
            value={metricas?.empresas || 0}
            icon={Building2}
            subtitle="Ativas no sistema"
          />
        )}
        <ReportCard
          title="Embarcações"
          value={metricas?.embarcacoes || 0}
          icon={Ship}
          subtitle="Ativas"
        />
        <ReportCard
          title="Tripulantes"
          value={metricas?.tripulantes || 0}
          icon={Users}
          subtitle="Cadastrados"
        />
        <ReportCard
          title="Sessões"
          value={metricas?.sessoes?.toLocaleString('pt-BR') || 0}
          icon={Wifi}
          subtitle="Total registrado"
        />
        <ReportCard
          title="Consumo Total"
          value={formatBytes(metricas?.consumo || 0)}
          icon={Activity}
          subtitle="Dados transferidos"
        />
        <ReportCard
          title="Alertas"
          value={metricas?.alertas || 0}
          icon={AlertTriangle}
          subtitle="Pendentes"
        />
      </div>

      {/* Charts */}
      <Tabs defaultValue="consumo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          {user?.role === 'super_admin' && <TabsTrigger value="empresas">Empresas</TabsTrigger>}
          {(user?.role === 'super_admin' || user?.role === 'empresa_admin') && (
            <TabsTrigger value="embarcacoes">Embarcações</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="consumo" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ConsumoChart data={consumoData} isLoading={loadingConsumo} />
            <TopConsumidoresChart data={topConsumidores} isLoading={loadingTop} />
          </div>
        </TabsContent>

        <TabsContent value="sessoes" className="space-y-4">
          <SessoesChart data={sessoesData} isLoading={loadingSessoes} />
        </TabsContent>

        <TabsContent value="alertas" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <AlertasChart data={alertasData} isLoading={loadingAlertas} />
            <Card>
              <CardHeader>
                <CardTitle>Detalhes de Alertas</CardTitle>
                <CardDescription>Lista de alertas por tipo e severidade</CardDescription>
              </CardHeader>
              <CardContent>
                {alertasData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Nenhum alerta no período
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Severidade</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Resolvidos</TableHead>
                        <TableHead className="text-right">Pendentes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertasData.map((alerta, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium capitalize">{alerta.tipo}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              alerta.severidade === 'critico' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                              alerta.severidade === 'aviso' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {alerta.severidade}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{alerta.total}</TableCell>
                          <TableCell className="text-right text-green-600">{alerta.resolvidos}</TableCell>
                          <TableCell className="text-right text-red-600">{alerta.pendentes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {user?.role === 'super_admin' && (
          <TabsContent value="empresas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Métricas por Empresa</CardTitle>
                <CardDescription>Visão geral de todas as empresas do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                {empresasData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Nenhuma empresa cadastrada
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead className="text-right">Embarcações</TableHead>
                        <TableHead className="text-right">Tripulantes</TableHead>
                        <TableHead className="text-right">Consumo</TableHead>
                        <TableHead className="text-right">Alertas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empresasData.map((empresa) => (
                        <TableRow key={empresa.id}>
                          <TableCell className="font-medium">{empresa.nome}</TableCell>
                          <TableCell className="text-right">{empresa.total_embarcacoes}</TableCell>
                          <TableCell className="text-right">{empresa.total_tripulantes}</TableCell>
                          <TableCell className="text-right">{formatBytes(empresa.total_consumo)}</TableCell>
                          <TableCell className="text-right">
                            {empresa.total_alertas > 0 ? (
                              <span className="text-red-600 font-medium">{empresa.total_alertas}</span>
                            ) : (
                              <span className="text-green-600">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {(user?.role === 'super_admin' || user?.role === 'empresa_admin') && (
          <TabsContent value="embarcacoes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Métricas por Embarcação</CardTitle>
                <CardDescription>
                  {user?.role === 'super_admin' 
                    ? 'Visão de todas as embarcações' 
                    : 'Embarcações da sua empresa'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {embarcacoesData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Nenhuma embarcação encontrada
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Embarcação</TableHead>
                        {user?.role === 'super_admin' && <TableHead>Empresa</TableHead>}
                        <TableHead className="text-right">Tripulantes</TableHead>
                        <TableHead className="text-right">Hotspots</TableHead>
                        <TableHead className="text-right">Consumo</TableHead>
                        <TableHead className="text-right">Sessões</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {embarcacoesData.map((emb) => (
                        <TableRow key={emb.id}>
                          <TableCell className="font-medium">{emb.nome}</TableCell>
                          {user?.role === 'super_admin' && (
                            <TableCell>{emb.empresa_nome || '-'}</TableCell>
                          )}
                          <TableCell className="text-right">{emb.total_tripulantes}</TableCell>
                          <TableCell className="text-right">{emb.total_hotspots}</TableCell>
                          <TableCell className="text-right">{formatBytes(emb.total_consumo)}</TableCell>
                          <TableCell className="text-right">{emb.total_sessoes.toLocaleString('pt-BR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
