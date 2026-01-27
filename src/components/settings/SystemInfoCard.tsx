import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Wifi, Clock } from "lucide-react";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const APP_VERSION = 'v1.0.0';

export function SystemInfoCard() {
  // Fetch hotspots stats
  const { data: hotspotsData, isLoading } = useQuery({
    queryKey: ['system-hotspots-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotspots')
        .select('id, status, ultima_sincronizacao');
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const online = data?.filter(h => h.status === 'online').length || 0;
      
      // Find most recent sync
      const syncs = data
        ?.filter(h => h.ultima_sincronizacao)
        .map(h => new Date(h.ultima_sincronizacao!).getTime()) || [];
      
      const lastSync = syncs.length > 0 ? new Date(Math.max(...syncs)) : null;
      
      return { total, online, lastSync };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusColor = () => {
    if (!hotspotsData) return 'bg-muted text-muted-foreground';
    if (hotspotsData.online === 0 && hotspotsData.total > 0) {
      return 'bg-destructive/10 text-destructive';
    }
    if (hotspotsData.online < hotspotsData.total) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    }
    return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
  };

  const getStatusLabel = () => {
    if (!hotspotsData) return 'Carregando...';
    if (hotspotsData.total === 0) return 'Sem hotspots';
    if (hotspotsData.online === hotspotsData.total) return 'Todos online';
    if (hotspotsData.online === 0) return 'Todos offline';
    return 'Parcialmente online';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Informações do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Version */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Versão</p>
            <p className="text-sm font-medium">{APP_VERSION}</p>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Status</p>
            {isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <Badge className={getStatusColor()}>
                {getStatusLabel()}
              </Badge>
            )}
          </div>

          {/* Hotspots */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              Hotspots
            </p>
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <p className="text-sm font-medium">
                {hotspotsData?.online}/{hotspotsData?.total} online
              </p>
            )}
          </div>

          {/* Last Sync */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Última Sync
            </p>
            {isLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : hotspotsData?.lastSync ? (
              <p className="text-sm font-medium">
                {formatDistanceToNow(hotspotsData.lastSync, { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Nunca</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
