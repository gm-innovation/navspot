import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wifi, AlertCircle, Loader2, Ship, Anchor } from "lucide-react";
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

export default function HotspotLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Extract MikroTik params from URL
  const hotspotId = searchParams.get("h") || "";
  const macFromUrl = searchParams.get("mac") || "";
  const ipFromUrl = searchParams.get("ip") || "";
  const linkLoginOnly = searchParams.get("link-login-only") || "";

  // Warn if link-login-only is truncated
  useEffect(() => {
    if (linkLoginOnly.length > 2048) {
      console.warn("[HotspotLogin] link-login-only parameter may be truncated");
    }
  }, [linkLoginOnly]);

  const [formData, setFormData] = useState({
    login: "",
    senha: "",
  });

  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

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
        const { data, error } = await supabase.functions.invoke("hotspot-portal-config", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          body: null,
        });

        // Since invoke doesn't support query params directly, we need to use fetch
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotspot-portal-config?h=${hotspotId}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error("Failed to load config");
        }

        const configData = await response.json();
        
        if (configData.error) {
          throw new Error(configData.error);
        }

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
          data: configData,
          timestamp: Date.now(),
        }));

        setConfig(configData);
      } catch (err) {
        console.error("[HotspotLogin] Failed to load config:", err);
        // Use default config
        setConfig({
          hotspot_name: "NAVSPOT",
          embarcacao_nome: "Embarcação",
          empresa_nome: "WiFi Marítimo",
          logo_url: null,
          cor_primaria: "#1E3A8A",
          cor_secundaria: "#38BDF8",
          cor_fundo: "#F8FAFC",
        });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotspot-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login: formData.login.trim(),
            senha: formData.senha,
            hotspot_id: hotspotId,
            mac_address: macFromUrl,
            ip_address: ipFromUrl,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.rate_limited) {
          const minutes = Math.ceil((data.retry_after_seconds || 900) / 60);
          throw new Error(`Muitas tentativas. Aguarde ${minutes} minuto(s).`);
        }
        throw new Error(data.error || "Falha na autenticação");
      }

      // Success - redirect based on status
      setRedirecting(true);

      if (data.redirect_url) {
        // Small delay to show feedback
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 500);
      }
    } catch (err) {
      console.error("[HotspotLogin] Login error:", err);
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
      setIsLoading(false);
    }
  };

  // Generate CSS variables from config
  const customStyles = config
    ? ({
        "--portal-primary": config.cor_primaria,
        "--portal-secondary": config.cor_secundaria,
        "--portal-background": config.cor_fundo,
      } as React.CSSProperties)
    : {};

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: config?.cor_fundo || "#F8FAFC" }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: config?.cor_primaria }} />
          <p className="text-lg font-medium">Conectando...</p>
          <p className="text-sm text-muted-foreground">Aguarde enquanto liberamos seu acesso</p>
        </div>
      </div>
    );
  }

  if (!hotspotId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="text-xl font-bold text-red-600">Acesso Inválido</h2>
              <p className="text-muted-foreground">
                Esta página deve ser acessada através da rede WiFi da embarcação.
              </p>
              <p className="text-sm text-muted-foreground">
                Conecte-se à rede WiFi e o portal abrirá automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ 
        backgroundColor: config?.cor_fundo || "#F8FAFC",
        ...customStyles 
      }}
    >
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          {/* Logo or default icon */}
          <div className="mx-auto mb-4">
            {config?.logo_url ? (
              <img 
                src={config.logo_url} 
                alt={config.empresa_nome}
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${config?.cor_primaria}20` }}
              >
                <Anchor 
                  className="h-8 w-8" 
                  style={{ color: config?.cor_primaria }}
                />
              </div>
            )}
          </div>
          
          <CardTitle className="text-2xl" style={{ color: config?.cor_primaria }}>
            {config?.embarcacao_nome || "Bem-vindo"}
          </CardTitle>
          <CardDescription className="text-base">
            {config?.empresa_nome || "WiFi Marítimo"}
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

            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
              <Wifi className="h-4 w-4" />
              Digite suas credenciais WiFi
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
                autoFocus
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

            <Button 
              type="submit" 
              className="w-full text-white"
              style={{ 
                backgroundColor: config?.cor_primaria,
                borderColor: config?.cor_primaria,
              }}
              disabled={isLoading || !formData.login || !formData.senha}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Conectar
                </>
              )}
            </Button>

            <div className="pt-4 border-t text-center text-xs text-muted-foreground space-y-2">
              <p>
                Ao conectar, você concorda com os{" "}
                <Link to="/termos" target="_blank" className="underline hover:no-underline">
                  Termos de Uso
                </Link>
                {" "}e a{" "}
                <Link to="/privacidade" target="_blank" className="underline hover:no-underline">
                  Política de Privacidade
                </Link>
              </p>
              <p className="flex items-center justify-center gap-1">
                <Ship className="h-3 w-3" />
                NAVSPOT - WiFi Marítimo
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
