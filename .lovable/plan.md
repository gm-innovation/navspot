

# Hardening mikrotik-sync v7.8.7: Batching + Handshake ACK + Retry Counter + Fix Quota

## Bugs Confirmados

### Bug 1: Quota bloqueada a 68.9%
O Alexandre tem 344MB consumidos com limite de 500MB (68.9%), mas esta `bloqueado`. O historico mostra que o `limite_dados_mb` foi aumentado progressivamente (100 -> 200 -> 300 -> 400 -> 500MB). O bloqueio ocorreu quando o limite era menor, mas o sistema **nunca reavalia e desbloqueia** o tripulante quando o limite sobe.

### Bug 2: Fire-and-forget sem retry
Acoes sao marcadas como `executado` imediatamente ao enviar, sem confirmacao do MikroTik.

### Bug 3: Sem cap global de acoes
Acoes sinteticas (kick, block_quota, profiles) sao injetadas alem do `limit(50)` da query.

## Alteracoes

### 1. Migration SQL

Adicionar coluna `batch_id` e atualizar constraint de status para incluir `enviado`:

```sql
-- Adicionar batch_id para handshake ACK
ALTER TABLE acoes_pendentes ADD COLUMN IF NOT EXISTS batch_id text;

-- Atualizar constraint para incluir status 'enviado'
ALTER TABLE acoes_pendentes DROP CONSTRAINT IF EXISTS acoes_pendentes_status_check;
ALTER TABLE acoes_pendentes ADD CONSTRAINT acoes_pendentes_status_check 
  CHECK (status IN ('pendente', 'enviado', 'executado', 'erro'));
```

### 2. Desbloquear Alexandre (acao imediata via SQL)

O tripulante esta com 68.9% de quota mas status `bloqueado`. Precisa ser desbloqueado:

```sql
UPDATE tripulantes 
SET status = 'ativo', bloqueio_motivo = NULL, bloqueado_at = NULL 
WHERE login_wifi = 'alexandre.silva' AND status = 'bloqueado';
```

### 3. Alteracoes no `mikrotik-sync/index.ts`

**a) Version bump**: `7.1.65` para `7.8.7`

**b) Interface SyncPayload**: Adicionar `last_batch_applied?: string`

**c) Handler ACK (apos linha 690)**: Quando o MikroTik enviar `last_batch_applied`, marcar acoes daquele batch como `executado`:

```typescript
if (payload.last_batch_applied) {
  await supabase
    .from('acoes_pendentes')
    .update({ status: 'executado' })
    .eq('batch_id', payload.last_batch_applied)
    .eq('hotspot_id', hotspot.id)
    .eq('status', 'enviado')
  console.log(`[mikrotik-sync] v7.8.7: Confirmed batch ${payload.last_batch_applied}`)
}
```

**d) Retry counter (apos handler ACK)**: Acoes `enviado` sem ACK por 3+ ciclos mudam para `erro`:

```typescript
// v7.8.7: Increment retry counter for unconfirmed actions
await supabase
  .from('acoes_pendentes')
  .update({ tentativas: supabase.rpc('increment_field', ...) }) // usar raw increment
  // Simplificado: buscar enviados, incrementar, e marcar erro se tentativas >= 3

const { data: staleActions } = await supabase
  .from('acoes_pendentes')
  .select('id, tentativas')
  .eq('hotspot_id', hotspot.id)
  .eq('status', 'enviado')

for (const action of (staleActions || [])) {
  const newTentativas = (action.tentativas || 0) + 1
  if (newTentativas >= 3) {
    await supabase.from('acoes_pendentes')
      .update({ status: 'erro', tentativas: newTentativas, erro_mensagem: 'ACK timeout (3 attempts)' })
      .eq('id', action.id)
  } else {
    await supabase.from('acoes_pendentes')
      .update({ tentativas: newTentativas })
      .eq('id', action.id)
  }
}
```

**e) Query de busca**: Incluir `enviado` para retry, com limite reduzido a 15:

```typescript
const { data: pendingActions } = await supabase
  .from('acoes_pendentes')
  .select('id, tipo, payload')
  .eq('hotspot_id', hotspot.id)
  .in('status', ['pendente', 'enviado'])
  .order('created_at', { ascending: true })
  .limit(15)
```

**f) Marcacao como `enviado` (nao `executado`)**: Gerar `batch_id` e marcar acoes como `enviado`:

```typescript
const batchId = crypto.randomUUID().slice(0, 8)

if (actionIds.length > 0) {
  await supabase
    .from('acoes_pendentes')
    .update({ 
      status: 'enviado', 
      batch_id: batchId,
      executed_at: new Date().toISOString() 
    })
    .in('id', actionIds)
}
```

**g) Cap global de 15 acoes** (antes da marcacao):

```typescript
const MAX_ACTIONS_PER_SYNC = 15
if (expandedActions.length > MAX_ACTIONS_PER_SYNC) {
  console.warn(`[mikrotik-sync] v7.8.7: Capping from ${expandedActions.length} to ${MAX_ACTIONS_PER_SYNC}`)
  expandedActions = expandedActions.slice(0, MAX_ACTIONS_PER_SYNC)
}
```

**h) batch_id no JSON de resposta**:

```typescript
const jsonBody = JSON.stringify({
  pending_actions_pipe: formattedPipe,
  batch_id: batchId,  // v7.8.7: For ACK handshake
  success: true,
  ...
})
```

**i) Auto-desbloqueio de quota** (no loop de active_users, apos calcular percentage):

Quando um tripulante esta `bloqueado` com `bloqueio_motivo = 'quota_exceeded'` mas o percentage atual e < 100%, desbloquear automaticamente:

```typescript
// v7.8.7: Auto-unblock if quota was increased and user is now below limit
if (tripulante.status === 'bloqueado' && 
    tripulante.bloqueio_motivo === 'quota_exceeded' && 
    percentage < 100) {
  await supabase.from('tripulantes')
    .update({ status: 'ativo', bloqueio_motivo: null, bloqueado_at: null })
    .eq('id', tripulante.id)
  console.log(`[mikrotik-sync] v7.8.7: Auto-unblocked ${activeUser.user} (now ${Math.round(percentage)}%)`)
}
```

### 4. Prioridade de `unblock_quota`

Ja esta implementada corretamente - `unblock_quota` e colocado na categoria `firewallBlockActions` (posicao 2 na prioridade, antes de profiles e users).

## Ordem de Execucao

1. Migration: adicionar `batch_id`, atualizar constraint de status
2. SQL: desbloquear Alexandre (status `ativo`)
3. Atualizar `mikrotik-sync/index.ts` com todas as alteracoes (a-i)
4. Deploy automatico
5. (Futuro) Atualizar template `sync` no MikroTik para enviar `last_batch_applied`

## Nota sobre compatibilidade

Ate que o script do MikroTik seja atualizado para enviar `last_batch_applied`, o sistema opera em modo hibrido:
- Acoes sao marcadas como `enviado` (nao mais `executado`)
- Sem ACK, o retry counter incrementa a cada sync
- Apos 3 tentativas sem ACK, a acao vai para `erro` com alerta
- Isso e MELHOR que o fire-and-forget atual, pois acoes perdidas sao detectadas em vez de silenciadas

