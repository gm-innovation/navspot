
# Plano: Sistema Completo de Sincronização MikroTik via Ações Pendentes

## Contexto

O sistema precisa de uma arquitetura onde:
1. **Script RSC** = Apenas infraestrutura base (hotspot, rede, perfis base, scheduler de sincronização)
2. **Todas as operações** = Sincronizadas via ações pendentes (`acoes_pendentes`)

Atualmente, os hooks de CRUD (tripulantes, dispositivos, perfis, listas, regras) só salvam no banco de dados, sem criar ações para o MikroTik.

---

## Tipos de Ações Necessárias

| Entidade | Operação | Tipo Ação MikroTik | Payload |
|----------|----------|-------------------|---------|
| **Tripulante** | Criar | `create_user` | `{ user, password, profile }` |
| **Tripulante** | Editar senha | `update_password` | `{ user, password }` |
| **Tripulante** | Editar perfil | `update_user_profile` | `{ user, profile }` |
| **Tripulante** | Excluir | `remove_user` | `{ user }` |
| **Tripulante** | Bloquear | `disable_user` | `{ user }` |
| **Tripulante** | Desbloquear | `enable_user` | `{ user }` |
| **Dispositivo** | Bloquear | `block_device` | `{ mac }` |
| **Dispositivo** | Desbloquear | `unblock_device` | `{ mac }` |
| **Perfil** | Criar | `add_profile` | `{ name, rateLimit, sharedUsers, limitBytes }` |
| **Perfil** | Editar | `update_profile_config` | `{ name, rateLimit, sharedUsers, limitBytes }` |
| **Perfil** | Excluir | `remove_profile` | `{ name }` |
| **Lista/Regra** | Criar/Editar/Excluir | `update_firewall_rules` | `{ domains[], action }` |

---

## Arquivos a Modificar

### Backend (Edge Functions)

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-script-generator/index.ts` | Remover seção de usuários do script |
| `mikrotik-sync/index.ts` | Adicionar novos tipos de ação + corrigir fallback de perfil |

### Frontend (Hooks)

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useTripulantes.ts` | Adicionar ações para create/update/delete |
| `src/hooks/usePerfisVelocidade.ts` | Adicionar ações para create/update/delete |
| `src/hooks/useListasAcesso.ts` | Adicionar ações para create/update/delete |
| `src/hooks/useRegrasAcesso.ts` | Adicionar ações para create/update/delete |
| `src/hooks/useDispositivosRegistrados.ts` | Adicionar ações para block/unblock |
| **NOVO** `src/hooks/useMikrotikSync.ts` | Hook centralizado para criar ações |

---

## Detalhes Técnicos

### 1. Novo Hook Centralizado: `useMikrotikSync.ts`

```typescript
import { supabase } from '@/integrations/supabase/client';

export type MikrotikActionType = 
  | 'create_user' | 'remove_user' | 'disable_user' | 'enable_user'
  | 'update_password' | 'update_user_profile'
  | 'block_device' | 'unblock_device' | 'kick_device'
  | 'add_profile' | 'update_profile_config' | 'remove_profile'
  | 'update_firewall_rules';

interface CreateActionParams {
  embarcacaoId: string;
  tipo: MikrotikActionType;
  payload: Record<string, any>;
}

export async function createMikrotikAction({ embarcacaoId, tipo, payload }: CreateActionParams) {
  // Buscar hotspots da embarcação
  const { data: hotspots } = await supabase
    .from('hotspots')
    .select('id')
    .eq('embarcacao_id', embarcacaoId);

  if (!hotspots || hotspots.length === 0) {
    console.log('Nenhum hotspot encontrado para a embarcação');
    return [];
  }

  // Criar ação para cada hotspot
  const actions = hotspots.map(h => ({
    hotspot_id: h.id,
    tipo,
    payload,
    status: 'pendente',
  }));

  const { data, error } = await supabase
    .from('acoes_pendentes')
    .insert(actions)
    .select();

  if (error) {
    console.error('Erro ao criar ação MikroTik:', error);
    throw error;
  }

  return data;
}

// Helper para converter nome de perfil para slug MikroTik
export function toProfileSlug(nome: string): string {
  return nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
```

### 2. Modificar `useTripulantes.ts`

