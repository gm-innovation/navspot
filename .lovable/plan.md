
# Sistema de Alertas Funcional

## Situacao Atual

O sistema de alertas existe parcialmente:
- Tabela `alertas` configurada com RLS policies
- Hook `useRecentAlerts` disponivel em `useDashboard.ts`
- Pagina `Alertas.tsx` usa dados mockados (hardcoded)
- Nenhuma geracao automatica de alertas implementada
- Edge Function `mikrotik-sync` nao cria alertas

## Implementacao Proposta

### Fase 1: Hook Dedicado para Alertas

Criar `src/hooks/useAlertas.ts` com operacoes completas:

```typescript
// Funcionalidades do hook
- useAlertas(filters) - Listar com filtros (severidade, tipo, status)
- useAlertasStats() - Estatisticas agregadas
- useResolveAlerta() - Marcar como resolvido
- useDeleteAlerta() - Excluir alerta
```

### Fase 2: Pagina Alertas com Dados Reais

Refatorar `src/pages/Alertas.tsx`:

| Componente | Antes | Depois |
|------------|-------|--------|
| Lista de alertas | Array mockado | Query do banco de dados |
| Cards de estatisticas | Numeros fixos | Contagens dinamicas |
| Botao resolver | Sem funcao | Mutation para resolver |
| Filtros | Nenhum | Por severidade, tipo, data |
| Paginacao | Nenhuma | Scroll infinito ou paginacao |

### Fase 3: Geracao Automatica de Alertas

Adicionar criacao de alertas na Edge Function `mikrotik-sync`:

**Tipos de alertas automaticos:**

1. **Hotspot Offline** (critical)
   - Quando hotspot muda status de online para offline
   - Trigger: falta de sync por tempo configurado

2. **Violacao de Dispositivos** (warning)
   - Quando usuario excede limite de dispositivos
   - Ja detectado no mikrotik-sync

3. **Falha de Sincronizacao** (critical)
   - Quando sync falha com erro
   - Registrar no catch da funcao

4. **Limite de Quota** (warning)
   - Quando tripulante atinge 80%/100% da quota
   - Verificar bytes_consumidos vs limite_dados_mb

### Fase 4: Realtime para Alertas

Habilitar Supabase Realtime na tabela alertas:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas;
```

Adicionar hook de realtime:

```typescript
// Em useRealtimeSubscription.ts
export function useAlertasRealtime() {
  useRealtimeSubscription([{
    table: 'alertas',
    queryKey: ['alertas'],
    showToast: true,
    toastMessages: {
      INSERT: 'Novo alerta recebido!',
    },
  }]);
}
```

### Fase 5: Edge Function para Monitoramento

Criar funcao de verificacao periodica:

**`supabase/functions/monitor-hotspots/index.ts`**

Funcionalidades:
- Verificar hotspots sem sync por mais de X minutos
- Criar alertas de "Hotspot Offline"
- Auto-resolver alertas quando hotspot volta online
- Pode ser chamada via CRON/scheduler externo

## Detalhamento Tecnico

### Estrutura do Hook useAlertas

```typescript
interface AlertaFilters {
  severidade?: 'info' | 'warning' | 'critical';
  tipo?: string;
  resolvido?: boolean;
  empresa_id?: string;
  embarcacao_id?: string;
  hotspot_id?: string;
}

interface Alerta {
  id: string;
  tipo: string;
  mensagem: string;
  severidade: string;
  resolvido: boolean;
  created_at: string;
  resolvido_at: string | null;
  empresa?: { nome: string };
  embarcacao?: { nome: string };
  hotspot?: { nome: string };
  tripulante?: { nome: string };
}
```

### Tipos de Alertas Suportados

| tipo | severidade | Descricao |
|------|------------|-----------|
| `hotspot_offline` | critical | Hotspot sem comunicacao |
| `sync_failure` | critical | Falha na sincronizacao |
| `device_limit` | warning | Limite de dispositivos excedido |
| `quota_warning` | warning | 80% da quota atingida |
| `quota_exceeded` | critical | 100% da quota atingida |
| `new_registration` | info | Nova embarcacao/tripulante |
| `session_anomaly` | warning | Comportamento suspeito |

### Modificacoes na Edge Function mikrotik-sync

Adicionar criacao de alertas em pontos-chave:

```typescript
// 1. Violacao de dispositivos (ja detectada)
if (deviceViolations.length > 0) {
  for (const violation of deviceViolations) {
    await supabase.from('alertas').insert({
      tipo: 'device_limit',
      severidade: 'warning',
      mensagem: `${violation.user} excedeu limite: ${violation.current_count}/${violation.max_allowed} dispositivos`,
      hotspot_id: hotspot.id,
      embarcacao_id: hotspot.embarcacao_id,
      empresa_id: embarcacao?.empresa_id
    });
  }
}

// 2. Hotspot voltou online (auto-resolver alertas)
if (hotspot.status === 'offline') {
  await supabase.from('alertas')
    .update({ resolvido: true, resolvido_at: new Date().toISOString() })
    .eq('hotspot_id', hotspot.id)
    .eq('tipo', 'hotspot_offline')
    .eq('resolvido', false);
}
```

### Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/hooks/useAlertas.ts` | Criar | Hook CRUD para alertas |
| `src/pages/Alertas.tsx` | Modificar | Usar dados reais |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Gerar alertas automaticos |
| Migracao SQL | Criar | Habilitar realtime |
| `src/hooks/useRealtimeSubscription.ts` | Modificar | Adicionar useAlertasRealtime |

### Funcionalidades da Pagina Refatorada

1. **Header com estatisticas**
   - Total de alertas hoje
   - Alertas criticos ativos
   - Alertas resolvidos

2. **Filtros**
   - Por severidade (todos, info, warning, critical)
   - Por status (todos, ativos, resolvidos)
   - Por data (hoje, ultimos 7 dias, mes)

3. **Lista de alertas**
   - Ordenada por data (mais recentes primeiro)
   - Badge de severidade colorido
   - Badge de status (ativo/resolvido)
   - Botao para resolver
   - Link para entidade relacionada

4. **Acoes em lote**
   - Resolver todos os selecionados
   - Excluir alertas antigos

5. **Realtime**
   - Novos alertas aparecem automaticamente
   - Toast notification para alertas criticos

## Ordem de Implementacao

1. **Migracao**: Habilitar realtime na tabela alertas
2. **Hook useAlertas**: CRUD completo com filtros
3. **Pagina Alertas**: Substituir mocks por dados reais
4. **mikrotik-sync**: Adicionar geracao de alertas
5. **Realtime hook**: Notificacoes em tempo real
6. **Testes**: Simular cenarios de alerta
