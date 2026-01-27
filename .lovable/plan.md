
# Plano de Melhorias: NAVSPOT

## 1. Página de Ações Pendentes MikroTik

### Objetivo
Criar uma página para monitorar todas as ações pendentes de sincronização com o MikroTik, permitindo visualizar status, retry manual e exclusão.

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/AcoesPendentes.tsx` | Criar página completa |
| `src/App.tsx` | Adicionar rota `/acoes-pendentes` |
| `src/components/AppSidebar.tsx` | Adicionar item no menu Administração |
| `src/hooks/useAcoesPendentes.ts` | Adicionar hook de retry e filtros |

### Componentes da Página

```text
┌─────────────────────────────────────────────────────────────────┐
│  Ações Pendentes MikroTik                      [Atualizar]      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │    12    │ │    45    │ │     3    │ │   98.5%  │           │
│  │ Pendentes│ │Executadas│ │  Falhas  │ │ Sucesso  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│  Filtros: [Status ▼] [Tipo ▼] [Hotspot ▼]                      │
├─────────────────────────────────────────────────────────────────┤
│  Status    │ Tipo           │ Hotspot      │ Criado   │ Ações  │
│  ● Pendente│ create_user    │ Sonda NS-01  │ 2 min    │ ⟳  🗑  │
│  ✓ Feito   │ add_profile    │ Sonda NS-01  │ 5 min    │     🗑  │
│  ✗ Erro    │ block_device   │ Sonda NS-02  │ 10 min   │ ⟳  🗑  │
└─────────────────────────────────────────────────────────────────┘
```

### Funcionalidades
- **Métricas em cards**: Pendentes, Executadas (hoje), Falhas, Taxa de sucesso
- **Filtros**: Status (pendente/executado/erro), Tipo de ação, Hotspot
- **Tabela com colunas**: Status (badge colorido), Tipo, Payload resumido, Hotspot, Tentativas, Criado há, Ações
- **Ações por linha**: Retry (recriar ação pendente), Excluir
- **Realtime**: Atualização via Supabase Realtime
- **Acessível por**: super_admin e empresa_admin

### Hook useAcoesPendentes - Melhorias

```typescript
// Adicionar ao hook existente:

// Buscar estatísticas
export function useAcoesPendentesStats() {
  return useQuery({
    queryKey: ['acoes_pendentes_stats'],
    queryFn: async () => {
      const { data } = await supabase.from('acoes_pendentes').select('status');
      return {
        pendentes: data?.filter(a => a.status === 'pendente').length || 0,
        executadas: data?.filter(a => a.status === 'executado').length || 0,
        erros: data?.filter(a => a.status === 'erro').length || 0,
      };
    },
  });
}

// Retry de ação (recriar como pendente)
export function useRetryAcaoPendente() {
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('acoes_pendentes')
        .update({ status: 'pendente', tentativas: 0, erro_mensagem: null })
        .eq('id', id);
    },
  });
}
```

---

## 2. Validação MikroTik com Hardware

### Objetivo
Documentar e validar que todas as 12+ ações funcionam corretamente em um MikroTik físico.

### Checklist de Validação

| Ação | Comando MikroTik Esperado | Validar |
|------|---------------------------|---------|
| `create_user` | `/ip hotspot user add name=X password=Y profile=Z` | [ ] |
| `remove_user` | `/ip hotspot user remove [find name=X]` | [ ] |
| `disable_user` | `/ip hotspot user disable [find name=X]` | [ ] |
| `enable_user` | `/ip hotspot user enable [find name=X]` | [ ] |
| `update_password` | `/ip hotspot user set [find name=X] password=Y` | [ ] |
| `update_user_profile` | `/ip hotspot user set [find name=X] profile=Y` | [ ] |
| `kick_session` | `/ip hotspot active remove [find user=X]` | [ ] |
| `block_device` | Adicionar MAC à blacklist | [ ] |
| `unblock_device` | Remover MAC da blacklist | [ ] |
| `add_profile` | `/ip hotspot user profile add name=X rate-limit=Y` | [ ] |
| `update_profile_config` | `/ip hotspot user profile set [find name=X] ...` | [ ] |
| `remove_profile` | `/ip hotspot user profile remove [find name=X]` | [ ] |

### Processo de Validação

1. **Preparar ambiente**
   - Gerar script RSC para hotspot de teste
   - Instalar script no MikroTik via Winbox/SSH

2. **Testar ciclo completo**
   - Criar tripulante na UI → Verificar ação pendente → Aguardar sync → Verificar usuário no MikroTik
   - Editar senha → Verificar ação → Verificar mudança no MikroTik
   - Excluir tripulante → Verificar remoção

3. **Testar casos de erro**
   - O que acontece se ação falha? (retry automático)
   - Ações duplicadas são tratadas?

### Arquivos a Revisar

| Arquivo | Verificar |
|---------|-----------|
| `mikrotik-script-generator/index.ts` | Action processor suporta todas as ações |
| `mikrotik-sync/index.ts` | Formato pipe-delimited correto para cada ação |

---

## 3. Testes Automatizados

### Objetivo
Configurar Vitest e criar testes unitários para os hooks críticos de sincronização.

### Setup Inicial

| Arquivo | Ação |
|---------|------|
| `vitest.config.ts` | Criar configuração |
| `src/test/setup.ts` | Criar setup file com mocks |
| `tsconfig.app.json` | Adicionar tipos vitest |
| `package.json` | Já tem dependências (vitest, @testing-library) |

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### src/test/setup.ts

```typescript
import "@testing-library/jest-dom";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));
```

### Testes Prioritários

| Arquivo de Teste | Testar |
|------------------|--------|
| `src/hooks/useMikrotikSync.test.ts` | `toProfileSlug()`, `createMikrotikAction()` |
| `src/hooks/useAcoesPendentes.test.ts` | Queries e mutations |
| `src/components/ActionStatusBadge.test.tsx` | Renderização por status |
| `src/components/StatusBadge.test.tsx` | Renderização por status |

### Exemplo: useMikrotikSync.test.ts

```typescript
import { describe, it, expect, vi } from 'vitest';
import { toProfileSlug } from './useMikrotikSync';

