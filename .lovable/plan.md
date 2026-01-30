

# Plano v6.9.7: Reconciliação de Tripulantes com Lista Completa do MikroTik

## Mudança Crítica do Plano Original

A recomendação foi aceita: **o envio da lista de usuários registrados (`registered_users`) será implementado como funcionalidade obrigatória**, não opcional. Isso elimina falsos positivos quando o navio está vazio.

## Comparação: active_users vs registered_users

| Campo | Origem | Descrição | Quando está vazio |
|-------|--------|-----------|-------------------|
| `active_users` | Usuários conectados agora | Lista de quem está online | Navio vazio = array vazio |
| `registered_users` | `/ip hotspot user` | Todos os usuários cadastrados | MikroTik foi limpo |

**Vantagem**: Com `registered_users`, o backend tem certeza absoluta de quem existe no MikroTik, independente de estarem online.

---

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| Migração SQL | Adicionar `synced_users JSONB` com metadados | Alta |
| `mikrotik-script-generator/index.ts` | Adicionar coleta de `registered_users` no sync script | Alta |
| `mikrotik-sync/index.ts` | Processar `registered_users_csv` no payload | Alta |
| `mikrotik-sync/index.ts` | Implementar `reconcileUsers()` com reconciliação | Alta |
| `mikrotik-sync/index.ts` | Buscar `synced_users` junto com hotspot | Alta |
| `src/hooks/useTripulantes.ts` | Invalidar cache ao atualizar tripulante | Média |

---

## Implementação Detalhada

### 1. Migração SQL - Adicionar Campo de Tracking

```sql
-- v6.9.7: Adicionar tracking de usuários sincronizados com metadados
ALTER TABLE hotspots 
ADD COLUMN IF NOT EXISTS synced_users JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hotspots.synced_users IS 
'Array de objetos: [{"login": "alexandre.silva", "last_seen": "ISO8601", "last_synced_at": "ISO8601", "miss_count": 0}]';

-- Índice para performance em buscas
CREATE INDEX IF NOT EXISTS idx_hotspots_synced_users_gin 
ON hotspots USING gin(synced_users);
```

### 2. Script MikroTik - Coletar Lista Completa de Usuários

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

**Mudança**: Modificar o `syncScriptSource` para coletar `registered_users` além de `active_users`.

```typescript
// Trecho atual (linhas 241-253) - ANTES
const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "}")
...`
```

**DEPOIS (v6.9.7)**:

```typescript
const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
:local registered ""
:local q "\\22"
# Coletar usuarios ativos (conectados)
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
# v6.9.7: Coletar lista completa de usuarios cadastrados (exclui dinamicos)
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
# Construir JSON com ambos os campos
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "," . $q . "registered_users_csv" . $q . ":" . $q . $registered . $q . "}")
...`
```

### 3. Backend - Interface de Payload Atualizada

**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`

**Adicionar ao SyncPayload (linha 17-22)**:

```typescript
interface SyncPayload {
  sync_token: string
  active_users?: ActiveUser[]
  registered_users_csv?: string  // v6.9.7: Lista completa de usuários cadastrados
  executed_actions?: string[]
  user_device_counts?: { user: string; count: number; macs: string[] }[]
}
```

**Adicionar interface para metadados de usuários**:

```typescript
// v6.9.7: Metadata for synced users tracking
interface SyncedUserMeta {
  login: string
  last_seen: string | null      // Última vez visto em active_users
  last_synced_at: string | null // Última vez que enviamos create_user
  miss_count: number            // Syncs consecutivos sem aparecer em registered_users
}

// Constants for reconciliation
const MISS_THRESHOLD = 2        // Syncs faltando antes de re-criar
const SYNC_COOLDOWN_MS = 5 * 60 * 1000  // 5 min cooldown entre re-syncs
```

### 4. Backend - Função de Reconciliação

**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`

**Adicionar função `reconcileUsers` (inserir antes da linha 167 - Deno.serve)**:

