import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

const roleLabels: Record<string, string> = {
  super_admin: 'Super Administrador',
  empresa_admin: 'Administrador da Empresa',
  gerente_embarcacao: 'Gerente de Embarcação',
};

export function SecurityCard() {
  const { user } = useAuth();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch empresa name if user has empresa_id
  const { data: empresa } = useQuery({
    queryKey: ['empresa-name', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return null;
      const { data, error } = await supabase
        .from('empresas')
        .select('nome')
        .eq('id', user.empresa_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.empresa_id,
  });

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A nova senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Senha alterada',
        description: 'Sua senha foi atualizada com sucesso.',
      });
      
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: 'Erro ao alterar senha',
        description: error.message || 'Não foi possível alterar a senha.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Conta e Segurança
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* User Info */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Papel</span>
            <Badge variant="secondary">
              {user?.role ? roleLabels[user.role] || user.role : 'Não definido'}
            </Badge>
          </div>
          
          {empresa && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Empresa</span>
              <span className="text-sm font-medium">{empresa.nome}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Password Change */}
        {!isChangingPassword ? (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => setIsChangingPassword(true)}
          >
            <Key className="h-4 w-4 mr-2" />
            Alterar Senha
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite a nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirme a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setIsChangingPassword(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1"
                onClick={handlePasswordChange}
                disabled={isSubmitting || !newPassword || !confirmPassword}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Key className="h-4 w-4 mr-2" />
                )}
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
