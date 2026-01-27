
# Plano: Reestruturação da Página de Configurações

## Análise: Por que "API WiFi Manager" não faz sentido

Você está correto. Na arquitetura atual do NAVSPOT:

```text
Embarcação A ─── MikroTik A ─── sync_token próprio ─┐
                                                    │
Embarcação B ─── MikroTik B ─── sync_token próprio ─┼──► Edge Function mikrotik-sync
                                                    │
Embarcação C ─── MikroTik C ─── sync_token próprio ─┘
```

Cada hotspot já possui seu próprio `sync_token` gerado automaticamente e gerenciado na página de Embarcações/Hotspots. Não existe uma "API WiFi Manager" centralizada - esse card foi um placeholder que não representa a realidade do sistema.

---

## Nova Estrutura da Página

Vou manter apenas o que faz sentido e funciona:

| Card | Mantém? | Justificativa |
|------|---------|---------------|
| API WiFi Manager | REMOVE | Não existe - tokens são por hotspot |
| Alertas e Notificações | MANTÉM | Infraestrutura já existe (`notification_settings`) |
| Segurança | SIMPLIFICA | Manter apenas o que é implementável |
| Sistema | SIMPLIFICA | Mostrar informações reais do sistema |

---

## Funcionalidades a Implementar

### 1. Card: Alertas e Notificações (FUNCIONAL)

Conectar ao hook `useNotificationSettings` existente:

| Campo | Funciona? | Tabela |
|-------|-----------|--------|
| Email habilitado | Sim | `notification_settings.email_enabled` |
| Emails destinatários | Sim | `notification_settings.email_destinatarios` |
| WhatsApp habilitado | Sim | `notification_settings.whatsapp_enabled` |
| Números WhatsApp | Sim | `notification_settings.whatsapp_numeros` |
| Webhook habilitado | Sim | `notification_settings.webhook_enabled` |
| URL do Webhook | Sim | `notification_settings.webhook_url` |
| Testar Webhook | Sim | Hook `useTestWebhook` já existe |
| Severidades a notificar | Sim | `notification_settings.notificar_severidades` |

### 2. Card: Sistema (INFORMATIVO)

Mostrar dados reais em vez de hardcoded:

- Versão: Definir em variável de ambiente ou constante
- Quantidade de hotspots ativos
- Última sincronização (mais recente de todos os hotspots)
- Status geral do sistema

### 3. Card: Segurança (SIMPLIFICADO)

Manter apenas funcionalidades implementáveis:

- Alterar senha do usuário atual
- Informações sobre a sessão atual

**Remover** (complexidade desnecessária agora):
- 2FA (requer integração adicional)
- Timeout de sessão (gerenciado pelo Supabase)
- Auto-logout (idem)

---

## Acesso por Papel

| Papel | O que vê |
|-------|----------|
| `super_admin` | Visão geral do sistema + pode ver configs de todas empresas |
| `empresa_admin` | Configurações de notificação DA SUA empresa |
| `gerente_embarcacao` | Apenas visualização (sem edição) |

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/Configuracoes.tsx` | Reescrever completamente |
| `src/hooks/useNotificationSettings.ts` | Pequeno ajuste para filtrar por empresa |

---

## Nova UI Proposta

```text
+------------------------------------------------------------------+
| CONFIGURAÇÕES                                                     |
| Configure as preferências do sistema NAVSPOT                      |
+------------------------------------------------------------------+

+---------------------- ALERTAS E NOTIFICAÇÕES --------------------+
|                                                                   |
| CANAIS DE NOTIFICAÇÃO                                            |
|                                                                   |
| [x] Email                                                        |
|     Destinatários: [ admin@empresa.com, ti@empresa.com ]         |
|                                                                   |
| [ ] WhatsApp (em breve)                                          |
|     Números: [ +55 13 99999-9999 ]                               |
|                                                                   |
| [ ] Webhook                                                      |
|     URL: [ https://... ]                    [Testar Webhook]     |
|                                                                   |
| SEVERIDADES A NOTIFICAR                                          |
| [x] Crítico  [x] Aviso  [ ] Informativo                         |
|                                                                   |
|                                        [Salvar Notificações]     |
+-------------------------------------------------------------------+

+---------------------- CONTA E SEGURANÇA -------------------------+
|                                                                   |
| Email: admin@empresa.com                                         |
| Papel: Administrador da Empresa                                  |
| Empresa: Navegação ABC Ltda                                      |
|                                                                   |
|                                           [Alterar Senha]        |
+-------------------------------------------------------------------+

+---------------------- INFORMAÇÕES DO SISTEMA --------------------+
|                                                                   |
| Versão: v1.0.0                                                   |
| Hotspots ativos: 3/5                                             |
| Última sincronização: há 5 minutos                               |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## Seção Técnica

### Conexão com hooks existentes

```typescript
// Página usará hooks já criados
import { 
  useNotificationSettings, 
  useUpdateNotificationSettings,
  useTestWebhook 
} from '@/hooks/useNotificationSettings';

export default function Configuracoes() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const testWebhook = useTestWebhook();

  // Estado local para o formulário
  const [emailEnabled, setEmailEnabled] = useState(settings?.email_enabled ?? true);
  const [emailDestinatarios, setEmailDestinatarios] = useState<string[]>(settings?.email_destinatarios ?? []);
  // ... outros campos

  const handleSave = () => {
    if (settings?.id) {
      updateSettings.mutate({
        id: settings.id,
        email_enabled: emailEnabled,
        email_destinatarios: emailDestinatarios,
        // ... outros campos
      });
    }
  };
}
```

### Ajuste no hook para filtrar por empresa

O hook atual não filtra por `empresa_id`. Precisamos ajustar:

```typescript
export function useNotificationSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-settings', user?.empresa_id],
    queryFn: async () => {
      let query = supabase.from('notification_settings').select('*');
      
      // Para empresa_admin e gerente, filtrar pela empresa
      if (user?.empresa_id) {
        query = query.eq('empresa_id', user.empresa_id);
      }
      
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
```

### Criação automática de settings

Se a empresa não tem configurações ainda, criar com valores padrão:

```typescript
// Ao carregar, se não existir, criar
useEffect(() => {
  if (!isLoading && !settings && user?.empresa_id) {
    createSettings.mutate({
      empresa_id: user.empresa_id,
      email_enabled: true,
      email_destinatarios: [user.email],
      whatsapp_enabled: false,
      whatsapp_numeros: [],
      webhook_enabled: false,
      webhook_url: null,
      notificar_severidades: ['critical', 'warning'],
    });
  }
}, [isLoading, settings, user]);
```

---

## Resumo das Mudanças

1. **REMOVER** card "API WiFi Manager" (não existe no sistema)
2. **IMPLEMENTAR** card de Notificações conectado ao banco
3. **SIMPLIFICAR** card de Segurança (apenas alterar senha)
4. **MOSTRAR** informações reais do sistema
5. **AJUSTAR** hook para filtrar por empresa
6. **CRIAR** settings automaticamente se não existir