```typescript
async function reconcileUsers(
  supabase: ReturnType<typeof createClient>,
  hotspot: { id: string; embarcacao_id: string; synced_users: SyncedUserMeta[] },
  activeUsers: ActiveUser[],
  registeredUsersCsv: string,
  formattedActions: PendingAction[]
): Promise<void> {
  // Parse registered users from MikroTik (lista COMPLETA de cadastrados)
  const registeredUsersSet = new Set(
    registeredUsersCsv
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0)
  )
  
  // Build set of currently active (online) users
  const activeUsersSet = new Set(activeUsers.map(u => u.user))
  
  // Load synced users metadata from DB
  const syncedUsersMap = new Map<string, SyncedUserMeta>(
    (hotspot.synced_users || []).map(u => [u.login, { ...u }])
  )
  
  // Fetch all active tripulantes for this embarcacao
  const { data: tripulantes } = await supabase
    .from('tripulantes')
    .select(`
      login_wifi, senha_wifi, perfil_id, status,
      perfis_velocidade(nome)
    `)
    .eq('embarcacao_id', hotspot.embarcacao_id)
    .in('status', ['ativo', 'pendente_cadastro'])
  
  if (!tripulantes || tripulantes.length === 0) return
  
  const newActionsToInject: PendingAction[] = []
  const now = new Date().toISOString()
  const nowMs = Date.now()
  
  for (const tripulante of tripulantes) {
    const login = tripulante.login_wifi
    
    // Initialize metadata if new user
    if (!syncedUsersMap.has(login)) {
      syncedUsersMap.set(login, {
        login,
        last_seen: null,
        last_synced_at: null,
        miss_count: 0
      })
    }
    
    const meta = syncedUsersMap.get(login)!
    
    // Check if user exists in MikroTik registered users
    if (registeredUsersSet.has(login)) {
      // User EXISTS in MikroTik - reset counters
      meta.miss_count = 0
      
      // Update last_seen if also active (online)
      if (activeUsersSet.has(login)) {
        meta.last_seen = now
      }
      
      console.log(`[mikrotik-sync] v6.9.7: User exists in MikroTik: ${login}`)
      continue
    }
    
    // User NOT in registered_users - may need to sync
    // Only count as missing if we actually received the registered_users list
    if (registeredUsersCsv.length > 0 || registeredUsersSet.size === 0) {
      meta.miss_count = (meta.miss_count || 0) + 1
      console.log(`[mikrotik-sync] v6.9.7: User missing from MikroTik, miss_count=${meta.miss_count}: ${login}`)
    }
    
    // Decide if we should re-sync
    const neverSynced = !meta.last_synced_at
    const exceededThreshold = meta.miss_count >= MISS_THRESHOLD
    
    // Cooldown check: don't re-sync too frequently
    const lastSyncTime = meta.last_synced_at ? new Date(meta.last_synced_at).getTime() : 0
    const cooldownElapsed = (nowMs - lastSyncTime) > SYNC_COOLDOWN_MS
    
    if ((neverSynced || exceededThreshold) && cooldownElapsed) {
      // Generate create_user action
      const perfilNome = (tripulante.perfis_velocidade as any)?.nome || ''
      const profileSlug = perfilNome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'default'
      
      const actionId = `auto-user-${login}`
      
      newActionsToInject.push({
        id: actionId,
        type: 'create_user',
        payload: {
          user: login,
          password: tripulante.senha_wifi,
          profile: profileSlug
        }
      })
      
      // Update metadata
      meta.last_synced_at = now
      meta.miss_count = 0
      
      console.log(`[mikrotik-sync] v6.9.7: Re-syncing user (neverSynced=${neverSynced}, exceeded=${exceededThreshold}): ${login}`)
    }
  }
  
  // Append new actions AFTER profiles (profiles come first in the array)
  if (newActionsToInject.length > 0) {
    formattedActions.push(...newActionsToInject)
    console.log(`[mikrotik-sync] v6.9.7: Injecting ${newActionsToInject.length} user actions`)
  }
  
  // Persist updated metadata
  const updatedSyncedUsers = Array.from(syncedUsersMap.values())
  await supabase
    .from('hotspots')
    .update({ synced_users: updatedSyncedUsers })
    .eq('id', hotspot.id)
}
```

### 5. Backend - Atualizar Query e Invocar Reconciliação

