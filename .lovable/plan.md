
# Correção: Sincronização de Perfis e Usuários MikroTik

## Problemas Identificados

### Problema 1: Tipo de ação `update_profile_config` não existe no banco

**Erro:**
```
new row for relation "acoes_pendentes" violates check constraint "acoes_pendentes_tipo_check"
```

**Causa:**
- O hook `usePerfisVelocidade.ts` usa o tipo `update_profile_config` (linha 212)
- Este tipo **não está** na lista de tipos permitidos no check constraint do banco
- Tipos permitidos incluem: `add_user_profile`, `remove_user_profile`, `update_profile`, mas **não** `update_profile_config`

**Solução:**
Alterar o tipo de `update_profile_config` para `update_profile` que já existe no banco.

### Problema 2: Cooldown bloqueando re-sincronização de usuários

**Dados dos logs:**
```
Decision for alexandre.silva: neverSynced=false, exceeded=true, cooldown=false
```

O sistema detecta que o usuário está faltando no MikroTik (`exceeded=true`, `miss_count=5`), mas o cooldown de 5 minutos **bloqueia** a re-injeção do `create_user`.

**Causa:**
O `last_synced_at` foi atualizado quando a ação foi criada, mas o usuário ainda não foi criado no MikroTik porque a ação não foi executada corretamente ou houve falha no script.

**Dados no banco:**
```json
{
  "login": "alexandre.silva",
  "last_synced_at": "2026-02-04T17:00:39.905Z",
  "miss_count": 0
}
```

Apesar do `miss_count` resetar após criar a ação, o usuário continua sem aparecer em `registered_users_csv`, e o cooldown impede nova tentativa por 5 minutos.

**Solução:**
Reduzir o cooldown de 5 minutos para 2 minutos, e também verificar se a ação anterior foi realmente **executada** antes de confiar no `last_synced_at`.

### Problema 3: Ordem de criação - Perfil antes do Usuário

**Situação:**
Quando um perfil é atualizado e um usuário associado a ele precisa ser re-sincronizado, a ordem deve ser:
1. Primeiro: criar/atualizar o perfil no MikroTik
2. Depois: criar o usuário com referência ao perfil

**Causa:**
O sistema está invalidando o cache de perfis (`synced_profiles`) mas a lógica de reconciliação no `mikrotik-sync` processa usuários após perfis, o que é correto. Porém, se o perfil ainda não foi re-criado no MikroTik e um usuário tenta usar esse perfil, a criação do usuário falha.

**Solução:**
Garantir que a reconciliação de perfis seja executada **antes** da reconciliação de usuários no `mikrotik-sync`, e que ações de perfil tenham prioridade maior na fila.

## Mudanças Necessárias

### 1. Migração SQL: Adicionar tipo `update_profile_config` ao check constraint

```sql
ALTER TABLE acoes_pendentes DROP CONSTRAINT acoes_pendentes_tipo_check;
ALTER TABLE acoes_pendentes ADD CONSTRAINT acoes_pendentes_tipo_check CHECK (
  tipo = ANY (ARRAY[
    'create_user', 'remove_user', 'delete_user', 'disable_user', 'enable_user',
    'update_password', 'kick_session',
    'create_profile', 'update_profile', 'update_profile_config',
    'update_user_profile', 'add_user_profile', 'remove_user_profile', 'update_profile_quota',
    'add_walled_garden', 'remove_walled_garden',
    'add_whitelist_domain', 'remove_whitelist_domain',
    'add_blacklist_domain', 'remove_blacklist_domain',
    'create_whitelist_domain', 'create_blacklist_domain',
    'add_firewall_filter', 'remove_firewall_filter',
    'add_firewall_block', 'remove_firewall_block',
    'block_device', 'unblock_device'
  ])
);
```

### 2. Edge Function: Reduzir cooldown e melhorar lógica de reconciliação

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

| Linha | Alteração |
|-------|-----------|
| 70 | Alterar `SYNC_COOLDOWN_MS` de 5 minutos para 2 minutos |
| 401-425 | Adicionar verificação se a última ação foi realmente executada |

**Código atualizado (constante):**
```typescript
// v6.9.8: Reduzir cooldown para 2 minutos (era 5)
const SYNC_COOLDOWN_MS = 2 * 60 * 1000  // 2 min cooldown entre re-syncs
```

### 3. Edge Function: Processar ação `update_profile_config`

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Adicionar handler para `update_profile_config` na seção de processamento de ações, convertendo para comandos MikroTik de atualização de perfil de usuário.

## Detalhes Técnicos

### Fluxo Atual de Sincronização

```text
MikroTik                    Backend (mikrotik-sync)
   |                              |
   |-- POST /sync --------------->|
   |   registered_users_csv       |
   |   registered_profiles_csv    |
   |                              |-- Reconcile Profiles
   |                              |   (perfis do banco vs MikroTik)
   |                              |
   |                              |-- Reconcile Users
   |                              |   (tripulantes do banco vs MikroTik)
   |                              |
   |<-- pending_actions_pipe -----|
   |    profile:create|...        |
   |    user:create|...           |
```

### Problema no Ciclo

1. Usuário `alexandre.silva` existe no banco mas não no MikroTik
2. Sistema detecta `miss_count >= 2` e cria ação `create_user`
3. Define `last_synced_at = now()` e reseta `miss_count = 0`
4. MikroTik recebe ação mas **falha** na execução (perfil não existe?)
5. Próximo sync: usuário ainda não aparece em `registered_users_csv`
6. Sistema incrementa `miss_count` novamente
7. Mas cooldown de 5 minutos impede nova ação

### Arquivos Impactados

| Arquivo | Alteração |
|---------|-----------|
| SQL Migration | Adicionar `update_profile_config` ao check constraint |
| `supabase/functions/mikrotik-sync/index.ts` | Reduzir cooldown, melhorar reconciliação |

## Resultado Esperado

Após as correções:
1. Atualizar um perfil de velocidade não causa erro de constraint
2. Usuários faltando no MikroTik são re-sincronizados a cada 2 minutos (ao invés de 5)
3. A ordem de prioridade garante que perfis são criados antes dos usuários
