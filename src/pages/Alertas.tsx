import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Bell, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Filter,
  Trash2,
  CheckCheck,
  RefreshCw,
  Ban,
  UserX,
  Wifi,
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  useAlertas, 
  useAlertasStats, 
  useResolveAlerta, 
  useResolveMultipleAlertas,
  useDeleteOldAlertas,
  getSeveridadeInfo,
  getTipoInfo,
  extractMacFromMessage,
  AlertaFilters,
  Alerta 
} from "@/hooks/useAlertas";
import { useBlockDispositivoByMac } from "@/hooks/useDispositivosRegistrados";
import { useAlertasRealtime } from "@/hooks/useRealtimeSubscription";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Alertas() {
  // Enable realtime updates
  useAlertasRealtime();

  // Filters state
  const [filters, setFilters] = useState<AlertaFilters>({
    severidade: null,
    resolvido: null,
    dateRange: 'today',
  });
  const [selectedAlertas, setSelectedAlertas] = useState<string[]>([]);

  // Queries and mutations
  const { data: alertas, isLoading, refetch } = useAlertas(filters);
  const { data: stats, isLoading: statsLoading } = useAlertasStats();
  const resolveAlerta = useResolveAlerta();
  const resolveMultiple = useResolveMultipleAlertas();
  const deleteOldAlertas = useDeleteOldAlertas();
  const blockDispositivo = useBlockDispositivoByMac();

  // Handlers
  const handleResolve = (id: string) => {
    resolveAlerta.mutate(id);
  };

  const handleResolveSelected = () => {
    if (selectedAlertas.length > 0) {
      resolveMultiple.mutate(selectedAlertas, {
        onSuccess: () => setSelectedAlertas([]),
      });
    }
  };

  const handleDeleteOld = () => {
    deleteOldAlertas.mutate(30);
  };

  const handleSelectAlerta = (id: string, checked: boolean) => {
    setSelectedAlertas(prev => 
      checked ? [...prev, id] : prev.filter(i => i !== id)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && alertas) {
      setSelectedAlertas(alertas.filter(a => !a.resolvido).map(a => a.id));
    } else {
      setSelectedAlertas([]);
    }
  };

  const getAlertIcon = (severidade: string) => {
    switch (severidade) {
      case "critical":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "info":
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { 
        addSuffix: true, 
        locale: ptBR 
      });
    } catch {
      return timestamp;
    }
  };

  const alertasNaoResolvidos = alertas?.filter(a => !a.resolvido) || [];
  const hasSelectedNonResolved = selectedAlertas.length > 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alertas e Logs</h1>
          <p className="text-muted-foreground">
            Monitore todos os alertas e histórico de ações do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configurar Alertas
          </Button>
        </div>
      </div>

      {/* Dashboard de alertas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Hoje</p>
            </div>
            <Bell className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-red-600">{stats?.criticos || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Críticos</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-yellow-600">{stats?.avisos || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Avisos</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-green-600">{stats?.resolvidos || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Resolvidos</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>
          
          <Select
            value={filters.severidade || 'all'}
            onValueChange={(v) => setFilters(prev => ({ 
              ...prev, 
              severidade: v === 'all' ? null : v as 'info' | 'warning' | 'critical' 
            }))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="warning">Aviso</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.resolvido === null ? 'all' : filters.resolvido ? 'resolvido' : 'ativo'}
            onValueChange={(v) => setFilters(prev => ({ 
              ...prev, 
              resolvido: v === 'all' ? null : v === 'resolvido' 
            }))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="resolvido">Resolvidos</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.dateRange || 'today'}
            onValueChange={(v) => setFilters(prev => ({ 
              ...prev, 
              dateRange: v as 'today' | 'week' | 'month' | 'all' 
            }))}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Últimos 7 dias</SelectItem>
              <SelectItem value="month">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-2">
            {hasSelectedNonResolved && (
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handleResolveSelected}
                disabled={resolveMultiple.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Resolver ({selectedAlertas.length})
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleDeleteOld}
              disabled={deleteOldAlertas.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Antigos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de alertas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Histórico de Alertas
            </CardTitle>
            {alertasNaoResolvidos.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="select-all"
                  checked={selectedAlertas.length === alertasNaoResolvidos.length && alertasNaoResolvidos.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm text-muted-foreground">
                  Selecionar todos
                </label>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 p-4 rounded-lg border">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : alertas && alertas.length > 0 ? (
            <div className="space-y-4">
              {alertas.map((alerta) => {
                const severidadeInfo = getSeveridadeInfo(alerta.severidade);
                const tipoInfo = getTipoInfo(alerta.tipo);
                
                return (
                  <div 
                    key={alerta.id} 
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                  >
                    {!alerta.resolvido && (
                      <Checkbox
                        checked={selectedAlertas.includes(alerta.id)}
                        onCheckedChange={(checked) => handleSelectAlerta(alerta.id, checked as boolean)}
                      />
                    )}
                    
                    <div className="flex-shrink-0 mt-1">
                      {getAlertIcon(alerta.severidade)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant="secondary"
                          className={severidadeInfo.color}
                        >
                          {severidadeInfo.label}
                        </Badge>
                        <Badge 
                          variant={alerta.resolvido ? "default" : "destructive"}
                          className={alerta.resolvido ? 
                            "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : 
                            ""
                          }
                        >
                          {alerta.resolvido ? "Resolvido" : "Ativo"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {tipoInfo.label}
                        </Badge>
                      </div>
                      
                      <p className="text-muted-foreground text-sm mb-2">
                        {alerta.mensagem}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(alerta.created_at)}
                        </div>
                        {alerta.embarcacoes?.nome && (
                          <>
                            <span>•</span>
                            <span>{alerta.embarcacoes.nome}</span>
                          </>
                        )}
                        {alerta.hotspots?.nome && (
                          <>
                            <span>•</span>
                            <span>{alerta.hotspots.nome}</span>
                          </>
                        )}
                        {alerta.tripulantes?.nome && (
                          <>
                            <span>•</span>
                            <span>{alerta.tripulantes.nome}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {/* Quick actions for device_sharing alerts */}
                      {!alerta.resolvido && (alerta.tipo === 'device_sharing' || alerta.tipo === 'blocked_device_attempt') && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {alerta.tipo === 'device_sharing' && (
                              <>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    const mac = extractMacFromMessage(alerta.mensagem);
                                    if (mac) {
                                      blockDispositivo.mutate({
                                        mac_address: mac,
                                        bloqueio_motivo: 'Bloqueado devido a compartilhamento de credenciais detectado',
                                      }, {
                                        onSuccess: () => handleResolve(alerta.id),
                                      });
                                    }
                                  }}
                                  disabled={blockDispositivo.isPending}
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  Bloquear Dispositivo
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => handleResolve(alerta.id)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Ignorar / Resolver
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      
                      {!alerta.resolvido && alerta.tipo !== 'device_sharing' && alerta.tipo !== 'blocked_device_attempt' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleResolve(alerta.id)}
                          disabled={resolveAlerta.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum alerta encontrado</p>
              <p className="text-sm">Ajuste os filtros ou aguarde novos alertas.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações de alertas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Canais de Notificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">Notificações por email</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">Mensagens via WhatsApp</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Webhook</p>
                <p className="text-sm text-muted-foreground">Integração via webhook</p>
              </div>
              <Badge className="bg-muted text-muted-foreground">
                Configurar
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurações Automáticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-resolução</p>
                <p className="text-sm text-muted-foreground">Resolver alertas automaticamente</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Agrupamento</p>
                <p className="text-sm text-muted-foreground">Agrupar alertas similares</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Ativo
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Escalação</p>
                <p className="text-sm text-muted-foreground">Escalar alertas não resolvidos</p>
              </div>
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                Configurar
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
