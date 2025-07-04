
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Key, 
  Bell, 
  Database,
  Shield,
  Globe,
  Save,
  RefreshCw
} from "lucide-react";

export default function Configuracoes() {
  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Configure as preferências e integrações do sistema NAVSPOT
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* API WiFi Manager */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API WiFi Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-token">Token da API</Label>
              <div className="flex gap-2">
                <Input
                  id="api-token"
                  type="password"
                  placeholder="Digite o token da API"
                  value="••••••••••••••••••••"
                />
                <Button variant="outline" size="icon">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Status da Conexão</p>
                <p className="text-sm text-muted-foreground">Última sincronização: 2 min atrás</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Conectado
              </Badge>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sincronização Automática</p>
                  <p className="text-xs text-muted-foreground">Sincronizar dados a cada 5 minutos</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Backup Automático</p>
                  <p className="text-xs text-muted-foreground">Fazer backup no Supabase</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>

            <Button className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações da API
            </Button>
          </CardContent>
        </Card>

        {/* Alertas e Notificações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alertas e Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notificações por Email</p>
                  <p className="text-xs text-muted-foreground">Receber alertas por email</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-muted-foreground">Alertas críticos via WhatsApp</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Webhook</p>
                  <p className="text-xs text-muted-foreground">Integração com sistemas externos</p>
                </div>
                <Switch />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL do Webhook</Label>
              <Input
                id="webhook-url"
                placeholder="https://sua-url-webhook.com/navspot"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-alerts">Email para Alertas</Label>
              <Input
                id="email-alerts"
                type="email"
                placeholder="admin@navspot.com"
                defaultValue="admin@navspot.com"
              />
            </div>

            <Button className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Salvar Preferências
            </Button>
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Autenticação de Dois Fatores</p>
                  <p className="text-xs text-muted-foreground">Adiciona camada extra de segurança</p>
                </div>
                <Switch />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Log de Atividades</p>
                  <p className="text-xs text-muted-foreground">Registrar todas as ações</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-logout</p>
                  <p className="text-xs text-muted-foreground">Logout automático após inatividade</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="session-timeout">Timeout da Sessão (minutos)</Label>
              <Input
                id="session-timeout"
                type="number"
                defaultValue="30"
                min="5"
                max="120"
              />
            </div>

            <Button className="w-full" variant="outline">
              <Shield className="h-4 w-4 mr-2" />
              Configurar 2FA
            </Button>
          </CardContent>
        </Card>

        {/* Sistema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Versão</p>
                <p className="text-muted-foreground">v1.0.0</p>
              </div>
              <div>
                <p className="font-medium">Última Atualização</p>
                <p className="text-muted-foreground">01/01/2024</p>
              </div>
              <div>
                <p className="font-medium">Uptime</p>
                <p className="text-muted-foreground">99.9%</p>
              </div>
              <div>
                <p className="font-medium">Status</p>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                  Online
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Modo de Depuração</p>
                  <p className="text-xs text-muted-foreground">Logs detalhados para diagnóstico</p>
                </div>
                <Switch />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Atualizações Automáticas</p>
                  <p className="text-xs text-muted-foreground">Instalar atualizações automaticamente</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <Database className="h-4 w-4 mr-2" />
                Backup
              </Button>
              <Button variant="outline" className="flex-1">
                <Globe className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salvar todas as configurações */}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="font-medium">Salvar Todas as Configurações</p>
            <p className="text-sm text-muted-foreground">
              Aplicar todas as mudanças feitas nas configurações
            </p>
          </div>
          <Button size="lg">
            <Save className="h-4 w-4 mr-2" />
            Salvar Tudo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
