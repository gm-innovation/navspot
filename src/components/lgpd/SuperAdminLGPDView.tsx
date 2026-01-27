import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, Settings, FileText, History, Loader2, Building2, Info, 
  CheckCircle, AlertTriangle, XCircle, Scale, Eye
} from "lucide-react";
import { useAllEmpresasLGPD, getLGPDStatus, EmpresaWithLGPD } from "@/hooks/useLGPDConfig";
import { useSolicitacoesLGPD, useAuditLogs } from "@/hooks/useLGPD";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { JudicialExportTab } from "./JudicialExportTab";

export function SuperAdminLGPDView() {
  const { data: empresas, isLoading: loadingEmpresas } = useAllEmpresasLGPD();
  const { data: solicitacoes, isLoading: loadingSolicitacoes } = useSolicitacoesLGPD();
  const { data: auditLogs, isLoading: loadingLogs } = useAuditLogs({ limit: 50 });
  
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaWithLGPD | null>(null);

  const solicitacoesPendentes = solicitacoes?.filter(s => s.status === 'pendente') || [];

  const getStatusBadge = (empresa: EmpresaWithLGPD) => {
    const status = getLGPDStatus(empresa);
    
    switch (status.color) {
      case 'green':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />{status.label}</Badge>;
      case 'yellow':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><AlertTriangle className="h-3 w-3 mr-1" />{status.label}</Badge>;
      case 'red':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 mr-1" />{status.label}</Badge>;
    }
  };

  // Stats
  const totalEmpresas = empresas?.length || 0;
  const empresasConfiguradas = empresas?.filter(e => getLGPDStatus(e).status === 'ok').length || 0;
  const empresasPendentes = totalEmpresas - empresasConfiguradas;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Gestão LGPD - Visão Geral
          </h1>
          <p className="text-muted-foreground">
            Gerencie a conformidade LGPD de todas as empresas clientes
          </p>
        </div>
      </div>

      {/* Card Explicativo */}
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Painel do Super Administrador:</strong> Você tem acesso à conformidade LGPD de todas as empresas.
          Cada empresa cliente é <strong>Controladora</strong> dos dados de seus tripulantes. O NAVSPOT atua como <strong>Operador</strong>.
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Empresas Cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmpresas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">LGPD Configurado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{empresasConfiguradas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{empresasPendentes}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{solicitacoesPendentes.length}</div>
            {solicitacoesPendentes.some(s => isPast(new Date(s.prazo_legal))) && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Algumas fora do prazo!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="empresas" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Empresas
          </TabsTrigger>
          <TabsTrigger value="solicitacoes" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Solicitações
            {solicitacoesPendentes.length > 0 && (
              <Badge variant="destructive" className="ml-1">{solicitacoesPendentes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="exportacao" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Exportação Judicial
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Aba Empresas */}
        <TabsContent value="empresas">
          <Card>
            <CardHeader>
              <CardTitle>Status LGPD por Empresa</CardTitle>
              <CardDescription>
                Visualize a conformidade LGPD de cada empresa cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingEmpresas ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : empresas?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma empresa cadastrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>DPO</TableHead>
                      <TableHead>Retenção</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {empresas?.map((empresa) => (
                      <TableRow key={empresa.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{empresa.nome}</p>
                            <p className="text-xs text-muted-foreground">{empresa.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{empresa.cnpj || "—"}</span>
                        </TableCell>
                        <TableCell>
                          {empresa.lgpd_config?.dpo_nome ? (
                            <div>
                              <p className="text-sm">{empresa.lgpd_config.dpo_nome}</p>
                              <p className="text-xs text-muted-foreground">{empresa.lgpd_config.dpo_email}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Não definido</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {empresa.lgpd_config?.retencao_logs_meses || 12} meses
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(empresa)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedEmpresa(empresa)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Solicitações */}
        <TabsContent value="solicitacoes">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Titulares (Todas as Empresas)</CardTitle>
              <CardDescription>
                Visualize solicitações de acesso, retificação, exclusão e portabilidade de dados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSolicitacoes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : solicitacoes?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma solicitação registrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titular</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Prazo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {solicitacoes?.map((sol) => (
                      <TableRow key={sol.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{sol.tripulante?.nome || "N/A"}</p>
                            <p className="text-xs text-muted-foreground">{sol.tripulante?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{sol.tipo}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sol.status === 'pendente' ? 'outline' : sol.status === 'concluida' ? 'default' : 'destructive'}>
                            {sol.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {format(new Date(sol.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </TableCell>
                        <TableCell>
                          {sol.status === 'pendente' && (
                            <span className={`text-sm ${isPast(new Date(sol.prazo_legal)) ? 'text-destructive font-medium' : ''}`}>
                              {formatDistanceToNow(new Date(sol.prazo_legal), { locale: ptBR, addSuffix: true })}
                            </span>
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

        {/* Aba Exportação Judicial */}
        <TabsContent value="exportacao">
          <JudicialExportTab empresas={empresas || []} />
        </TabsContent>

        {/* Aba Auditoria */}
        <TabsContent value="auditoria">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Auditoria (Todas as Empresas)</CardTitle>
              <CardDescription>
                Registro de ações realizadas no sistema (últimos 50 registros)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum registro de auditoria</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Tabela</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <span className="text-sm">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.acao}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{log.tabela}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono text-muted-foreground">
                            {log.ip_address || "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Detalhes Empresa */}
      <Dialog open={!!selectedEmpresa} onOpenChange={() => setSelectedEmpresa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              LGPD - {selectedEmpresa?.nome}
            </DialogTitle>
            <DialogDescription>
              Detalhes de conformidade LGPD desta empresa
            </DialogDescription>
          </DialogHeader>

          {selectedEmpresa && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedEmpresa)}
              </div>

              {/* Dados do Controlador */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Dados do Controlador</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Razão Social:</span>
                    <p>{selectedEmpresa.nome}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CNPJ:</span>
                    <p>{selectedEmpresa.cnpj || "Não informado"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p>{selectedEmpresa.email || "Não informado"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>
                    <p>{selectedEmpresa.telefone || "Não informado"}</p>
                  </div>
                </div>
              </div>

              {/* DPO */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Encarregado de Dados (DPO)</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nome:</span>
                    <p>{selectedEmpresa.lgpd_config?.dpo_nome || "Não definido"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p>{selectedEmpresa.lgpd_config?.dpo_email || "Não definido"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>
                    <p>{selectedEmpresa.lgpd_config?.dpo_telefone || "Não definido"}</p>
                  </div>
                </div>
              </div>

              {/* Configurações */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Configurações</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Retenção de logs:</span>
                    <p>{selectedEmpresa.lgpd_config?.retencao_logs_meses || 12} meses</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Versão Política:</span>
                    <p>{selectedEmpresa.lgpd_config?.politica_privacidade_versao || "v1.0"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Versão Termos:</span>
                    <p>{selectedEmpresa.lgpd_config?.termos_uso_versao || "v1.0"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
