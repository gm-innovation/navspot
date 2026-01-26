import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Settings, FileText, History, AlertTriangle, CheckCircle, Clock, XCircle, Users, Loader2, Eye, Trash2, Download } from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useLGPDConfig, 
  useUpdateLGPDConfig, 
  useSolicitacoesLGPD, 
  useAtenderSolicitacao,
  useAuditLogs,
  useConsentimentosStats,
  useAnonimizarTripulante
} from "@/hooks/useLGPD";
import { useAuth } from "@/contexts/AuthContext";

export default function GestaoLGPD() {
  const { user } = useAuth();
  const { data: config, isLoading: loadingConfig } = useLGPDConfig();
  const { data: solicitacoes, isLoading: loadingSolicitacoes } = useSolicitacoesLGPD();
  const { data: auditLogs, isLoading: loadingLogs } = useAuditLogs({ limit: 50 });
  const { data: stats } = useConsentimentosStats();
  
  const updateConfig = useUpdateLGPDConfig();
  const atenderSolicitacao = useAtenderSolicitacao();
  const anonimizarTripulante = useAnonimizarTripulante();

  const [configForm, setConfigForm] = useState({
    razao_social: config?.razao_social || "",
    cnpj: config?.cnpj || "",
    dpo_nome: config?.dpo_nome || "",
    dpo_email: config?.dpo_email || "",
    dpo_telefone: config?.dpo_telefone || "",
    endereco_sede: config?.endereco_sede || "",
    retencao_logs_meses: config?.retencao_logs_meses || 12,
  });

  const [selectedSolicitacao, setSelectedSolicitacao] = useState<any>(null);
  const [resposta, setResposta] = useState("");
  const [isRespondendo, setIsRespondendo] = useState(false);

  // Atualizar form quando config carregar
  useState(() => {
    if (config) {
      setConfigForm({
        razao_social: config.razao_social || "",
        cnpj: config.cnpj || "",
        dpo_nome: config.dpo_nome || "",
        dpo_email: config.dpo_email || "",
        dpo_telefone: config.dpo_telefone || "",
        endereco_sede: config.endereco_sede || "",
        retencao_logs_meses: config.retencao_logs_meses || 12,
      });
    }
  });

  const handleSaveConfig = () => {
    updateConfig.mutate(configForm);
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
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'em_analise':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800"><Eye className="h-3 w-3 mr-1" />Em Análise</Badge>;
      case 'concluida':
        return <Badge variant="outline" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Concluída</Badge>;
      case 'recusada':
        return <Badge variant="outline" className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Recusada</Badge>;
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
            Gerencie conformidade com a Lei Geral de Proteção de Dados
          </p>
        </div>
      </div>

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
            <div className="text-2xl font-bold">{config?.retencao_logs_meses || 12} meses</div>
            <p className="text-xs text-muted-foreground">Mínimo legal: 6 meses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Versão da Política</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{config?.politica_privacidade_versao || "v1.0"}</div>
            <p className="text-xs text-muted-foreground">Termos: {config?.termos_uso_versao || "v1.0"}</p>
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
          <TabsTrigger value="auditoria" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Aba Configuração */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configurações LGPD da Empresa</CardTitle>
              <CardDescription>
                Configure as informações do controlador e do encarregado de dados (DPO)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Razão Social</Label>
                  <Input
                    value={configForm.razao_social}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, razao_social: e.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    value={configForm.cnpj}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Endereço da Sede</Label>
                <Input
                  value={configForm.endereco_sede}
                  onChange={(e) => setConfigForm(prev => ({ ...prev, endereco_sede: e.target.value }))}
                  placeholder="Endereço completo"
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Encarregado de Dados (DPO) - Art. 41 LGPD
                </h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Nome do DPO</Label>
                    <Input
                      value={configForm.dpo_nome}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_nome: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email do DPO</Label>
                    <Input
                      type="email"
                      value={configForm.dpo_email}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_email: e.target.value }))}
                      placeholder="dpo@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone do DPO</Label>
                    <Input
                      value={configForm.dpo_telefone}
                      onChange={(e) => setConfigForm(prev => ({ ...prev, dpo_telefone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Políticas de Retenção (Marco Civil)</h4>
                <div className="space-y-2">
                  <Label>Período de Retenção de Logs (meses)</Label>
                  <Input
                    type="number"
                    min={6}
                    max={60}
                    value={configForm.retencao_logs_meses}
                    onChange={(e) => setConfigForm(prev => ({ ...prev, retencao_logs_meses: parseInt(e.target.value) || 12 }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 6 meses conforme Marco Civil da Internet (Art. 13)
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                {updateConfig.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                ) : (
                  "Salvar Configurações"
                )}
              </Button>
            </CardContent>
          </Card>
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
                          {sol.status === 'pendente' && (
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
                        <TableCell>{log.tabela}</TableCell>
                        <TableCell>
                          <code className="text-xs">{log.ip_address || "N/A"}</code>
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

      {/* Modal de Resposta */}
      <Dialog open={!!selectedSolicitacao} onOpenChange={() => setSelectedSolicitacao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedSolicitacao?.status === 'pendente' ? 'Atender Solicitação' : 'Detalhes da Solicitação'}
            </DialogTitle>
            <DialogDescription>
              Solicitação de {selectedSolicitacao?.tipo} - {selectedSolicitacao?.tripulante?.nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedSolicitacao?.descricao && (
              <div>
                <Label>Descrição do Titular</Label>
                <p className="text-sm text-muted-foreground bg-muted p-2 rounded mt-1">
                  {selectedSolicitacao.descricao}
                </p>
              </div>
            )}

            {selectedSolicitacao?.status === 'pendente' ? (
              <>
                <div className="space-y-2">
                  <Label>Resposta</Label>
                  <Textarea
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Digite a resposta ao titular..."
                    rows={4}
                  />
                </div>

                {selectedSolicitacao?.tipo === 'exclusao' && (
                  <div className="bg-destructive/10 p-3 rounded-lg">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Aprovar esta solicitação irá anonimizar permanentemente os dados pessoais do tripulante.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div>
                <Label>Resposta</Label>
                <p className="text-sm bg-muted p-2 rounded mt-1">
                  {selectedSolicitacao?.resposta || "Sem resposta"}
                </p>
              </div>
            )}
          </div>

          {selectedSolicitacao?.status === 'pendente' && (
            <DialogFooter className="gap-2">
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />Aprovar</>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
