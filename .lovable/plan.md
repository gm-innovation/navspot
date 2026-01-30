

# Plano v6.9.9: Sincronização de Perfis com Reconciliação

## Problemas Identificados

### 1. Perfil Marcado como Sincronizado mas Não Existe no MikroTik

O backend marca perfis como "sincronizados" (`synced_profiles`) de forma **otimista** (fire-and-forget), sem confirmar que o MikroTik realmente criou o perfil. Consequência:

- Perfil adicionado à fila de ações
- Imediatamente marcado como `synced_profiles: ["tripulacao-googlemarine"]`
- Se o MikroTik falhar ao executar, o perfil não existe
- Próxima sync: Backend vê que perfil já está em `synced_profiles` → não envia novamente
- Usuário criado com perfil inexistente → **"configuration error: unknown user profile"**

### 2. Falta de Reconciliação de Perfis

Similar ao problema de usuários que foi corrigido na v6.9.7/v6.9.8, não existe mecanismo para:
- Verificar se perfis em `synced_profiles` realmente existem no MikroTik
- Re-sincronizar perfis que foram removidos do dispositivo

### 3. Dados Atuais do Banco

```text
Hotspot: Engenharia Googlemarine
synced_profiles: ["tripulacao-googlemarine"] ← Marcado como sincronizado
registered_users: "default-trial,alexandre.silva," ← Usuário existe
```

O perfil foi marcado como sincronizado, mas os logs não mostram nenhuma ação `create_profile` sendo enviada recentemente - apenas `create_user`.

---

## Soluções Propostas

### Solução 1: Adicionar `registered_profiles_csv` ao MikroTik (Recomendada)

Similar ao `registered_users_csv` que já funciona, o MikroTik deve enviar a lista de perfis existentes.

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Adicionar coleta de perfis no script de sync:

```routeros
# Coletar lista de perfis cadastrados no hotspot
:local profiles ""
/ip hotspot user profile
:foreach i in=[find] do={
  :local pname [get $i name]
  :set profiles ($profiles . $pname . ",")
}
# Incluir no JSON: "registered_profiles_csv": "$profiles"
```

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Implementar reconciliação de perfis:

```typescript
// v6.9.9: Reconcile profiles using MikroTik data
async function reconcileProfiles(
  hotspot: { id: string; synced_profiles: string[] },
  registeredProfilesCsv: string,
  perfis: Perfil[],
  formattedActions: PendingAction[]
): Promise<void> {
  if (!registeredProfilesCsv || registeredProfilesCsv.trim().length === 0) {
    console.warn('[mikrotik-sync] v6.9.9: No registered_profiles_csv - skipping reconciliation')
    return
  }
  
  const registeredProfilesSet = new Set(
    registeredProfilesCsv.split(',').map(p => p.trim()).filter(p => p.length > 0)
  )
  
  const profilesToSync: string[] = []
  
  for (const perfil of perfis) {
    const slug = slugify(perfil.nome)
    
    // Perfil existe no MikroTik?
    if (registeredProfilesSet.has(slug)) {
      console.log(`[mikrotik-sync] v6.9.9: Profile confirmed in MikroTik: ${slug}`)
      continue
    }
    
    // Perfil NÃO existe - precisa ser criado
    profilesToSync.push(slug)
    formattedActions.unshift({
      id: `auto-profile-${slug}`,
      type: 'add_user_profile',
      payload: { name: slug, rate_limit: perfil.velocidade, ... }
    })
  }
  
  if (profilesToSync.length > 0) {
    console.log(`[mikrotik-sync] v6.9.9: Re-syncing ${profilesToSync.length} profiles`)
  }
}
```

### Solução 2: Reset Imediato do `synced_profiles` (Rápida)

Limpar o campo `synced_profiles` do hotspot afetado para forçar re-sincronização:

```sql
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb 
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

Isso fará com que o próximo sync detecte que o perfil não está em `synced_profiles` e envie a ação `create_profile` novamente.

**Problema**: Solução temporária - não evita o problema no futuro.

---

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `mikrotik-script-generator/index.ts` | Adicionar coleta de `registered_profiles_csv` | Alta |
| `mikrotik-sync/index.ts` | Adicionar campo `registered_profiles_csv` ao payload | Alta |
| `mikrotik-sync/index.ts` | Implementar `reconcileProfiles()` | Alta |
| `mikrotik-sync/index.ts` | Só marcar perfil como synced DEPOIS de confirmar no MikroTik | Média |

---

## Mudanças Detalhadas

### 1. Script Generator - Coletar Perfis

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Atualizar o `syncScriptSource` (linhas 240-286):

```typescript
const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
:local registered ""
:local profiles ""
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
# v6.9.7: Coletar lista completa de usuarios cadastrados
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
# v6.9.9: Coletar lista de perfis de usuario
/ip hotspot user profile
:foreach p in=[find] do={
:local pname [get $p name]
:set profiles ($profiles . $pname . ",")
}
# Construir JSON com todos os campos
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "," . $q . "registered_users_csv" . $q . ":" . $q . $registered . $q . "," . $q . "registered_profiles_csv" . $q . ":" . $q . $profiles . $q . "}")
...`
```