describe('useMikrotikSync', () => {
  describe('toProfileSlug', () => {
    it('converts profile name to slug', () => {
      expect(toProfileSlug('Tripulação Padrão')).toBe('tripulacao-padrao');
    });

    it('handles accents correctly', () => {
      expect(toProfileSlug('Comandante Sênior')).toBe('comandante-senior');
    });

    it('removes special characters', () => {
      expect(toProfileSlug('Perfil @#$ Teste!')).toBe('perfil--teste');
    });
  });
});
```

### tsconfig.app.json - Modificação

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"],
    // ... resto existente
  }
}
```

---

## 4. Auto-resolver Alertas

### Objetivo
Resolver automaticamente alertas antigos baseado na configuração da empresa (`auto_resolver_enabled`, `auto_resolver_horas`).

### Abordagem
Criar Edge Function executada periodicamente via pg_cron.

### Arquivos a Criar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/auto-resolve-alerts/index.ts` | Criar função |
| `supabase/config.toml` | Registrar função |

### Edge Function: auto-resolve-alerts

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Buscar todas as configurações com auto_resolver ativo
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('empresa_id, auto_resolver_horas')
    .eq('auto_resolver_enabled', true);

  if (!settings || settings.length === 0) {
    return new Response(JSON.stringify({ resolved: 0 }));
  }

  let totalResolved = 0;

  for (const setting of settings) {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - setting.auto_resolver_horas);

    // Resolver alertas antigos dessa empresa
    const { count } = await supabase
      .from('alertas')
      .update({ 
        resolvido: true, 
        resolvido_at: new Date().toISOString() 
      })
      .eq('empresa_id', setting.empresa_id)
      .eq('resolvido', false)
      .lt('created_at', cutoffTime.toISOString())
      .select('id', { count: 'exact', head: true });

    totalResolved += count || 0;
    console.log(`Auto-resolved ${count} alerts for empresa ${setting.empresa_id}`);
  }

  return new Response(JSON.stringify({ resolved: totalResolved }));
});
```

### Agendamento via pg_cron

Executar a cada hora:

```sql
SELECT cron.schedule(
  'auto-resolve-alerts',
  '0 * * * *', -- A cada hora
  $$
  SELECT net.http_post(
    url:='https://focqrhkozhdefohroqyi.supabase.co/functions/v1/auto-resolve-alerts',
    headers:='{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body:='{}'::jsonb
  )
  $$
);
```

---

## 5. Agrupar Alertas Similares

### Objetivo
Evitar envio de múltiplas notificações para alertas similares em curto período (ex: hotspot offline oscilando).

### Abordagem
Modificar a Edge Function `send-alert-notification` para verificar alertas recentes antes de notificar.

### Lógica de Agrupamento

```typescript
// Em send-alert-notification/index.ts, adicionar antes de enviar:

if (notificationSettings.agrupar_enabled) {
  // Verificar se já existe alerta similar não resolvido nas últimas 2 horas
  const { data: recentSimilar } = await supabase
    .from('alertas')
    .select('id')
    .eq('tipo', payload.tipo)
    .eq('hotspot_id', payload.hotspot_id)
    .eq('resolvido', false)
    .neq('id', payload.alerta_id) // Não é o alerta atual
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentSimilar && recentSimilar.length > 0) {
    console.log('Similar alert exists, skipping notification');
    return new Response(
      JSON.stringify({ success: true, message: 'Grouped with existing alert' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
```

### Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/send-alert-notification/index.ts` | Adicionar lógica de agrupamento |

---

## Resumo de Implementação

| # | Melhoria | Prioridade | Esforço | Arquivos |
|---|----------|------------|---------|----------|
| 1 | Página Ações Pendentes | Alta | 4-5h | 4 arquivos |
| 2 | Validação MikroTik | Alta | 2-4h | Documentação + testes manuais |
| 3 | Testes Automatizados | Média | 4-6h | 5+ arquivos |
| 4 | Auto-resolver Alertas | Média | 2h | 2 arquivos + SQL |
| 5 | Agrupar Alertas | Baixa | 1h | 1 arquivo |

---

## Ordem de Execução Sugerida

```text
Fase 1 (Prioridade Alta):
├── 1. Página de Ações Pendentes (4-5h)
│   └── Essencial para monitorar sincronização
└── 2. Validação MikroTik (2-4h)
    └── Confirmar funcionamento com hardware

Fase 2 (Prioridade Média):
├── 3. Testes Automatizados (4-6h)
│   └── Garantir qualidade do código
└── 4. Auto-resolver Alertas (2h)
    └── Reduzir ruído de alertas antigos

Fase 3 (Finalização):
└── 5. Agrupar Alertas (1h)
    └── Melhorar experiência de notificações
```

---

## Detalhes Técnicos Adicionais

### Dependências Existentes
- Vitest: Já instalado no package.json
- @testing-library/react: Já instalado
- Supabase Realtime: Já configurado

### Permissões de Acesso
- Página de Ações Pendentes: super_admin, empresa_admin
- Auto-resolver: Executa via service_role (sem RLS)

### Considerações de Performance
- Página de ações: Limitar a 100 registros por página
- Auto-resolver: Executar a cada hora para não sobrecarregar
- Agrupamento: Cache de 2 horas para alertas similares