**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`

**Linha 190-194 - Adicionar synced_users à query**:

```typescript
const { data: hotspot, error: hotspotError } = await supabase
  .from('hotspots')
  .select('id, embarcacao_id, nome, status, synced_profiles, synced_users')
  .eq('sync_token', payload.sync_token)
  .single()
```

**Após o processamento de profiles (linha ~688) - Invocar reconciliação**:

```typescript
// v6.9.7: Reconcile users - detect missing and re-sync
await reconcileUsers(
  supabase,
  {
    id: hotspot.id,
    embarcacao_id: hotspot.embarcacao_id,
    synced_users: ((hotspot as any).synced_users || []) as SyncedUserMeta[]
  },
  payload.active_users || [],
  payload.registered_users_csv || '',
  formattedActions
)
```

### 6. Frontend - Invalidar Cache ao Atualizar Tripulante

**Arquivo**: `src/hooks/useTripulantes.ts`

**Adicionar ao final do try block do `useUpdateTripulante` (após linha 204)**:

```typescript
// v6.9.7: Invalidate synced_users cache to force re-sync
if (updates.senha_wifi || updates.perfil_id) {
  const login = oldData.login_wifi
  
  // Get all hotspots for this embarcacao
  const { data: hotspots } = await supabase
    .from('hotspots')
    .select('id, synced_users')
    .eq('embarcacao_id', oldData.embarcacao_id)
  
  for (const hotspot of hotspots || []) {
    const syncedUsers = ((hotspot.synced_users || []) as any[])
      .filter((u: any) => u.login !== login)
    
    await supabase
      .from('hotspots')
      .update({ synced_users: syncedUsers })
      .eq('id', hotspot.id)
  }
  
  console.log(`[useTripulantes] v6.9.7: Invalidated synced_users for ${login}`)
}
```

---

## Fluxo de Reconciliação (com registered_users)

```text
Sync 1 (MikroTik foi limpo):
├── MikroTik envia:
│   ├── active_users_csv: "" (ninguém conectado)
│   └── registered_users_csv: "" (todos os usuários foram removidos)
├── Backend detecta: tripulante no DB mas NÃO em registered_users
├── miss_count incrementa para 1
└── Retorna: [[]] (aguarda threshold)

Sync 2 (continua limpo):
├── MikroTik envia:
│   ├── active_users_csv: ""
│   └── registered_users_csv: ""
├── miss_count incrementa para 2 (>= THRESHOLD)
├── Backend injeta: create_user
└── Retorna: [[create_user|alexandre.silva|048706|tripulacao;]]

Sync 3 (usuário criado):
├── MikroTik envia:
│   ├── active_users_csv: "" (ainda não conectou)
│   └── registered_users_csv: "alexandre.silva,"
├── Backend detecta: tripulante EXISTE em registered_users
├── miss_count reseta para 0
└── Retorna: [[]] (nada a fazer)
```

---

## Comparação: Antes vs Depois

| Cenário | Antes (active_users) | Depois (registered_users) |
|---------|---------------------|---------------------------|
| Navio vazio | Falso positivo (recria todos) | Não recria (lista completa) |
| MikroTik limpo | Não detecta | Detecta e recria |
| Usuário existe mas offline | Confunde com faltante | Reconhece que existe |
| Performance | Depende de conexões | Depende de cadastros |

---

## Resumo das Correções v6.9.7

| Componente | Mudança |
|------------|---------|
| Script MikroTik | Adiciona coleta de `/ip hotspot user` |
| Payload Sync | Novo campo `registered_users_csv` |
| Backend | Nova função `reconcileUsers()` |
| Tracking | Campo `synced_users` com metadados |
| Lógica | miss_count baseado em registered, não active |
| Frontend | Invalidação de cache em updates |

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Payload muito grande se muitos usuários | CSV é eficiente (apenas logins separados por vírgula) |
| Burst de ações se muitos faltantes | Cooldown de 5 min + threshold de 2 syncs |
| MikroTik não enviou registered_users | Só incrementa miss_count se CSV foi parseado |

---

## Impacto

- **Criticidade**: Alta (resolve cenário de MikroTik limpo)
- **Risco**: Baixo (adiciona informação, não remove)
- **Compatibilidade**: RouterOS 6.x e 7.x

