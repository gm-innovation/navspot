

# Plano v6.9.8: Correção do Loop de Sincronização de Usuários

## Diagnóstico Detalhado

### Evidências dos Logs

```
18:22:20 - miss_count=6, Re-syncing user, Injecting 1 user actions
18:23:19 - miss_count=1 (reset corretamente)
18:24:20 - miss_count=2, Re-syncing user ← MAS COOLDOWN É 5 MIN!
```

### Problemas Identificados

| # | Problema | Causa Raiz |
|---|----------|------------|
| 1 | `Registered users from MikroTik: 0` sempre | MikroTik rodando script antigo sem `registered_users_csv` |
| 2 | Condição lógica invertida (linha 257) | `registeredUsersCsv.length > 0 \|\| registeredUsersSet.size === 0` sempre TRUE quando CSV vazio |
| 3 | miss_count incrementa mesmo sem dados | Não verifica se temos dados válidos antes de incrementar |
| 4 | Cooldown não funciona quando MikroTik já criou usuário | O usuário existe no MikroTik mas não aparece em `registered_users_csv` |

---

## Correções Necessárias

### 1. Corrigir a Lógica de Verificação (CRÍTICO)

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Problema:** A condição na linha 257 está invertida:

```typescript
// ANTES (bugado) - Incrementa quando CSV está vazio
if (registeredUsersCsv.length > 0 || registeredUsersSet.size === 0) {
  meta.miss_count += 1
}
```

**Correção:**

```typescript
// DEPOIS (correto) - Só incrementa quando temos dados E usuário está faltando
// Se registeredUsersCsv está vazio, NÃO temos informação confiável do MikroTik
// Portanto NÃO devemos incrementar miss_count
if (registeredUsersCsv.length > 0) {
  // Temos a lista de usuários do MikroTik e este usuário NÃO está nela
  meta.miss_count = (meta.miss_count || 0) + 1
  console.log(`[mikrotik-sync] v6.9.8: User confirmed missing, miss_count=${meta.miss_count}: ${login}`)
} else {
  // MikroTik não enviou registered_users_csv - script antigo ou erro
  // NÃO incrementamos miss_count para evitar falsos positivos
  console.log(`[mikrotik-sync] v6.9.8: No registered_users data, skipping miss_count for: ${login}`)
}
```

### 2. Adicionar Verificação de Script Atualizado

O backend deve logar um aviso quando o MikroTik não está enviando `registered_users_csv`:

```typescript
// No início do reconcileUsers
if (!registeredUsersCsv || registeredUsersCsv.length === 0) {
  console.warn(`[mikrotik-sync] v6.9.8: WARNING - MikroTik not sending registered_users_csv. Script update required.`)
  console.warn(`[mikrotik-sync] v6.9.8: Skipping user reconciliation until script is updated.`)
  return // Não faz reconciliação sem dados confiáveis
}
```

### 3. Reorganizar a Função reconcileUsers

```typescript
async function reconcileUsers(
  supabase: ReturnType<typeof createClient>,
  hotspot: { id: string; embarcacao_id: string; synced_users: SyncedUserMeta[] },
  activeUsers: ActiveUser[],
  registeredUsersCsv: string,
  formattedActions: PendingAction[]
): Promise<void> {
  // v6.9.8: Validar se temos dados do MikroTik
  if (!registeredUsersCsv || registeredUsersCsv.trim().length === 0) {
    console.warn(`[mikrotik-sync] v6.9.8: No registered_users_csv from MikroTik - script update needed`)
    console.warn(`[mikrotik-sync] v6.9.8: Skipping reconciliation to prevent false positives`)
    return
  }
  
  // Parse registered users from MikroTik
  const registeredUsersSet = new Set(
    registeredUsersCsv
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0)
  )
  
  console.log(`[mikrotik-sync] v6.9.8: Registered users from MikroTik: ${registeredUsersSet.size} (${Array.from(registeredUsersSet).join(', ')})`)
  
  // ... resto da lógica ...
  
  for (const tripulante of tripulantes) {
    const login = tripulante.login_wifi
    
    // Initialize or load metadata
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
      // User EXISTS in MikroTik - everything OK
      meta.miss_count = 0
      if (activeUsersSet.has(login)) {
        meta.last_seen = now
      }
      console.log(`[mikrotik-sync] v6.9.8: User confirmed in MikroTik: ${login}`)
      continue
    }
    
    // User NOT in registered_users - confirmed missing
    meta.miss_count = (meta.miss_count || 0) + 1
    console.log(`[mikrotik-sync] v6.9.8: User confirmed missing, miss_count=${meta.miss_count}: ${login}`)
    
    // Check cooldown and threshold
    const neverSynced = !meta.last_synced_at
    const exceededThreshold = meta.miss_count >= MISS_THRESHOLD
    const lastSyncTime = meta.last_synced_at ? new Date(meta.last_synced_at).getTime() : 0
    const cooldownElapsed = (nowMs - lastSyncTime) > SYNC_COOLDOWN_MS
    
    // Log decision factors
    console.log(`[mikrotik-sync] v6.9.8: Decision for ${login}: neverSynced=${neverSynced}, exceeded=${exceededThreshold}, cooldown=${cooldownElapsed}`)
    
    if ((neverSynced || exceededThreshold) && cooldownElapsed) {
      // Generate action
      // ...
      meta.last_synced_at = now
      meta.miss_count = 0
    }
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-sync/index.ts` | Corrigir lógica de verificação de registered_users_csv vazio |
| `mikrotik-sync/index.ts` | Adicionar early return quando não há dados do MikroTik |
| `mikrotik-sync/index.ts` | Melhorar logs de debug |
| `mikrotik-sync/index.ts` | Atualizar versão para v6.9.8 |

---

## Ação Necessária no MikroTik

O usuário precisa **regenerar e reinstalar o script** no MikroTik para que ele comece a enviar `registered_users_csv`:

1. Acessar a página de Hotspots no painel
2. Clicar no hotspot afetado
3. Gerar novo script
4. Copiar e executar no MikroTik

Sem isso, o backend não terá dados confiáveis para reconciliação.

---

## Fluxo Corrigido

```text
Sync com Script Antigo (sem registered_users_csv):
├── Backend recebe: { "sync_token": "...", "active_users_csv": "..." }
├── registered_users_csv está vazio
├── Backend loga: "No registered_users_csv - script update needed"
├── Backend retorna EARLY - não faz reconciliação
└── Não envia create_user (evita loop)

Sync com Script Novo (COM registered_users_csv):
├── Backend recebe: { ..., "registered_users_csv": "alexandre.silva,joao.pereira," }
├── Parse: registeredUsersSet = {"alexandre.silva", "joao.pereira"}
├── Tripulante "alexandre.silva" está na lista? SIM → miss_count=0, OK
├── Tripulante "maria.souza" está na lista? NÃO → miss_count++
├── Se miss_count >= 2 E cooldown elapsed → Envia create_user
└── Apenas usuários realmente faltantes são recriados
```

---

## Impacto

- **Criticidade:** Alta (para loop de ações)
- **Risco:** Baixo (adiciona validação, não remove funcionalidade)
- **Requisito:** Usuário deve atualizar script no MikroTik

