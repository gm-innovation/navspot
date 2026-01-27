import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldCheck,
  ShieldOff,
  Plus,
  Clock,
  User,
  Ship,
  Wifi,
  Activity,
  Calendar,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DispositivoWithTripulante,
  formatBytes,
  formatMacAddress,
  TIPOS_DISPOSITIVO,
} from "@/hooks/useDispositivosRegistrados";
import { useUpdateRegraAcesso, RegraWithRelations } from "@/hooks/useRegrasAcesso";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DispositivoDetailsModalProps {
  dispositivo: DispositivoWithTripulante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRule?: (macAddress: string) => void;
}

export function DispositivoDetailsModal({
  dispositivo,
  open,
  onOpenChange,
  onCreateRule,
}: DispositivoDetailsModalProps) {
  const updateRegra = useUpdateRegraAcesso();

  // Fetch regras for this MAC address
  const { data: regras, refetch: refetchRegras } = useQuery({
    queryKey: ['regras_acesso_by_mac', dispositivo?.mac_address],
    queryFn: async () => {
      if (!dispositivo?.mac_address) return [];
      
      const { data, error } = await supabase
        .from('regras_acesso')
        .select(`
          *,
          lista:listas_acesso(id, nome, tipo),
          perfil:perfis_velocidade(id, nome),
          tripulante:tripulantes(id, nome),
          hotspot:hotspots(id, nome)
        `)
        .eq('mac_address', dispositivo.mac_address)
        .order('prioridade');

      if (error) throw error;
      return data as RegraWithRelations[];
    },
    enabled: open && !!dispositivo?.mac_address,
  });

  // Fetch recent sessions
  const { data: sessoes } = useQuery({
    queryKey: ['sessoes_by_mac', dispositivo?.mac_address],
    queryFn: async () => {
      if (!dispositivo?.mac_address) return [];
      
      const { data, error } = await supabase
        .from('sessoes_wifi')
        .select(`
          *,
          hotspot:hotspots(id, nome)
        `)
        .eq('mac_address', dispositivo.mac_address)
        .order('inicio', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: open && !!dispositivo?.mac_address,
  });

  const handleToggleRegra = async (regra: RegraWithRelations) => {
    await updateRegra.mutateAsync({
      id: regra.id,
      ativo: !regra.ativo,
    });
    refetchRegras();
  };

  if (!dispositivo) return null;

  const tipoInfo = TIPOS_DISPOSITIVO.find(t => t.value === dispositivo.tipo);
  const isEquipamento = tipoInfo?.categoria === 'embarcacao';

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "N/A";
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEquipamento ? (
              <Ship className="h-5 w-5 text-primary" />
            ) : (
              <User className="h-5 w-5 text-primary" />
            )}
            {dispositivo.nome || "Dispositivo"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
              {formatMacAddress(dispositivo.mac_address)}
            </code>
            <Badge variant={dispositivo.autorizado ? "default" : "destructive"}>
              {dispositivo.autorizado ? "Autorizado" : "Bloqueado"}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-140px)] pr-4">
          <div className="space-y-6">
            {/* Info Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Tipo</p>
                <p className="font-medium">{tipoInfo?.label || dispositivo.tipo}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Categoria</p>
                <Badge variant="outline">
                  {isEquipamento ? "Equipamento de Embarcação" : "Dispositivo Pessoal"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Consumo Total</p>
                <p className="font-medium">{formatBytes(dispositivo.bytes_consumidos)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Último Uso</p>
                <p className="font-medium">{formatTimestamp(dispositivo.ultimo_uso)}</p>
              </div>
              {dispositivo.tripulante && (
                <div className="col-span-2 space-y-1">
                  <p className="text-sm text-muted-foreground">Tripulante</p>
                  <p className="font-medium flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {dispositivo.tripulante.nome}
                    {dispositivo.tripulante.cargo && (
                      <span className="text-muted-foreground">
                        ({dispositivo.tripulante.cargo})
                      </span>
                    )}
                  </p>
                </div>
              )}
              {dispositivo.perfil && (
                <div className="col-span-2 space-y-1">
                  <p className="text-sm text-muted-foreground">Perfil de Velocidade</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {dispositivo.perfil.nome}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {dispositivo.perfil.velocidade_download}/{dispositivo.perfil.velocidade_upload}
                      {dispositivo.perfil.limite_dados_mb && (
                        <> • Quota: {dispositivo.perfil.limite_dados_mb}MB</>
                      )}
                    </span>
                  </div>
                </div>
              )}
              {dispositivo.bloqueio_motivo && (
                <div className="col-span-2 space-y-1">
                  <p className="text-sm text-muted-foreground">Motivo do Bloqueio</p>
                  <p className="text-red-600 dark:text-red-400">
                    {dispositivo.bloqueio_motivo}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Rules Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Regras de Acesso
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onCreateRule?.(dispositivo.mac_address);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova Regra
                </Button>
              </div>

              {regras && regras.length > 0 ? (
                <div className="space-y-2">
                  {regras.map((regra) => (
                    <div
                      key={regra.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        regra.ativo 
                          ? "bg-muted/30" 
                          : "bg-muted/10 opacity-60"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="secondary"
                            className={
                              regra.lista?.tipo === 'whitelist' 
                                ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" 
                                : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                            }
                          >
                            {regra.lista?.tipo === 'whitelist' ? 'Whitelist' : 'Blacklist'}
                          </Badge>
                          <span className="font-medium text-sm">
                            {regra.lista?.nome || "Lista desconhecida"}
                          </span>
                        </div>
                        {regra.horario_inicio && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {regra.horario_inicio} - {regra.horario_fim}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={regra.ativo}
                        onCheckedChange={() => handleToggleRegra(regra)}
                        disabled={updateRegra.isPending}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground border rounded-lg">
                  <ShieldOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma regra específica para este dispositivo</p>
                  <Button
                    size="sm"
                    variant="link"
                    onClick={() => {
                      onOpenChange(false);
                      onCreateRule?.(dispositivo.mac_address);
                    }}
                  >
                    Criar primeira regra
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Sessions History */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4" />
                Histórico de Sessões
              </h3>

              {sessoes && sessoes.length > 0 ? (
                <div className="space-y-2">
                  {sessoes.map((sessao: any) => (
                    <div
                      key={sessao.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">
                            {sessao.hotspot?.nome || "Hotspot"}
                          </span>
                          <Badge variant={sessao.status === 'ativa' ? "default" : "secondary"}>
                            {sessao.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatTimestamp(sessao.inicio)}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">
                          ↓ {formatBytes(sessao.bytes_in)}
                        </p>
                        <p className="text-muted-foreground">
                          ↑ {formatBytes(sessao.bytes_out)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground border rounded-lg">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma sessão registrada</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