```typescript
// useCreateTripulante - Após criar no banco, criar ação
mutationFn: async (tripulante: TripulanteInsert) => {
  const { data, error } = await supabase
    .from('tripulantes')
    .insert(tripulante)
    .select(`
      *,
      embarcacao_id,
      perfis_velocidade(nome)
    `)
    .single();

  if (error) throw error;

  // Criar ação create_user para o MikroTik
  await createMikrotikAction({
    embarcacaoId: data.embarcacao_id,
    tipo: 'create_user',
    payload: {
      user: data.login_wifi,
      password: data.senha_wifi,
      profile: toProfileSlug(data.perfis_velocidade?.nome || 'default'),
    },
  });

  return data;
}

// useUpdateTripulante - Detectar o que mudou
mutationFn: async ({ id, ...updates }) => {
  // Buscar dados anteriores
  const { data: oldData } = await supabase
    .from('tripulantes')
    .select('login_wifi, senha_wifi, perfil_id, embarcacao_id, perfis_velocidade(nome)')
    .eq('id', id)
    .single();

  // Atualizar
  const { data, error } = await supabase
    .from('tripulantes')
    .update(updates)
    .eq('id', id)
    .select('*, perfis_velocidade(nome)')
    .single();

  if (error) throw error;

  // Criar ações baseado no que mudou
  if (updates.senha_wifi && updates.senha_wifi !== oldData.senha_wifi) {
    await createMikrotikAction({
      embarcacaoId: oldData.embarcacao_id,
      tipo: 'update_password',
      payload: { user: oldData.login_wifi, password: updates.senha_wifi },
    });
  }

  if (updates.perfil_id && updates.perfil_id !== oldData.perfil_id) {
    await createMikrotikAction({
      embarcacaoId: oldData.embarcacao_id,
      tipo: 'update_user_profile',
      payload: { 
        user: oldData.login_wifi, 
        profile: toProfileSlug(data.perfis_velocidade?.nome || 'default'),
      },
    });
  }

  return data;
}

// useDeleteTripulante
mutationFn: async (id: string) => {
  // Buscar dados antes de deletar
  const { data: tripulante } = await supabase
    .from('tripulantes')
    .select('login_wifi, embarcacao_id')
    .eq('id', id)
    .single();

  // Deletar do banco
  await supabase.from('tripulantes').delete().eq('id', id);

  // Criar ação remove_user
  if (tripulante) {
    await createMikrotikAction({
      embarcacaoId: tripulante.embarcacao_id,
      tipo: 'remove_user',
      payload: { user: tripulante.login_wifi },
    });
  }
}
```

### 3. Modificar `usePerfisVelocidade.ts`

```typescript
// useCreatePerfilVelocidade
onSuccess: async (data) => {
  // Buscar embarcações da empresa para criar ação em cada hotspot
  const { data: embarcacoes } = await supabase
    .from('embarcacoes')
    .select('id')
    .eq('empresa_id', data.empresa_id);

  for (const emb of embarcacoes || []) {
    await createMikrotikAction({
      embarcacaoId: emb.id,
      tipo: 'add_profile',
      payload: {
        name: toProfileSlug(data.nome),
        rateLimit: `${data.velocidade_upload}/${data.velocidade_download}`,
        sharedUsers: data.max_dispositivos,
        limitBytes: data.limite_dados_mb ? data.limite_dados_mb * 1024 * 1024 : 0,
        sessionTimeout: data.session_timeout_minutos ? `${data.session_timeout_minutos}m` : null,
      },
    });
  }
}
```

### 4. Modificar `mikrotik-script-generator/index.ts`

**REMOVER** as linhas 350-362 (seção de usuários):

```typescript
// REMOVER:
script += `# ============================================
# Users (Tripulantes)
# ============================================
/ip hotspot user
:foreach u in=[find server="hs-${hotspotSlug}"] do={ remove $u }
`
for (const tripulante of tripulantes) {
  // ...
}

// SUBSTITUIR POR:
script += `# ============================================
# Users (Tripulantes)
# ============================================
# Users are managed via API actions (create_user, remove_user, etc.)
# Initial users will be added on first admin action
# Run navspot-sync to process pending actions
`
```

### 5. Expandir `mikrotik-sync/index.ts` - Action Processor

Adicionar novos tipos de ação no script RSC:

```routeros
# Profile management
:if ($actionType = "add_profile") do={
  :if ([:len $param1] > 0) do={
    :do {
      /ip hotspot user profile add name=$param1 rate-limit=$param2 shared-users=$param3
      :log info ("NAVSPOT: Added profile " . $param1)
      :set executed ($executed . "\"" . $actionId . "\",")
    } on-error={
      :log warning ("NAVSPOT: Profile " . $param1 . " might already exist")
    }
  }
}

:if ($actionType = "remove_profile") do={
  :if ([:len $param1] > 0) do={
    :do {
      /ip hotspot user profile remove [find name=$param1]
      :log info ("NAVSPOT: Removed profile " . $param1)
      :set executed ($executed . "\"" . $actionId . "\",")
    } on-error={}
  }
}

:if ($actionType = "update_profile_config") do={
  :if ([:len $param1] > 0) do={
    :do {
      /ip hotspot user profile set [find name=$param1] rate-limit=$param2 shared-users=$param3
      :log info ("NAVSPOT: Updated profile config " . $param1)
      :set executed ($executed . "\"" . $actionId . "\",")
    } on-error={}
  }
}

# Device management
:if ($actionType = "block_device") do={
  :if ([:len $param1] > 0) do={
    :do {
      /ip hotspot active remove [find mac-address=$param1]
      :log info ("NAVSPOT: Blocked and kicked device " . $param1)
      :set executed ($executed . "\"" . $actionId . "\",")
    } on-error={}
  }
}

:if ($actionType = "update_firewall_rules") do={
  # This action triggers a full firewall refresh
  # The actual rules are fetched during sync via firewall_rules response
  :log info "NAVSPOT: Firewall rules update requested, will apply on next sync"
  :set executed ($executed . "\"" . $actionId . "\",")
}
```