### 2. Backend - Processar Lista de Perfis

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Adicionar ao `SyncPayload` (linha 17-23):

```typescript
interface SyncPayload {
  sync_token: string
  active_users?: ActiveUser[]
  registered_users_csv?: string
  registered_profiles_csv?: string  // v6.9.9: Lista de perfis do MikroTik
  executed_actions?: string[]
  user_device_counts?: { user: string; count: number; macs: string[] }[]
}
```

### 3. Backend - Reconciliação de Perfis

Modificar a seção de perfis (linhas 771-843) para usar dados do MikroTik:

```typescript
// v6.9.9: Reconcile profiles using actual MikroTik data
if (embarcacao) {
  const { data: perfis } = await supabase
    .from('perfis_velocidade')
    .select('nome, velocidade_download, velocidade_upload, max_dispositivos, limite_dados_mb')
    .eq('empresa_id', embarcacao.empresa_id)

  if (perfis && perfis.length > 0) {
    // Parse registered profiles from MikroTik
    const registeredProfilesCsv = payload.registered_profiles_csv || ''
    const registeredProfilesSet = new Set(
      registeredProfilesCsv.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0)
    )
    
    console.log(`[mikrotik-sync] v6.9.9: Registered profiles from MikroTik: ${registeredProfilesSet.size}`)
    
    const newProfilesToSync: string[] = []
    
    const profileActions = perfis
      .map(p => {
        const slug = p.nome.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        
        // v6.9.9: Verificar se perfil existe no MikroTik (não apenas no cache)
        if (registeredProfilesCsv.length > 0 && registeredProfilesSet.has(slug)) {
          console.log(`[mikrotik-sync] v6.9.9: Profile confirmed in MikroTik: ${slug}`)
          return null
        }
        
        // Perfil não existe no MikroTik - precisa sincronizar
        newProfilesToSync.push(slug)
        
        // ... gerar ação de criação ...
        return { id: `auto-profile-${slug}`, type: 'add_user_profile', payload: {...} }
      })
      .filter(Boolean)
    
    if (profileActions.length > 0) {
      formattedActions.unshift(...profileActions)
      console.log(`[mikrotik-sync] v6.9.9: Injecting ${profileActions.length} profile actions`)
      
      // Atualizar synced_profiles
      const syncedProfiles = ((hotspot as any).synced_profiles || []) as string[]
      const updated = [...new Set([...syncedProfiles, ...newProfilesToSync])]
      await supabase.from('hotspots').update({ synced_profiles: updated }).eq('id', hotspot.id)
    }
  }
}
```

---

## Fluxo Corrigido

```text
Sync com registered_profiles_csv:
├── MikroTik envia: { "registered_profiles_csv": "default,tripulacao-padrao," }
├── Backend busca perfis da empresa: ["Tripulação Googlemarine"]
├── Slug: "tripulacao-googlemarine"
├── Está em registered_profiles_csv? NÃO
├── → Injeta ação: create_profile|tripulacao-googlemarine|3M/3M|1|0
├── Próximo sync: MikroTik envia: "default,tripulacao-padrao,tripulacao-googlemarine,"
├── → Backend confirma: Profile exists, skipping
└── Usuários podem ser criados com este perfil ✓
```

---

## Ordem de Execução Garantida

O código já garante a ordem correta:

1. **Perfis** são adicionados com `formattedActions.unshift()` (início do array)
2. **Usuários** são adicionados com `formattedActions.push()` (fim do array)
3. O MikroTik processa na ordem recebida

Resultado no pipe: `[[create_profile|tripulacao-googlemarine|...;create_user|alexandre.silva|...;]]`

---

## Ação Imediata Recomendada

Para resolver o problema AGORA enquanto a v6.9.9 não é implementada:

1. **Reset do cache de perfis**:
```sql
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb 
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

2. **Aguardar próxima sincronização** - o perfil será enviado novamente

3. **Regenerar e reinstalar o script** no MikroTik para garantir que ele tenha as correções v6.9.7+

---

## Impacto

- **Criticidade:** Alta (resolve erro de "unknown user profile")
- **Risco:** Baixo (adiciona verificação, não remove funcionalidade)
- **Compatibilidade:** RouterOS 6.x e 7.x
- **Requisito:** Usuário deve atualizar script no MikroTik após implementação

