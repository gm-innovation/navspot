import { useNavigate } from "react-router-dom";
import { User, Building2, Ship, Calendar, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth, UserRole } from "@/contexts/AuthContext";

interface UserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Administrador',
  empresa_admin: 'Administrador de Empresa',
  gerente_embarcacao: 'Gerente de Embarcação',
};

const roleBadgeVariants: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  empresa_admin: 'secondary',
  gerente_embarcacao: 'outline',
};

export function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate('/configuracoes');
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>
            Informações da sua conta no sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* User Avatar and Name */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">
                {user.email?.split('@')[0] || 'Usuário'}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>

          <Separator />

          {/* Role */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Papel no Sistema</p>
            {user.role ? (
              <Badge variant={roleBadgeVariants[user.role]} className="text-sm">
                {roleLabels[user.role]}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Pendente de Aprovação
              </Badge>
            )}
          </div>

          {/* Empresa - only show if user has one */}
          {user.empresa_id && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Empresa</p>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>ID: {user.empresa_id.substring(0, 8)}...</span>
              </div>
            </div>
          )}

          {/* Embarcação - only show if user has one */}
          {user.embarcacao_id && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Embarcação</p>
              <div className="flex items-center gap-2 text-sm">
                <Ship className="h-4 w-4 text-muted-foreground" />
                <span>ID: {user.embarcacao_id.substring(0, 8)}...</span>
              </div>
            </div>
          )}

          {/* User ID */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">ID do Usuário</p>
            <p className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
              {user.id}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end pt-2">
          <Button onClick={handleGoToSettings} variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
