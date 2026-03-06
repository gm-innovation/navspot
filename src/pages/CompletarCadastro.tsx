import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Wifi, CheckCircle2, AlertCircle, Loader2, Ship, Shield, Anchor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PortalConfig {
  hotspot_name: string;
  embarcacao_nome: string;
  empresa_nome: string;
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string;
  cor_fundo: string;
}

const CACHE_KEY_PREFIX = "navspot_portal_config_";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function CompletarCadastro() {
  const [searchParams] = useSearchParams();
  const loginFromUrl = searchParams.get("login") || "";
  const hotspotId = searchParams.get("h") || "";
  const macFromUrl = searchParams.get("mac") || "";
  const gatewayFromUrl = searchParams.get("gateway") || "192.168.88.1";

  const [formData, setFormData] = useState({
    login: loginFromUrl,
    senha: "",
    nome: "",
    email: "",
    cpf: "",
    cargo: "",
  });

  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [aceitouPrivacidade, setAceitouPrivacidade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(!!hotspotId);

  // Load portal config with caching
  useEffect(() => {
    if (!hotspotId) {
      setConfigLoading(false);
      return;
    }

    const loadConfig = async () => {
      // Check cache first
      const cacheKey = CACHE_KEY_PREFIX + hotspotId;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION_MS) {
            setConfig(data);
            setConfigLoading(false);
            return;
          }
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }

      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotspot-portal-config?h=${hotspotId}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const configData = await response.json();
          if (!configData.error) {
            localStorage.setItem(cacheKey, JSON.stringify({
              data: configData,
              timestamp: Date.now(),
            }));
            setConfig(configData);
          }
        }
      } catch (err) {
        console.error("[CompletarCadastro] Failed to load config:", err);
      } finally {
        setConfigLoading(false);
      }
    };

    loadConfig();
  }, [hotspotId]);

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
    
    if (!aceitouTermos || !aceitouPrivacidade) {
      setError("Você deve aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    
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
            aceite_termos: aceitouTermos,
            aceite_privacidade: aceitouPrivacidade,
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

      // v6.9.13: Auto-login silencioso após cadastro bem-sucedido
      // Se temos hotspotId e gateway, fazer login automático
      if (hotspotId && formData.login && formData.senha) {
        setRedirecting(true);
        try {
          const loginResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotspot-login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                login: formData.login.trim(),
                senha: formData.senha,
                hotspot_id: hotspotId,
                mac_address: macFromUrl,
              }),
            }
          );

          const contentType = loginResponse.headers.get("content-type") || "";
          
          if (contentType.includes("text/html")) {
            // Active user: edge function returns HTML auto-post form
            const html = await loginResponse.text();
            setTimeout(() => {
              document.open();
              document.write(html);
              document.close();
            }, 1500);
            return;
          }
          
          const loginData = await loginResponse.json();
          
          if (loginData.success && loginData.redirect_url) {
            setTimeout(() => {
              window.location.href = loginData.redirect_url;
            }, 1500);
            return;
          }
        } catch (loginError) {
          console.error("[CompletarCadastro] Auto-login failed:", loginError);
          // Continue showing success - user can login manually
        }
        setRedirecting(false);
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(err instanceof Error ? err.message : "Erro ao completar cadastro");
    } finally {
      setIsLoading(false);
    }
  };

  // Loading branding config
  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: config?.cor_fundo || "#F8FAFC" }}
      >
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              {redirecting ? (
                <>
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: config?.cor_primaria || "#1E3A8A" }} />
                  </div>
                  <h2 className="text-2xl font-bold" style={{ color: config?.cor_primaria }}>Conectando...</h2>
                  <p className="text-muted-foreground">
                    Aguarde enquanto liberamos seu acesso WiFi
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: config?.cor_fundo || "#F8FAFC" }}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Logo or default icon */}
          <div className="mx-auto mb-2">
            {config?.logo_url ? (
              <img 
                src={config.logo_url} 
                alt={config.empresa_nome}
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${config?.cor_primaria || "#1E3A8A"}20` }}
              >
                <Anchor 
                  className="h-6 w-6" 
                  style={{ color: config?.cor_primaria || "#1E3A8A" }}
                />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl" style={{ color: config?.cor_primaria }}>
            Complete seu Cadastro
          </CardTitle>
          <CardDescription>
            {config?.embarcacao_nome 
              ? `Preencha seus dados para ativar seu acesso WiFi na ${config.embarcacao_nome}`
              : "Preencha seus dados pessoais para ativar seu acesso WiFi"
            }
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

            {/* Consentimentos LGPD */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Shield className="h-4 w-4" />
                Consentimentos Obrigatórios
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="termos"
                    checked={aceitouTermos}
                    onCheckedChange={(checked) => setAceitouTermos(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="termos"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Li e concordo com os{" "}
                      <Link to="/termos" target="_blank" className="text-primary underline hover:no-underline">
                        Termos de Uso
                      </Link>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Inclui regras de uso do serviço WiFi e responsabilidades
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="privacidade"
                    checked={aceitouPrivacidade}
                    onCheckedChange={(checked) => setAceitouPrivacidade(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="privacidade"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Li e concordo com a{" "}
                      <Link to="/privacidade" target="_blank" className="text-primary underline hover:no-underline">
                        Política de Privacidade
                      </Link>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Autorizo o tratamento dos meus dados pessoais conforme a LGPD
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full text-white" 
              style={{ 
                backgroundColor: config?.cor_primaria || undefined,
                borderColor: config?.cor_primaria || undefined,
              }}
              disabled={isLoading || !formData.login || !formData.senha || !formData.nome || !aceitouTermos || !aceitouPrivacidade}
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
              Seus dados serão tratados conforme a Lei Geral de Proteção de Dados (LGPD).
              Os registros de acesso são mantidos por 6 meses conforme Marco Civil da Internet.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
