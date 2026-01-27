import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, Settings, FileText, History, AlertTriangle, CheckCircle, Clock, XCircle, 
  Users, Loader2, Eye, Trash2, Download, Building2, Info, ExternalLink 
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLGPDConfigWithEmpresa, useUpdateLGPDSettings } from "@/hooks/useLGPDConfig";
import { 
  useSolicitacoesLGPD, 
  useAtenderSolicitacao,
  useAuditLogs,
  useConsentimentosStats,
  useAnonimizarTripulante
} from "@/hooks/useLGPD";
import { useAuth } from "@/contexts/AuthContext";

export function EmpresaLGPDView() {
  const { user } = useAuth();
  const { data: lgpdData, isLoading: loadingConfig } = useLGPDConfigWithEmpresa();
  const { data: solicitacoes, isLoading: loadingSolicitacoes } = useSolicitacoesLGPD();
  const { data: auditLogs, isLoading: loadingLogs } = useAuditLogs({ limit: 50 });
  const { data: stats } = useConsentimentosStats();
  
  const updateSettings = useUpdateLGPDSettings();
  const atenderSolicitacao = useAtenderSolicitacao();
  const anonimizarTripulante = useAnonimizarTripulante();

  const [configForm, setConfigForm] = useState({
    dpo_nome: "",
    dpo_email: "",
    dpo_telefone: "",
    retencao_logs_meses: 12,
  });

  const [selectedSolicitacao, setSelectedSolicitacao] = useState<any>(null);
  const [resposta, setResposta] = useState("");
  const [isRespondendo, setIsRespondendo] = useState(false);

  // Atualizar form quando config carregar
  useEffect(() => {
    if (lgpdData?.config) {
      setConfigForm({
        dpo_nome: lgpdData.config.dpo_nome || "",
        dpo_email: lgpdData.config.dpo_email || "",
        dpo_telefone: lgpdData.config.dpo_telefone || "",
        retencao_logs_meses: lgpdData.config.retencao_logs_meses || 12,
      });
    }
  }, [lgpdData?.config]);

  const handleSaveConfig = () => {
    updateSettings.mutate(configForm);
  };

  const handleAtenderSolicitacao = async (status: 'concluida' | 'recusada') => {
    if (!selectedSolicitacao || !resposta.trim()) return;

    setIsRespondendo(true);
    try {
      // Se for exclusão aprovada, anonimizar dados
      if (status === 'concluida' && selectedSolicitacao.tipo === 'exclusao' && selectedSolicitacao.tripulante_id) {
        await anonimizarTripulante.mutateAsync(selectedSolicitacao.tripulante_id);
      }

      await atenderSolicitacao.mutateAsync({
        id: selectedSolicitacao.id,
        status,
        resposta: resposta.trim(),
      });

      setSelectedSolicitacao(null);
      setResposta("");
    } finally {
      setIsRespondendo(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'em_analise':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Eye className="h-3 w-3 mr-1" />Em Análise</Badge>;
      case 'concluida':
        return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Concluída</Badge>;
      case 'recusada':
        return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 mr-1" />Recusada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'acesso':
        return <Badge variant="secondary"><Eye className="h-3 w-3 mr-1" />Acesso</Badge>;
      case 'retificacao':
        return <Badge variant="secondary"><Settings className="h-3 w-3 mr-1" />Retificação</Badge>;
      case 'exclusao':
        return <Badge variant="destructive"><Trash2 className="h-3 w-3 mr-1" />Exclusão</Badge>;
      case 'portabilidade':
        return <Badge variant="secondary"><Download className="h-3 w-3 mr-1" />Portabilidade</Badge>;
      default:
        return <Badge variant="outline">{tipo}</Badge>;
    }
  };

  const solicitacoesPendentes = solicitacoes?.filter(s => s.status === 'pendente') || [];
  const isGerente = user?.role === 'gerente_embarcacao';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Gestão LGPD
          </h1>
          <p className="text-muted-foreground">
            Configure a conformidade com a Lei Geral de Proteção de Dados
          </p>
        </div>
      </div>

      {/* Card Explicativo */}
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Sobre esta seção:</strong> O NAVSPOT atua como <strong>OPERADOR</strong> de dados (Art. 5º, VII da LGPD), 
          processando informações em nome da sua empresa. Sua empresa é a <strong>CONTROLADORA</strong> (Art. 5º, VI) e deve:
          <ul className="list-disc ml-6 mt-2">
            <li>Indicar um Encarregado de Dados (DPO)</li>
            <li>Responder às solicitações dos titulares (tripulantes)</li>
            <li>Definir políticas de retenção compatíveis com o Marco Civil</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tripulantes com Consentimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.percentual || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {stats?.comConsentimento || 0} de {stats?.total || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Retenção de Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lgpdData?.config?.retencao_logs_meses || 12} meses</div>
            <p className="text-xs text-muted-foreground">Mínimo legal: 6 meses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Versão da Política</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lgpdData?.config?.politica_privacidade_versao || "v1.0"}</div>
            <p className="text-xs text-muted-foreground">Termos: {lgpdData?.config?.termos_uso_versao || "v1.0"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="solicitacoes" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Solicitações
            {solicitacoesPendentes.length > 0 && (
              <Badge variant="destructive" className="ml-1">{solicitacoesPendentes.length}</Badge>
            )}
          </TabsTrigger>
          {!isGerente && (
            <TabsTrigger value="auditoria" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Auditoria
            </TabsTrigger>
          )}
        </TabsList>

        {/* Aba Configuração */}
        <TabsContent value="config" className="space-y-6">
          {/* Card Controlador (Read-only) */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dados do Controlador
              </CardTitle>
              <CardDescription>
                A empresa abaixo é a CONTROLADORA dos dados pessoais dos tripulantes conforme Art. 5º, VI da LGPD
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingConfig ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase">Razão Social</Label>
                      <p className="font-medium">{lgpdData?.empresa?.nome || "Não informado"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase">CNPJ</Label>
                      <p className="font-medium">{lgpdData?.empresa?.cnpj || "Não informado"}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase">Email</Label>
                      <p className="font-medium">{lgpdData?.empresa?.email || "Não informado"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs uppercase">Telefone</Label>
                      <p className="font-medium">{lgpdData?.empresa?.telefone || "Não informado"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase">Endereço</Label>
                    <p className="font-medium">{lgpdData?.empresa?.endereco || "Não informado"}</p>
                  </div>
                  {!isGerente && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/empresas" className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Editar dados da empresa
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card DPO (Editável) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Encarregado de Dados (DPO)
              </CardTitle>
              <CardDescription>
                Conforme Art. 41 da LGPD, indique o Encarregado de Dados da sua empresa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Nome do DPO</Label>
                  <Input
                    value={configForm.dpo_nome}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_nome: e.target.value }))}
                    placeholder="Nome completo"
                    disabled={isGerente}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email do DPO</Label>
                  <Input
                    type="email"
                    value={configForm.dpo_email}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_email: e.target.value }))}
                    placeholder="dpo@empresa.com"
                    disabled={isGerente}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone do DPO</Label>
                  <Input
                    value={configForm.dpo_telefone}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_telefone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                    disabled={isGerente}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card Políticas de Retenção */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Políticas de Retenção
              </CardTitle>
              <CardDescription>
                Conforme Marco Civil da Internet (Art. 13), logs de conexão devem ser mantidos por no mínimo 6 meses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label>Período de Retenção de Logs (meses)</Label>
                <Input
                  type="number"
                  min={6}
                  max={60}
                  value={configForm.retencao_logs_meses}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, retencao_logs_meses: parseInt(e.target.value) || 12 }))}
                  disabled={isGerente}
                />
                <p className="text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  Mínimo de 6 meses conforme Marco Civil da Internet (Art. 13)
                </p>
              </div>
            </CardContent>
          </Card>

          {!isGerente && (
            <div className="flex justify-end">
              <Button onClick={handleSaveConfig} disabled={updateSettings.isPending}>
                {updateSettings.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                ) : (
                  "Salvar Configurações"
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Aba Solicitações */}
        <TabsContent value="solicitacoes">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Titulares</CardTitle>
              <CardDescription>
                Gerencie solicitações de acesso, retificação, exclusão e portabilidade de dados
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
                      <TableHead>Ações</TableHead>
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
                        <TableCell>{getTipoBadge(sol.tipo)}</TableCell>
                        <TableCell>{getStatusBadge(sol.status)}</TableCell>
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
                        <TableCell>
                          {sol.status === 'pendente' && !isGerente && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedSolicitacao(sol)}
                            >
                              Atender
                            </Button>
                          )}
                          {sol.status !== 'pendente' && sol.resposta && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedSolicitacao(sol)}
                            >
                              Ver Resposta
                            </Button>
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

        {/* Aba Auditoria */}
        {!isGerente && (
          <TabsContent value="auditoria">
            <Card>
              <CardHeader>
                <CardTitle>Logs de Auditoria</CardTitle>
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
        )}
      </Tabs>

      {/* Dialog Atender Solicitação */}
      <Dialog open={!!selectedSolicitacao} onOpenChange={() => setSelectedSolicitacao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedSolicitacao?.status === 'pendente' ? 'Atender Solicitação' : 'Detalhes da Solicitação'}
            </DialogTitle>
            <DialogDescription>
              Solicitação de {selectedSolicitacao?.tipo} do titular {selectedSolicitacao?.tripulante?.nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Tipo</Label>
                <p>{getTipoBadge(selectedSolicitacao?.tipo)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <p>{getStatusBadge(selectedSolicitacao?.status)}</p>
              </div>
            </div>

            {selectedSolicitacao?.descricao && (
              <div>
                <Label className="text-muted-foreground">Descrição do Titular</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedSolicitacao.descricao}</p>
              </div>
            )}

            {selectedSolicitacao?.tipo === 'exclusao' && selectedSolicitacao?.status === 'pendente' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Atenção:</strong> Aprovar esta solicitação irá anonimizar permanentemente os dados pessoais 
                  do titular. Os logs de conexão serão mantidos por 6 meses conforme Marco Civil da Internet.
                </AlertDescription>
              </Alert>
            )}

            {selectedSolicitacao?.status === 'pendente' && !isGerente ? (
              <div className="space-y-2">
                <Label>Resposta ao Titular</Label>
                <Textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder="Descreva as ações tomadas ou o motivo da recusa..."
                  rows={4}
                />
              </div>
            ) : selectedSolicitacao?.resposta && (
              <div>
                <Label className="text-muted-foreground">Resposta</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedSolicitacao.resposta}</p>
                {selectedSolicitacao.atendido_em && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Respondido em {format(new Date(selectedSolicitacao.atendido_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {selectedSolicitacao?.status === 'pendente' && !isGerente ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleAtenderSolicitacao('recusada')}
                  disabled={isRespondendo || !resposta.trim()}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Recusar
                </Button>
                <Button
                  onClick={() => handleAtenderSolicitacao('concluida')}
                  disabled={isRespondendo || !resposta.trim()}
                >
                  {isRespondendo ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Aprovar
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setSelectedSolicitacao(null)}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
