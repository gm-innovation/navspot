import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegrasByPerfil } from "@/hooks/useRegrasAcesso";
import { ExternalLink } from "lucide-react";

interface RegrasDoPerfil {
  perfilId: string;
  herdarRegrasEmpresa?: boolean;
}

export function RegrasDoPerfil({ perfilId, herdarRegrasEmpresa }: RegrasDoPerfil) {
  const { data: regras, isLoading } = useRegrasByPerfil(perfilId);
  
  const whitelists = regras?.filter(r => r.lista?.tipo === 'whitelist') || [];
  const blacklists = regras?.filter(r => r.lista?.tipo === 'blacklist') || [];
  
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-48" />
      </div>
    );
  }
  
  if (regras?.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Nenhuma regra específica para este perfil.
          {herdarRegrasEmpresa && (
            <span className="block mt-1">
              ✓ Herda regras globais da empresa.
            </span>
          )}
        </p>
        <Link 
          to="/regras-acesso" 
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Gerenciar em Regras de Acesso
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {whitelists.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Whitelists (Permitidas):</p>
          <div className="flex flex-wrap gap-1">
            {whitelists.map(r => (
              <Badge 
                key={r.id} 
                variant="outline" 
                className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
              >
                {r.lista?.nome}
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      {blacklists.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Blacklists (Bloqueadas):</p>
          <div className="flex flex-wrap gap-1">
            {blacklists.map(r => (
              <Badge 
                key={r.id} 
                variant="outline" 
                className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
              >
                {r.lista?.nome}
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      {herdarRegrasEmpresa && (
        <p className="text-xs text-muted-foreground">
          ✓ Também herda regras globais da empresa.
        </p>
      )}
      
      <Link 
        to="/regras-acesso" 
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        Gerenciar em Regras de Acesso
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
