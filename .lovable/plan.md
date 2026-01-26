

# Plano: Correção Completa do Sistema de Alertas e Notificações

## Diagnóstico Detalhado

Após análise do código, identifiquei **múltiplos problemas graves**:

### Problemas Encontrados

| Componente | Status | Descrição |
|-----------|--------|-----------|
| Botão "Atualizar" | Funcionando | Chama `refetch()` corretamente |
| Botão "Configurar Alertas" | **NÃO FUNCIONA** | Botão sem `onClick`, apenas decorativo |
| Badge "Configurar" (Webhook) | **NÃO FUNCIONA** | Apenas texto estático, sem ação |
| Badge "Configurar" (Escalação) | **NÃO FUNCIONA** | Apenas texto estático, sem ação |
| Notificações por Email | **NÃO EXISTE** | Não há edge function nem integração |
| Notificações por WhatsApp | **NÃO EXISTE** | Não há edge function nem integração |
| Ícone do Sininho (Bell) | **NÃO FUNCIONA** | Badge estático "3", sem dados reais |

### Evidências no Código

```typescript
// Alertas.tsx - linha 147-150
<Button variant="outline">
  <Settings className="h-4 w-4 mr-2" />
  Configurar Alertas  // ❌ Sem onClick!
</Button>

// Alertas.tsx - linhas 503-505, 538-540
<Badge className="bg-muted text-muted-foreground">
  Configurar  // ❌ Apenas texto estático!
</Badge>

// Configuracoes.tsx - Switches sem estado
<Switch defaultChecked />  // ❌ Não salva em lugar nenhum!
```

---

## Arquitetura da Solução

