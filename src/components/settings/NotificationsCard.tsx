import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Save, Send, X, Plus, Loader2 } from "lucide-react";
import { 
  useNotificationSettings, 
  useUpdateNotificationSettings, 
  useCreateNotificationSettings,
  useTestWebhook 
} from '@/hooks/useNotificationSettings';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

interface NotificationsCardProps {
  readOnly?: boolean;
}

export function NotificationsCard({ readOnly = false }: NotificationsCardProps) {
  const { user } = useAuth();
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const createSettings = useCreateNotificationSettings();
  const testWebhook = useTestWebhook();

  // Form state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailDestinatarios, setEmailDestinatarios] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumeros, setWhatsappNumeros] = useState<string[]>([]);
  const [newWhatsapp, setNewWhatsapp] = useState('');
  
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  
  const [severidades, setSeveridades] = useState<string[]>(['critical', 'warning']);

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.email_enabled ?? true);
      setEmailDestinatarios(settings.email_destinatarios ?? []);
      setWhatsappEnabled(settings.whatsapp_enabled ?? false);
      setWhatsappNumeros(settings.whatsapp_numeros ?? []);
      setWebhookEnabled(settings.webhook_enabled ?? false);
      setWebhookUrl(settings.webhook_url ?? '');
      setSeveridades(settings.notificar_severidades ?? ['critical', 'warning']);
    }
  }, [settings]);

  // Auto-create settings if not exists
  useEffect(() => {
    if (!isLoading && !settings && user?.empresa_id && !createSettings.isPending) {
      createSettings.mutate({
        empresa_id: user.empresa_id,
        email_enabled: true,
        email_destinatarios: user.email ? [user.email] : [],
        whatsapp_enabled: false,
        whatsapp_numeros: [],
        webhook_enabled: false,
        webhook_url: null,
        notificar_severidades: ['critical', 'warning'],
      });
    }
  }, [isLoading, settings, user?.empresa_id]);

  const handleAddEmail = () => {
    if (newEmail && !emailDestinatarios.includes(newEmail)) {
      setEmailDestinatarios([...emailDestinatarios, newEmail]);
      setNewEmail('');
    }
  };

  const handleRemoveEmail = (email: string) => {
    setEmailDestinatarios(emailDestinatarios.filter(e => e !== email));
  };

  const handleAddWhatsapp = () => {
    if (newWhatsapp && !whatsappNumeros.includes(newWhatsapp)) {
      setWhatsappNumeros([...whatsappNumeros, newWhatsapp]);
      setNewWhatsapp('');
    }
  };

  const handleRemoveWhatsapp = (numero: string) => {
    setWhatsappNumeros(whatsappNumeros.filter(n => n !== numero));
  };

  const handleSeveridadeChange = (severidade: string, checked: boolean) => {
    if (checked) {
      setSeveridades([...severidades, severidade]);
    } else {
      setSeveridades(severidades.filter(s => s !== severidade));
    }
  };

  const handleSave = () => {
    if (!settings?.id) return;
    
    updateSettings.mutate({
      id: settings.id,
      email_enabled: emailEnabled,
      email_destinatarios: emailDestinatarios,
      whatsapp_enabled: whatsappEnabled,
      whatsapp_numeros: whatsappNumeros,
      webhook_enabled: webhookEnabled,
      webhook_url: webhookUrl || null,
      notificar_severidades: severidades,
    });
  };

  const handleTestWebhook = () => {
    if (webhookUrl) {
      testWebhook.mutate(webhookUrl);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas e Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Alertas e Notificações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notificações por Email</p>
              <p className="text-xs text-muted-foreground">Receber alertas por email</p>
            </div>
            <Switch 
              checked={emailEnabled} 
              onCheckedChange={setEmailEnabled}
              disabled={readOnly}
            />
          </div>
          
          {emailEnabled && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label className="text-xs">Destinatários</Label>
              <div className="flex flex-wrap gap-2">
                {emailDestinatarios.map((email) => (
                  <Badge key={email} variant="secondary" className="flex items-center gap-1">
                    {email}
                    {!readOnly && (
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => handleRemoveEmail(email)}
                      />
                    )}
                  </Badge>
                ))}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="novo@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    className="text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={handleAddEmail}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* WhatsApp */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">WhatsApp</p>
              <p className="text-xs text-muted-foreground">Alertas críticos via WhatsApp</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Em breve</Badge>
              <Switch 
                checked={whatsappEnabled} 
                onCheckedChange={setWhatsappEnabled}
                disabled={readOnly || true} // Disabled until implemented
              />
            </div>
          </div>
          
          {whatsappEnabled && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label className="text-xs">Números</Label>
              <div className="flex flex-wrap gap-2">
                {whatsappNumeros.map((numero) => (
                  <Badge key={numero} variant="secondary" className="flex items-center gap-1">
                    {numero}
                    {!readOnly && (
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => handleRemoveWhatsapp(numero)}
                      />
                    )}
                  </Badge>
                ))}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="+55 11 99999-9999"
                    value={newWhatsapp}
                    onChange={(e) => setNewWhatsapp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddWhatsapp()}
                    className="text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={handleAddWhatsapp}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Webhook */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Webhook</p>
              <p className="text-xs text-muted-foreground">Integração com sistemas externos</p>
            </div>
            <Switch 
              checked={webhookEnabled} 
              onCheckedChange={setWebhookEnabled}
              disabled={readOnly}
            />
          </div>
          
          {webhookEnabled && (
            <div className="space-y-2 pl-4 border-l-2 border-muted">
              <Label className="text-xs">URL do Webhook</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://sua-url-webhook.com/navspot"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  disabled={readOnly}
                  className="text-sm"
                />
                {!readOnly && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleTestWebhook}
                    disabled={!webhookUrl || testWebhook.isPending}
                  >
                    {testWebhook.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Severidades */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Severidades a Notificar</Label>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="sev-critical" 
                checked={severidades.includes('critical')}
                onCheckedChange={(checked) => handleSeveridadeChange('critical', !!checked)}
                disabled={readOnly}
              />
              <Label htmlFor="sev-critical" className="text-sm cursor-pointer">
                Crítico
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="sev-warning" 
                checked={severidades.includes('warning')}
                onCheckedChange={(checked) => handleSeveridadeChange('warning', !!checked)}
                disabled={readOnly}
              />
              <Label htmlFor="sev-warning" className="text-sm cursor-pointer">
                Aviso
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="sev-info" 
                checked={severidades.includes('info')}
                onCheckedChange={(checked) => handleSeveridadeChange('info', !!checked)}
                disabled={readOnly}
              />
              <Label htmlFor="sev-info" className="text-sm cursor-pointer">
                Informativo
              </Label>
            </div>
          </div>
        </div>

        {!readOnly && (
          <Button 
            className="w-full" 
            onClick={handleSave}
            disabled={updateSettings.isPending || !settings?.id}
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Notificações
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
