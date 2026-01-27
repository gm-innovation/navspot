import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, User, Clock, Download, Upload } from "lucide-react";
import { SessaoAtiva } from "@/hooks/useEmbarcacaoDashboard";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";

interface Props {
  sessoes: SessaoAtiva[] | undefined;
  isLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function SessionRow({ sessao }: { sessao: SessaoAtiva }) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const inicio = new Date(sessao.inicio);
    setDuration(differenceInSeconds(new Date(), inicio));
    
    const interval = setInterval(() => {
      setDuration(differenceInSeconds(new Date(), inicio));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessao.inicio]);

  const totalBytes = sessao.bytes_in + sessao.bytes_out;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <div className="relative">
            <User className="h-5 w-5 text-green-600" />
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-500 rounded-full border-2 border-background" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{sessao.tripulante_nome}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{sessao.tripulante_cargo || 'Tripulante'}</span>
            {sessao.dispositivo_nome && (
              <>
                <span>•</span>
                <span className="truncate">{sessao.dispositivo_nome}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="hidden sm:flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{formatDuration(duration)}</span>
        </div>
        
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1 text-green-600">
            <Download className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{formatBytes(sessao.bytes_in)}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            <Upload className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{formatBytes(sessao.bytes_out)}</span>
          </div>
        </div>

        <div className="flex sm:hidden items-center gap-1 text-muted-foreground">
          <span className="font-mono text-xs">{formatBytes(totalBytes)}</span>
        </div>

        {sessao.ip_address && (
          <Badge variant="outline" className="font-mono text-xs hidden lg:inline-flex">
            {sessao.ip_address}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function EmbarcacaoOnlineUsers({ sessoes, isLoading }: Props) {
  const onlineCount = sessoes?.length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-5 w-5 text-green-500" />
            Usuários Online
          </CardTitle>
          <Badge variant={onlineCount > 0 ? "default" : "secondary"} className="font-mono">
            {onlineCount} conectado{onlineCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : onlineCount > 0 ? (
          <div className="space-y-2">
            {sessoes?.map((sessao) => (
              <SessionRow key={sessao.id} sessao={sessao} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum usuário conectado</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