```text
+------------------------------------------------------------------+
|                      SISTEMA DE NOTIFICAÇÕES                      |
+------------------------------------------------------------------+
|                                                                  |
|  [TABELA: notification_settings]                                 |
|  - empresa_id, email_enabled, whatsapp_enabled, webhook_enabled  |
|  - email_destinatarios, whatsapp_numero, webhook_url             |
|  - escalacao_minutos, auto_resolver_horas                        |
|                                                                  |
|  [EDGE FUNCTION: send-alert-notification]                        |
|  - Dispara quando alerta crítico é criado                        |
|  - Envia para canais configurados (Email/WhatsApp/Webhook)       |
|                                                                  |
|  [TRIGGER: on_alerta_insert]                                     |
|  - Detecta novos alertas críticos                                |
|  - Chama edge function para notificar                            |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Parte 1: Tabela de Configurações de Notificação

### Migração: `notification_settings`

```sql
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  
  -- Canais
  email_enabled BOOLEAN DEFAULT true,
  email_destinatarios TEXT[], -- Array de emails
  
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_numeros TEXT[], -- Array de números
  
  webhook_enabled BOOLEAN DEFAULT false,
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Configurações Automáticas
  auto_resolver_enabled BOOLEAN DEFAULT false,
  auto_resolver_horas INTEGER DEFAULT 24,
  
  agrupar_enabled BOOLEAN DEFAULT true,
  agrupar_intervalo_minutos INTEGER DEFAULT 5,
  
  escalacao_enabled BOOLEAN DEFAULT false,
  escalacao_minutos INTEGER DEFAULT 30,
  escalacao_destinatarios TEXT[],
  
  -- Filtros
  notificar_severidades TEXT[] DEFAULT ARRAY['critical', 'warning'],
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(empresa_id)
);
```

---

## Parte 2: Modal de Configuração de Alertas

### Arquivo: `src/components/modals/AlertSettingsModal.tsx`

Modal completo com abas para:

```text
+------------------------------------------+
| CONFIGURAÇÕES DE ALERTAS            [X]  |
+------------------------------------------+
| [Canais] [Automações] [Escalação]        |
+------------------------------------------+
|                                          |
| CANAIS DE NOTIFICAÇÃO                    |
|                                          |
| ☑ Email                                  |
|   [ admin@empresa.com                  ] |
|   [ + Adicionar email ]                  |
|                                          |
| ☐ WhatsApp                               |
|   [ +55 11 99999-9999                  ] |
|   (Requer integração Twilio/Z-API)       |
|                                          |
| ☐ Webhook                                |
|   [ https://minha-api.com/webhook      ] |
|   [ Testar Webhook ]                     |
|                                          |
+------------------------------------------+
| [Cancelar]               [Salvar]        |
+------------------------------------------+
```

### Funcionalidades do Modal

1. **Aba Canais**:
   - Toggle para Email, WhatsApp, Webhook
   - Campos para configurar destinatários
   - Botão "Testar" para webhook

2. **Aba Automações**:
   - Auto-resolução após X horas
   - Agrupamento de alertas similares
   - Filtro por severidade

3. **Aba Escalação**:
   - Ativar escalação
   - Tempo até escalar (minutos)
   - Destinatários para escalação

---

## Parte 3: Hook para Configurações

### Arquivo: `src/hooks/useNotificationSettings.ts`

```typescript
interface NotificationSettings {
  id: string;
  empresa_id: string;
  email_enabled: boolean;
  email_destinatarios: string[];
  whatsapp_enabled: boolean;
  whatsapp_numeros: string[];
  webhook_enabled: boolean;
  webhook_url: string | null;
  // ... demais campos
}

useNotificationSettings()
- Busca configurações da empresa do usuário
- Cria registro padrão se não existir

useUpdateNotificationSettings()
- Atualiza configurações
- Valida campos obrigatórios
- Toast de sucesso/erro
```

---

## Parte 4: Edge Function para Notificações

### Arquivo: `supabase/functions/send-alert-notification/index.ts`

```typescript
// Recebe alerta e configurações
// Envia para canais ativos:
// - Email: via Resend (precisa API key)
// - WhatsApp: via Z-API ou Twilio (precisa integração)
// - Webhook: HTTP POST para URL configurada

// Por enquanto, implementar apenas:
// ✅ Webhook (não precisa de API externa)
// ⚠️ Email (precisa RESEND_API_KEY)
// ⚠️ WhatsApp (precisa integração Z-API/Twilio)
```

### Implementação Inicial (Webhook apenas)

O webhook é a única funcionalidade que pode ser implementada sem dependências externas:

```typescript
Deno.serve(async (req) => {
  const { alerta, settings } = await req.json();
  
  if (settings.webhook_enabled && settings.webhook_url) {
    await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'alert',
        alerta,
        timestamp: new Date().toISOString(),
      }),
    });
  }
  
  return new Response(JSON.stringify({ success: true }));
});
```

---

## Parte 5: Sininho (Bell Icon) Funcional

### Arquivos a criar/modificar

1. **`src/hooks/useNotifications.ts`**
   - Busca alertas não resolvidos
   - Retorna contagem e lista

2. **`src/components/NotificationsDropdown.tsx`**
   - Dropdown com lista de alertas
   - Badge dinâmico com contagem real
   - Ações rápidas (resolver, ver todos)

3. **`src/components/AppLayout.tsx`**
   - Integrar NotificationsDropdown no header

---

## Parte 6: Atualizar Página de Alertas

### Modificações em `src/pages/Alertas.tsx`

1. **Botão "Configurar Alertas"**: Abrir AlertSettingsModal
2. **Badge "Configurar" (Webhook)**: Abrir modal na aba Canais
3. **Badge "Configurar" (Escalação)**: Abrir modal na aba Escalação
4. **Status dinâmico**: Mostrar status real baseado em notification_settings

---

## Resumo de Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração `notification_settings` | Criar | Tabela de configurações |
| `src/hooks/useNotificationSettings.ts` | Criar | CRUD de configurações |
| `src/hooks/useNotifications.ts` | Criar | Dados do sininho |
| `src/components/modals/AlertSettingsModal.tsx` | Criar | Modal de configuração |
| `src/components/NotificationsDropdown.tsx` | Criar | Dropdown do sininho |
| `supabase/functions/send-alert-notification/` | Criar | Edge function webhook |
| `src/pages/Alertas.tsx` | Modificar | Integrar modal e ações |
| `src/components/AppLayout.tsx` | Modificar | Integrar sininho funcional |
| `src/pages/Configuracoes.tsx` | Modificar | Integrar com settings reais |

---

## Limitações e Dependências Externas

### Email (Resend)

Para enviar emails reais, preciso:
1. Você criar conta em resend.com
2. Validar seu domínio
3. Fornecer a `RESEND_API_KEY`

Sem isso, o toggle de email ficará visual mas não enviará emails.

### WhatsApp (Z-API ou Twilio)

Para WhatsApp real, preciso:
- Conta Z-API ou Twilio
- Credenciais de API

**Recomendação**: Deixar WhatsApp desativado por enquanto e focar em Email + Webhook.

---

## Ordem de Implementação

1. **Migração de banco** - Tabela notification_settings
2. **Hook useNotificationSettings** - CRUD configurações
3. **AlertSettingsModal** - UI de configuração
4. **Atualizar Alertas.tsx** - Integrar botões com modal
5. **Hook useNotifications** - Dados do sininho
6. **NotificationsDropdown** - UI do sininho
7. **Atualizar AppLayout.tsx** - Integrar dropdown
8. **Edge Function webhook** - Envio via webhook
9. **(Opcional) Email** - Se fornecer RESEND_API_KEY

---

## Seção Técnica

### Schema da Tabela

```sql
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE UNIQUE,
  
  email_enabled BOOLEAN DEFAULT true,
  email_destinatarios TEXT[] DEFAULT '{}',
  
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_numeros TEXT[] DEFAULT '{}',
  
  webhook_enabled BOOLEAN DEFAULT false,
  webhook_url TEXT,
  
  auto_resolver_enabled BOOLEAN DEFAULT false,
  auto_resolver_horas INTEGER DEFAULT 24,
  
  agrupar_enabled BOOLEAN DEFAULT true,
  
  escalacao_enabled BOOLEAN DEFAULT false,
  escalacao_minutos INTEGER DEFAULT 30,
  escalacao_destinatarios TEXT[] DEFAULT '{}',
  
  notificar_severidades TEXT[] DEFAULT ARRAY['critical', 'warning'],
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access"
ON public.notification_settings FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Empresa admin manage own settings"
ON public.notification_settings FOR ALL
USING (empresa_id = get_user_empresa_id(auth.uid()));
```

### Interface NotificationSettings

```typescript
interface NotificationSettings {
  id: string;
  empresa_id: string | null;
  email_enabled: boolean;
  email_destinatarios: string[];
  whatsapp_enabled: boolean;
  whatsapp_numeros: string[];
  webhook_enabled: boolean;
  webhook_url: string | null;
  auto_resolver_enabled: boolean;
  auto_resolver_horas: number;
  agrupar_enabled: boolean;
  escalacao_enabled: boolean;
  escalacao_minutos: number;
  escalacao_destinatarios: string[];
  notificar_severidades: string[];
}
```

