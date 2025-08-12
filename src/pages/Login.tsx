
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Waves } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const success = await login(email, password);
      
      if (success) {
        toast({
          title: "Login realizado com sucesso!",
          description: "Bem-vindo ao NAVSPOT",
        });
      } else {
        toast({
          title: "Erro no login",
          description: "Email ou senha inválidos",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Erro no login",
        description: "Ocorreu um erro inesperado",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* Card de login */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur dark:bg-gray-900/80">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">
              Digite suas credenciais para acessar o painel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
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

              <Button 
                type="submit" 
                className="w-full h-11 bg-navspot-blue-600 hover:bg-navspot-blue-700" 
                disabled={isLoading}
              >
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>

            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">Usuários de teste:</p>
              <div className="space-y-1 text-xs">
                <p>Super Admin: admin@navspot.com</p>
                <p>Admin Empresa: empresa@navspot.com</p>
                <p>Gerente: gerente@navspot.com</p>
                <p className="italic">Qualquer senha funciona</p>
              </div>
            </div>

            <div className="mt-4 text-center">
              <Button variant="link" className="text-sm text-navspot-blue-600 hover:text-navspot-blue-700">
                Esqueceu sua senha?
              </Button>
            </div>
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