### 6. Corrigir Fallback de Perfil no `mikrotik-sync/index.ts`

```typescript
// Linha 652 - Corrigir fallback dinâmico
case 'add_user':
case 'create_user':
  let profileName = String(p.profile || '')
  
  // Se não tem profile, buscar o primeiro da empresa
  if (!profileName && embarcacao?.empresa_id) {
    const { data: defaultPerfil } = await supabase
      .from('perfis_velocidade')
      .select('nome')
      .eq('empresa_id', embarcacao.empresa_id)
      .order('prioridade', { ascending: true })
      .limit(1)
      .maybeSingle()
    
    if (defaultPerfil) {
      profileName = defaultPerfil.nome.toLowerCase()
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    } else {
      profileName = 'default'  // Fallback final do MikroTik
    }
  }
  
  parts.push(String(p.user || ''), String(p.password || ''), profileName)
  break
```

---

## Fluxo Completo de Sincronização

```text
┌──────────────────────────────────────────────────────────────────┐
│                    INSTALAÇÃO INICIAL                            │
├──────────────────────────────────────────────────────────────────┤
│ 1. Admin gera script RSC → Contém: hotspot, perfis, firewall     │
│ 2. Admin cola script no MikroTik (uma única vez)                 │
│ 3. MikroTik inicia scheduler de sincronização                    │
│ 4. NENHUM usuário está no script inicial                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   OPERAÇÕES VIA FRONTEND                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ TRIPULANTE ───────────────────────────────────────────────┐  │
│  │ Criar  → DB INSERT + ação create_user                      │  │
│  │ Editar → DB UPDATE + ação update_password/update_profile   │  │
│  │ Excluir → DB DELETE + ação remove_user                     │  │
│  │ Bloquear → DB UPDATE + ação disable_user                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ DISPOSITIVO ──────────────────────────────────────────────┐  │
│  │ Bloquear → DB UPDATE + ação block_device                   │  │
│  │ Desbloquear → DB UPDATE + ação unblock_device              │  │
│  │ Kick → ação kick_device (sem mudança no banco)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ PERFIL DE VELOCIDADE ─────────────────────────────────────┐  │
│  │ Criar → DB INSERT + ação add_profile (para cada hotspot)   │  │
│  │ Editar → DB UPDATE + ação update_profile_config            │  │
│  │ Excluir → DB DELETE + ação remove_profile                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ LISTAS/REGRAS DE ACESSO ──────────────────────────────────┐  │
│  │ Criar/Editar/Excluir → DB + ação update_firewall_rules     │  │
│  │ (MikroTik aplica novas regras no próximo sync)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      CICLO DE SYNC                               │
├──────────────────────────────────────────────────────────────────┤
│  A cada X minutos (configurável):                                │
│                                                                   │
│  MikroTik ──► POST /mikrotik-sync                                │
│               { sync_token, active_users, executed_actions }     │
│                                                                   │
│  Supabase ◄── Response                                           │
│               { pending_actions_pipe, firewall_rules, ... }      │
│                                                                   │
│  MikroTik executa ações pendentes:                               │
│    - create_user: /ip hotspot user add ...                       │
│    - remove_user: /ip hotspot user remove ...                    │
│    - update_profile: /ip hotspot user profile set ...            │
│    - etc.                                                        │
│                                                                   │
│  Próximo sync: envia executed_actions para marcar como feito     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Resumo das Mudanças

| Componente | Antes | Depois |
|------------|-------|--------|
| **Script RSC** | Contém usuários tripulantes | Apenas infraestrutura |
| **Tripulantes** | Só salva no banco | Banco + ação MikroTik |
| **Perfis** | Só salva no banco | Banco + ação MikroTik |
| **Listas/Regras** | Só salva no banco | Banco + ação MikroTik |
| **Dispositivos** | Só salva no banco | Banco + ação MikroTik |
| **Action Processor** | 7 tipos de ação | 12+ tipos de ação |
| **Fallback perfil** | `default-navspot` hardcoded | Primeiro perfil da empresa |
| **Regenerar script** | Necessário para qualquer mudança | Só para mudanças estruturais (rede, interface) |

---

## Novos Tipos de Ação no MikroTik

```routeros
# Usuários (já existem)
create_user, remove_user, disable_user, enable_user
update_password, update_user_profile

# Dispositivos (novos)
block_device, unblock_device, kick_device

# Perfis (novos)
add_profile, update_profile_config, remove_profile

# Firewall (novo)
update_firewall_rules
```

---

## Benefícios

1. **Zero regeneração de script** para operações do dia-a-dia
2. **Consistência garantida** entre banco e MikroTik
3. **Fila de retry** automática para ações que falharem
4. **Auditoria completa** via tabela `acoes_pendentes`
5. **Funcionamento offline** - ações acumulam e são executadas quando o hotspot reconecta
