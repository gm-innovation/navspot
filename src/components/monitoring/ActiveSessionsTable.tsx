import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessoesAtivas, formatDuration, formatBytes, useLiveDuration, SessaoAtiva } from '@/hooks/useMonitoramento';
import { User, Smartphone, Wifi } from 'lucide-react';

function SessionRow({ sessao }: { sessao: SessaoAtiva }) {
  const duration = useLiveDuration(sessao.inicio);
  const totalConsumo = sessao.bytes_in + sessao.bytes_out;

  return (
    <TableRow className="hover:bg-muted/50 transition-colors">
      <TableCell>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{sessao.tripulante.nome}</p>
            {sessao.tripulante.cargo && (
              <p className="text-xs text-muted-foreground">{sessao.tripulante.cargo}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm">{sessao.dispositivo.nome || 'Dispositivo'}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {sessao.dispositivo.mac_address || sessao.mac_address || 'N/A'}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm">{sessao.hotspot.nome}</p>
            <p className="text-xs text-muted-foreground">{sessao.hotspot.embarcacao_nome}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {formatDuration(duration)}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div>
          <p className="font-medium">{formatBytes(totalConsumo)}</p>
          <p className="text-xs text-muted-foreground">
            ↓ {formatBytes(sessao.bytes_in)} ↑ {formatBytes(sessao.bytes_out)}
          </p>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ActiveSessionsTable() {
  const { data: sessoes, isLoading } = useSessoesAtivas();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Sessões Ativas</span>
          <Badge variant="secondary">{sessoes?.length || 0} conexões</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sessoes && sessoes.length > 0 ? (
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tripulante</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Hotspot</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessoes.map((sessao) => (
                  <SessionRow key={sessao.id} sessao={sessao} />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma sessão ativa no momento</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
