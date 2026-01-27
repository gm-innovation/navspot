import { useState, useEffect } from "react";
import { RefreshCw, RotateCcw, Trash2, Clock, CheckCircle, XCircle, Percent, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  useAcoesPendentes, 
  useAcoesPendentesStats, 
  useRetryAcaoPendente, 
  useDeleteAcaoPendente,
  type AcaoPendenteWithDetails 
} from "@/hooks/useAcoesPendentes";
import { useHotspots } from "@/hooks/useHotspots";
import { MetricCard } from "@/components/MetricCard";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACTION_TYPES = [
  { value: 'create_user', label: 'Criar Usuário' },
  { value: 'remove_user', label: 'Remover Usuário' },
  { value: 'disable_user', label: 'Desabilitar Usuário' },
  { value: 'enable_user', label: 'Habilitar Usuário' },
  { value: 'update_password', label: 'Atualizar Senha' },
  { value: 'update_user_profile', label: 'Atualizar Perfil' },
  { value: 'kick_session', label: 'Encerrar Sessão' },
  { value: 'block_device', label: 'Bloquear Dispositivo' },
  { value: 'unblock_device', label: 'Desbloquear Dispositivo' },
  { value: 'kick_device', label: 'Desconectar Dispositivo' },
  { value: 'add_profile', label: 'Adicionar Perfil' },
  { value: 'update_profile_config', label: 'Atualizar Config Perfil' },
  { value: 'remove_profile', label: 'Remover Perfil' },
  { value: 'update_firewall_rules', label: 'Atualizar Firewall' },
];

function getActionLabel(tipo: string): string {
  return ACTION_TYPES.find(t => t.value === tipo)?.label || tipo;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pendente':
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">● Pendente</Badge>;
    case 'executado':
      return <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">✓ Executado</Badge>;
    case 'erro':
      return <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">✗ Erro</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function PayloadSummary({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return <span className="text-muted-foreground">-</span>;
  
  const entries = Object.entries(payload).slice(0, 2);
  const summary = entries.map(([key, value]) => {
    const displayValue = typeof value === 'string' && value.length > 20 
      ? value.substring(0, 20) + '...' 
      : String(value);
    return `${key}: ${displayValue}`;
  }).join(', ');
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm text-muted-foreground cursor-help truncate max-w-[200px] block">
          {summary || '-'}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <pre className="text-xs whitespace-pre-wrap">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </TooltipContent>
    </Tooltip>
  );
}

export default function AcoesPendentes() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [hotspotFilter, setHotspotFilter] = useState<string>("all");
  
  const queryClient = useQueryClient();
  const { data: acoes, isLoading, refetch } = useAcoesPendentes();
  const { data: stats } = useAcoesPendentesStats();
  const { data: hotspots } = useHotspots();
  const retryMutation = useRetryAcaoPendente();
  const deleteMutation = useDeleteAcaoPendente();

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('acoes_pendentes_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acoes_pendentes' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['acoes_pendentes'] });
          queryClient.invalidateQueries({ queryKey: ['acoes_pendentes_stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filter actions
  const filteredAcoes = acoes?.filter((acao) => {
    if (statusFilter !== "all" && acao.status !== statusFilter) return false;
    if (tipoFilter !== "all" && acao.tipo !== tipoFilter) return false;
    if (hotspotFilter !== "all" && acao.hotspot_id !== hotspotFilter) return false;
    return true;
  }) || [];

  const taxaSucesso = stats && (stats.executadas + stats.erros) > 0
    ? ((stats.executadas / (stats.executadas + stats.erros)) * 100).toFixed(1)
    : '100';

  const handleRetry = (id: string) => {
    retryMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ações Pendentes MikroTik</h1>
          <p className="text-muted-foreground">
            Monitore a fila de sincronização com os roteadores MikroTik
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Pendentes"
          value={stats?.pendentes || 0}
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
          description="Aguardando sync"
        />
        <MetricCard
          title="Executadas"
          value={stats?.executadas || 0}
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          description="Sincronizadas com sucesso"
        />
        <MetricCard
          title="Falhas"
          value={stats?.erros || 0}
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          description="Erros na execução"
        />
        <MetricCard
          title="Taxa de Sucesso"
          value={`${taxaSucesso}%`}
          icon={<Percent className="h-4 w-4 text-blue-500" />}
          description="Ações bem-sucedidas"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-[180px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="executado">Executado</SelectItem>
                  <SelectItem value="erro">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px]">
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  {ACTION_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px]">
              <Select value={hotspotFilter} onValueChange={setHotspotFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Hotspot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Hotspots</SelectItem>
                  {hotspots?.map(h => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Fila de Ações</CardTitle>
          <CardDescription>
            {filteredAcoes.length} ações encontradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : filteredAcoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma ação encontrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead>Hotspot</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Criado há</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcoes.slice(0, 100).map((acao) => (
                  <TableRow key={acao.id}>
                    <TableCell>
                      <StatusBadge status={acao.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {getActionLabel(acao.tipo)}
                    </TableCell>
                    <TableCell>
                      <PayloadSummary payload={acao.payload} />
                    </TableCell>
                    <TableCell>
                      {acao.hotspot_nome || '-'}
                    </TableCell>
                    <TableCell>
                      {acao.tentativas}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(acao.created_at), { 
                        addSuffix: false, 
                        locale: ptBR 
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {acao.status !== 'executado' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRetry(acao.id)}
                                disabled={retryMutation.isPending}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Tentar novamente</TooltipContent>
                          </Tooltip>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir ação?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação será removida da fila e não será executada no MikroTik.
                                {acao.status === 'pendente' && (
                                  <span className="block mt-2 text-yellow-600 dark:text-yellow-400">
                                    ⚠️ Esta ação ainda está pendente. O MikroTik pode ficar dessincronizado.
                                  </span>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(acao.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filteredAcoes.length > 100 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Exibindo as 100 ações mais recentes de {filteredAcoes.length} total
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
