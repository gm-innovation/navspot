import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wifi, CheckCircle2, AlertCircle, Loader2, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function CompletarCadastro() {
  const [searchParams] = useSearchParams();
  const loginFromUrl = searchParams.get("login") || "";

  const [formData, setFormData] = useState({
    login: loginFromUrl,
    senha: "",
    nome: "",
    email: "",
    cpf: "",
    cargo: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  };

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    if (formatted.length <= 14) {
      handleChange("cpf", formatted);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "tripulante-self-register",
        {
          body: {
            login: formData.login.trim(),
            senha: formData.senha,
            nome: formData.nome.trim(),
            email: formData.email.trim() || undefined,
            cpf: formData.cpf.trim() || undefined,
            cargo: formData.cargo.trim() || undefined,
          },
        }
      );

      if (invokeError) {
        throw new Error(invokeError.message || "Erro ao completar cadastro");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setSuccess(true);
    } catch (err) {
      console.error("Registration error:", err);
      setError(err instanceof Error ? err.message : "Erro ao completar cadastro");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-green-600">Cadastro Completo!</h2>
              <p className="text-muted-foreground">
                Seu acesso WiFi foi liberado. Você já pode se conectar à rede da embarcação.
              </p>
              <div className="pt-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Suas credenciais:</p>
                <p className="text-sm text-muted-foreground">Login: <span className="font-mono">{formData.login}</span></p>
                <p className="text-sm text-muted-foreground">Senha: <span className="font-mono">••••••••</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Ship className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Complete seu Cadastro</CardTitle>
          <CardDescription>
            Preencha seus dados pessoais para ativar seu acesso WiFi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Credentials Section */}
            <div className="space-y-4 pb-4 border-b">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wifi className="h-4 w-4" />
                Suas Credenciais WiFi
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login">Login</Label>
                <Input
                  id="login"
                  value={formData.login}
                  onChange={(e) => handleChange("login", e.target.value)}
                  placeholder="Seu login WiFi"
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={formData.senha}
                  onChange={(e) => handleChange("senha", e.target.value)}
                  placeholder="Sua senha WiFi"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Personal Data Section */}
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">
                Dados Pessoais
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  placeholder="João da Silva"
                  required
                  minLength={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="joao@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => handleCPFChange(e.target.value)}
                  placeholder="123.456.789-00"
                  maxLength={14}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cargo">Cargo na Embarcação</Label>
                <Input
                  id="cargo"
                  value={formData.cargo}
                  onChange={(e) => handleChange("cargo", e.target.value)}
                  placeholder="Marinheiro, Cozinheiro..."
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !formData.login || !formData.senha || !formData.nome}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Completando...
                </>
              ) : (
                "Completar Cadastro"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao completar o cadastro, você terá acesso à rede WiFi da embarcação 
              de acordo com o perfil configurado pelo administrador.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
