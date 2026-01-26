import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Mail, 
  MessageSquare, 
  Webhook, 
  Clock, 
  Bell,
  Plus,
  X,
  Send,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { 
  useNotificationSettings, 
  useUpdateNotificationSettings,
  useCreateNotificationSettings,
  useTestWebhook,
  NotificationSettings 
} from "@/hooks/useNotificationSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";

interface AlertSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'canais' | 'automacoes' | 'escalacao';
}

const defaultSettings: Omit<NotificationSettings, 'id' | 'created_at' | 'updated_at'> = {
  empresa_id: null,
  email_enabled: true,
  email_destinatarios: [],
  whatsapp_enabled: false,
  whatsapp_numeros: [],
  webhook_enabled: false,
  webhook_url: null,
  auto_resolver_enabled: false,
  auto_resolver_horas: 24,
  agrupar_enabled: true,
  escalacao_enabled: false,
  escalacao_minutos: 30,
  escalacao_destinatarios: [],
  notificar_severidades: ['critical', 'warning'],
};

export function AlertSettingsModal({ open, onOpenChange, defaultTab = 'canais' }: AlertSettingsModalProps) {
  const { user } = useAuth();
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const createSettings = useCreateNotificationSettings();
  const testWebhook = useTestWebhook();

  const [formData, setFormData] = useState<typeof defaultSettings>(defaultSettings);
  const [newEmail, setNewEmail] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newEscalacaoEmail, setNewEscalacaoEmail] = useState('');

  useEffect(() => {
    if (settings) {
      setFormData({
        empresa_id: settings.empresa_id,
        email_enabled: settings.email_enabled,
        email_destinatarios: settings.email_destinatarios || [],
        whatsapp_enabled: settings.whatsapp_enabled,
        whatsapp_numeros: settings.whatsapp_numeros || [],
        webhook_enabled: settings.webhook_enabled,
        webhook_url: settings.webhook_url,
        auto_resolver_enabled: settings.auto_resolver_enabled,
        auto_resolver_horas: settings.auto_resolver_horas,
        agrupar_enabled: settings.agrupar_enabled,
        escalacao_enabled: settings.escalacao_enabled,
        escalacao_minutos: settings.escalacao_minutos,
        escalacao_destinatarios: settings.escalacao_destinatarios || [],
        notificar_severidades: settings.notificar_severidades || ['critical', 'warning'],
      });
    }
  }, [settings]);

  const handleSave = async () => {
    if (settings) {
      await updateSettings.mutateAsync({ id: settings.id, ...formData });
    } else {
      // Create new settings - need empresa_id from context
      // For super_admin, we'd need to select an empresa
      // For empresa_admin, use their empresa
      if (formData.empresa_id) {
        await createSettings.mutateAsync(formData as typeof formData & { empresa_id: string });
      }
    }
    onOpenChange(false);
  };

  const addEmail = () => {
    if (newEmail && !formData.email_destinatarios.includes(newEmail)) {
      setFormData(prev => ({
        ...prev,
        email_destinatarios: [...prev.email_destinatarios, newEmail],
      }));
      setNewEmail('');
    }
  };

  const removeEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      email_destinatarios: prev.email_destinatarios.filter(e => e !== email),
    }));
  };

  const addWhatsapp = () => {
    if (newWhatsapp && !formData.whatsapp_numeros.includes(newWhatsapp)) {
      setFormData(prev => ({
        ...prev,
        whatsapp_numeros: [...prev.whatsapp_numeros, newWhatsapp],
      }));
      setNewWhatsapp('');
    }
  };

  const removeWhatsapp = (numero: string) => {
    setFormData(prev => ({
      ...prev,
      whatsapp_numeros: prev.whatsapp_numeros.filter(n => n !== numero),
    }));
  };

  const addEscalacaoEmail = () => {
    if (newEscalacaoEmail && !formData.escalacao_destinatarios.includes(newEscalacaoEmail)) {
      setFormData(prev => ({
        ...prev,
        escalacao_destinatarios: [...prev.escalacao_destinatarios, newEscalacaoEmail],
      }));
      setNewEscalacaoEmail('');
    }
  };

  const removeEscalacaoEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      escalacao_destinatarios: prev.escalacao_destinatarios.filter(e => e !== email),
    }));
  };

  const toggleSeveridade = (severidade: string) => {
    setFormData(prev => ({
      ...prev,
      notificar_severidades: prev.notificar_severidades.includes(severidade)
        ? prev.notificar_severidades.filter(s => s !== severidade)
        : [...prev.notificar_severidades, severidade],
    }));
  };

  const handleTestWebhook = () => {
    if (formData.webhook_url) {
      testWebhook.mutate(formData.webhook_url);
    }
  };

  const isSaving = updateSettings.isPending || createSettings.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configurações de Alertas
          </DialogTitle>
          <DialogDescription>
            Configure como e quando você deseja receber notificações de alertas
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="canais">Canais</TabsTrigger>
              <TabsTrigger value="automacoes">Automações</TabsTrigger>
              <TabsTrigger value="escalacao">Escalação</TabsTrigger>
            </TabsList>

            {/* Tab: Canais */}
            <TabsContent value="canais" className="space-y-6 mt-4">
              {/* Email */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-base">Email</Label>
                      <p className="text-sm text-muted-foreground">
                        Receber alertas por email
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.email_enabled}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, email_enabled: checked }))
                    }
                  />
                </div>

                {formData.email_enabled && (
                  <div className="ml-7 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="email@exemplo.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={addEmail}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.email_destinatarios.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1">
                          {email}
                          <button onClick={() => removeEmail(email)} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Requer configuração da API Resend
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* WhatsApp */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-base">WhatsApp</Label>
                      <p className="text-sm text-muted-foreground">
                        Alertas críticos via WhatsApp
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.whatsapp_enabled}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, whatsapp_enabled: checked }))
                    }
                  />
                </div>

                {formData.whatsapp_enabled && (
                  <div className="ml-7 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder="+55 11 99999-9999"
                        value={newWhatsapp}
                        onChange={(e) => setNewWhatsapp(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addWhatsapp()}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={addWhatsapp}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.whatsapp_numeros.map((numero) => (
                        <Badge key={numero} variant="secondary" className="gap-1">
                          {numero}
                          <button onClick={() => removeWhatsapp(numero)} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Requer integração Z-API ou Twilio
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Webhook */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-base">Webhook</Label>
                      <p className="text-sm text-muted-foreground">
                        Integração com sistemas externos
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.webhook_enabled}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, webhook_enabled: checked }))
                    }
                  />
                </div>

                {formData.webhook_enabled && (
                  <div className="ml-7 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        placeholder="https://sua-api.com/webhook"
                        value={formData.webhook_url || ''}
                        onChange={(e) => 
                          setFormData(prev => ({ ...prev, webhook_url: e.target.value || null }))
                        }
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={handleTestWebhook}
                        disabled={!formData.webhook_url || testWebhook.isPending}
                      >
                        {testWebhook.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        <span className="ml-2">Testar</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab: Automações */}
            <TabsContent value="automacoes" className="space-y-6 mt-4">
              {/* Auto-resolver */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label className="text-base">Auto-resolução</Label>
                      <p className="text-sm text-muted-foreground">
                        Resolver alertas automaticamente após período
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.auto_resolver_enabled}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, auto_resolver_enabled: checked }))
                    }
                  />
                </div>

                {formData.auto_resolver_enabled && (
                  <div className="ml-7">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Resolver após</span>
                      <Input
                        type="number"
                        className="w-20"
                        min={1}
                        max={168}
                        value={formData.auto_resolver_horas}
                        onChange={(e) => 
                          setFormData(prev => ({ ...prev, auto_resolver_horas: parseInt(e.target.value) || 24 }))
                        }
                      />
                      <span className="text-sm">horas</span>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Agrupar alertas */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Agrupar alertas similares</Label>
                  <p className="text-sm text-muted-foreground">
                    Evita spam de notificações repetidas
                  </p>
                </div>
                <Switch
                  checked={formData.agrupar_enabled}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, agrupar_enabled: checked }))
                  }
                />
              </div>

              <Separator />

              {/* Filtro por severidade */}
              <div className="space-y-3">
                <Label className="text-base">Notificar apenas para</Label>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="sev-critical"
                      checked={formData.notificar_severidades.includes('critical')}
                      onCheckedChange={() => toggleSeveridade('critical')}
                    />
                    <label htmlFor="sev-critical" className="text-sm flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500"></span>
                      Crítico
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="sev-warning"
                      checked={formData.notificar_severidades.includes('warning')}
                      onCheckedChange={() => toggleSeveridade('warning')}
                    />
                    <label htmlFor="sev-warning" className="text-sm flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                      Aviso
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="sev-info"
                      checked={formData.notificar_severidades.includes('info')}
                      onCheckedChange={() => toggleSeveridade('info')}
                    />
                    <label htmlFor="sev-info" className="text-sm flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      Info
                    </label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab: Escalação */}
            <TabsContent value="escalacao" className="space-y-6 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Escalação automática</Label>
                    <p className="text-sm text-muted-foreground">
                      Notificar supervisores se não resolver a tempo
                    </p>
                  </div>
                  <Switch
                    checked={formData.escalacao_enabled}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, escalacao_enabled: checked }))
                    }
                  />
                </div>

                {formData.escalacao_enabled && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Escalar após</span>
                      <Input
                        type="number"
                        className="w-20"
                        min={5}
                        max={1440}
                        value={formData.escalacao_minutos}
                        onChange={(e) => 
                          setFormData(prev => ({ ...prev, escalacao_minutos: parseInt(e.target.value) || 30 }))
                        }
                      />
                      <span className="text-sm">minutos sem resolução</span>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Destinatários da escalação</Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="supervisor@exemplo.com"
                          value={newEscalacaoEmail}
                          onChange={(e) => setNewEscalacaoEmail(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addEscalacaoEmail()}
                        />
                        <Button type="button" variant="outline" size="icon" onClick={addEscalacaoEmail}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.escalacao_destinatarios.map((email) => (
                          <Badge key={email} variant="secondary" className="gap-1">
                            {email}
                            <button onClick={() => removeEscalacaoEmail(email)} className="ml-1 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
