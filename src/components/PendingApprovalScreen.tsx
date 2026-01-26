import { Clock, LogOut, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export function PendingApprovalScreen() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-navspot-blue-50 to-navspot-blue-100 dark:from-navspot-blue-950 dark:to-navspot-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo e título */}
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-xl bg-gradient-to-br from-navspot-blue-600 to-navspot-blue-500 flex items-center justify-center shadow-lg">
            <Waves className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-navspot-blue-900 dark:text-white">
              NAVSPOT
            </h1>
            <p className="text-navspot-blue-600 dark:text-navspot-blue-300 mt-2">
              Gerenciamento de Hotspots Marítimos
            </p>
          </div>
        </div>

        {/* Card de aprovação pendente */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur dark:bg-gray-900/80">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
            <CardDescription className="text-center">
              Sua conta foi criada, mas ainda precisa ser aprovada por um administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Logado como:</p>
              <p className="font-medium">{user?.email}</p>
            </div>

            <div className="text-sm text-muted-foreground text-center space-y-2">
              <p>
                Um administrador do sistema precisa aprovar seu acesso e atribuir as permissões necessárias.
              </p>
              <p>
                Entre em contato com o administrador da sua empresa para agilizar o processo.
              </p>
            </div>

            <Button 
              onClick={logout} 
              variant="outline" 
              className="w-full mt-4"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-navspot-blue-600 dark:text-navspot-blue-300">
          © 2025 NAVSPOT. Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
}
