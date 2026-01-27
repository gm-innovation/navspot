import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Building2, Ship, Settings, Pencil, Check, X, Lock, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { z } from "zod";

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

const passwordSchema = z.object({
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(100, "Senha muito longa"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

export function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile, isLoading, updateProfile, updatePassword } = useProfile();

  // State for editing name
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');

  // State for password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // Initialize display name from profile
  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    } else if (user?.email) {
      setDisplayName(user.email.split('@')[0]);
    }
  }, [profile, user]);

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate('/configuracoes');
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    
    await updateProfile.mutateAsync({ display_name: displayName.trim() });
    setIsEditingName(false);
  };

  const handleCancelEditName = () => {
    setDisplayName(profile?.display_name || user?.email?.split('@')[0] || '');
    setIsEditingName(false);
  };

  const handleChangePassword = async () => {
    setPasswordErrors({});
    
    const result = passwordSchema.safeParse({ newPassword, confirmPassword });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setPasswordErrors(errors);
      return;
    }

    await updatePassword.mutateAsync(newPassword);
    setShowPasswordForm(false);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleCancelPasswordChange = () => {
    setShowPasswordForm(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordErrors({});
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>
            Gerencie suas informações pessoais
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt="Avatar" />
              ) : null}
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {getInitials(displayName || 'U')}
              </AvatarFallback>
            </Avatar>
            {/* TODO: Add avatar upload when storage is configured */}
          </div>

          <Separator />

          {/* Display Name Section */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Nome de Exibição</Label>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveName}
                  disabled={updateProfile.isPending}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEditName}
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="font-medium">{displayName || 'Não definido'}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Email</Label>
            <p className="text-sm">{user.email}</p>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Papel no Sistema</Label>
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
              <Label className="text-sm font-medium text-muted-foreground">Empresa</Label>
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>ID: {user.empresa_id.substring(0, 8)}...</span>
              </div>
            </div>
          )}

          {/* Embarcação - only show if user has one */}
          {user.embarcacao_id && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Embarcação</Label>
              <div className="flex items-center gap-2 text-sm">
                <Ship className="h-4 w-4 text-muted-foreground" />
                <span>ID: {user.embarcacao_id.substring(0, 8)}...</span>
              </div>
            </div>
          )}

          <Separator />

          {/* Security Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Segurança</Label>
            </div>

            {showPasswordForm ? (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className={passwordErrors.newPassword ? 'border-destructive' : ''}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {passwordErrors.newPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.newPassword}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className={passwordErrors.confirmPassword ? 'border-destructive' : ''}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.confirmPassword}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleChangePassword}
                    disabled={updatePassword.isPending}
                    className="flex-1"
                  >
                    {updatePassword.isPending ? 'Salvando...' : 'Salvar Senha'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelPasswordChange}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowPasswordForm(true)}
                className="w-full"
              >
                <Lock className="h-4 w-4 mr-2" />
                Alterar Senha
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end pt-2">
          <Button onClick={handleGoToSettings} variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Mais Configurações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
