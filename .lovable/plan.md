
# Plano v6.9.6: Correção do Loop de Ações Repetidas

## Diagnóstico Preciso

O problema está na lógica de injeção de perfis automáticos (linhas 614-656). Essas ações são geradas **em toda requisição de sync** e reenviadas indefinidamente porque:

1. Elas são criadas dinamicamente a partir da tabela `perfis_velocidade` a cada sync
2. Elas têm IDs que começam com `auto-profile-*`
3. O filtro na linha 697-698 **exclui** ações `auto-*` do update de status
4. Mesmo que fossem marcadas, a próxima requisição geraria novas ações com os mesmos dados

### Fluxo Atual (Bugado)

```text
Sync 1:
├── Busca ações pendentes: []
├── Injeta: [auto-profile-tripulacao-googlemarine]
├── Marca como executado: [] (filtrado porque começa com "auto-")
└── Retorna: [[create_profile|tripulacao-googlemarine|3M/3M|1|0;]]

Sync 2 (1 minuto depois):
├── Busca ações pendentes: []
├── Injeta: [auto-profile-tripulacao-googlemarine] ← MESMO PERFIL NOVAMENTE!
├── Marca como executado: []
└── Retorna: [[create_profile|tripulacao-googlemarine|3M/3M|1|0;]] ← LOOP!
```

---

## Solução: Tracking de Perfis Já Sincronizados

O sistema precisa saber quais perfis já foram enviados para cada hotspot. Existem duas abordagens:

### Opção A: Usar Tabela de Tracking (Mais Robusta)

Criar uma tabela `hotspot_synced_profiles` para rastrear quais perfis foram enviados para cada hotspot.

### Opção B: Usar Campo no Hotspot (Mais Simples) ← RECOMENDADA

Adicionar um campo `synced_profiles` (JSONB array) na tabela `hotspots` para armazenar os slugs dos perfis já sincronizados.

---

## Implementação Detalhada

### 1. Migração SQL - Adicionar Campo de Tracking

```sql
-- Adicionar campo para rastrear perfis sincronizados
ALTER TABLE hotspots 
ADD COLUMN IF NOT EXISTS synced_profiles JSONB DEFAULT '[]'::jsonb;

-- Índice para performance (opcional)
CREATE INDEX IF NOT EXISTS idx_hotspots_synced_profiles 
ON hotspots USING gin(synced_profiles);

COMMENT ON COLUMN hotspots.synced_profiles IS 
'Array de slugs de perfis já sincronizados para este hotspot. Ex: ["tripulacao-padrao", "visitante"]';
```

### 2. Modificar mikrotik-sync/index.ts

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

#### 2.1 Buscar hotspot com campo de tracking (Linha ~189-193)

```typescript
// Linha 189-193 - Adicionar synced_profiles à query
const { data: hotspot, error: hotspotError } = await supabase
  .from('hotspots')
  .select('id, embarcacao_id, nome, status, synced_profiles')  // ← Adicionar synced_profiles
  .eq('sync_token', payload.sync_token)
  .single()
```

#### 2.2 Filtrar perfis já sincronizados (Linha ~614-658)

Substituir o bloco de injeção de perfis:

```typescript
// v6.9.6: Ensure all company profiles are synced (only NEW profiles)
if (embarcacao) {
  const { data: perfis } = await supabase
    .from('perfis_velocidade')
    .select('nome, velocidade_download, velocidade_upload, max_dispositivos, limite_dados_mb')
    .eq('empresa_id', embarcacao.empresa_id)

  if (perfis && perfis.length > 0) {
    // v6.9.5: Normalizar rate-limit - remover "B" e forçar maiúsculas
    const normalizeRateLimit = (value: string | null | undefined): string => {
      return String(value || '2M')
        .toUpperCase()
        .replace(/MB/g, 'M')
        .replace(/KB/g, 'K')
        .replace(/GB/g, 'G')
        .trim()
    }

    // v6.9.6: Obter perfis já sincronizados para este hotspot
    const syncedProfiles = (hotspot.synced_profiles || []) as string[]
    const newProfilesToSync: string[] = []

    const profileActions = perfis
      .map(p => {
        const slug = p.nome.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        
        // v6.9.6: Pular perfis já sincronizados
        if (syncedProfiles.includes(slug)) {
          console.log(`[mikrotik-sync] v6.9.6: Perfil já sincronizado, pulando: ${slug}`)
          return null
        }
        
        newProfilesToSync.push(slug)
        
        const uploadRate = normalizeRateLimit(p.velocidade_upload)
        const downloadRate = normalizeRateLimit(p.velocidade_download)
        const rateLimit = `${uploadRate}/${downloadRate}`
        const quota = p.limite_dados_mb || 0
        const shared = p.max_dispositivos || 1
        
        return {
          id: `auto-profile-${slug}`,
          type: 'add_user_profile' as const,
          payload: {
            name: slug,
            rate_limit: rateLimit,
            shared_users: shared,
            limit_bytes: quota * 1024 * 1024
          }
        }
      })
      .filter(Boolean) as PendingAction[]

    // Prepend to ensure profiles exist before users
    if (profileActions.length > 0) {
      formattedActions.unshift(...profileActions)
      console.log(`[mikrotik-sync] v6.9.6: Injetando ${profileActions.length} NOVOS perfis para sync`)
      
      // v6.9.6: Atualizar lista de perfis sincronizados
      const updatedSyncedProfiles = [...new Set([...syncedProfiles, ...newProfilesToSync])]
      await supabase
        .from('hotspots')
        .update({ synced_profiles: updatedSyncedProfiles })
        .eq('id', hotspot.id)
        .then(() => console.log(`[mikrotik-sync] v6.9.6: Marcados como sincronizados: ${newProfilesToSync.join(', ')}`))
    } else {
      console.log(`[mikrotik-sync] v6.9.6: Todos os perfis já estão sincronizados`)
    }
  }
}
```

### 3. Mecanismo de Invalidação de Cache

Quando um perfil é modificado (velocidade, quota, etc.), precisamos remover o slug do cache para forçar re-sincronização.

**Arquivo:** `src/hooks/usePerfisVelocidade.ts`

Após a mutação de update/delete de perfil, adicionar lógica para limpar o cache de todos os hotspots da empresa.

**Alternativa mais simples:** Adicionar um campo `updated_at` aos perfis e comparar com `hotspot.synced_at` ao invés de usar array de slugs.

### 4. Atualizar Versão

Atualizar todas as referências de `v6.9.5` para `v6.9.6` no arquivo.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | Adicionar `synced_profiles JSONB` à tabela `hotspots` |
| `mikrotik-sync/index.ts` | Buscar `synced_profiles` junto com hotspot |
| `mikrotik-sync/index.ts` | Filtrar perfis já sincronizados antes de injetar |
| `mikrotik-sync/index.ts` | Atualizar `synced_profiles` após enviar |
| `mikrotik-sync/index.ts` | Atualizar versão para v6.9.6 |

---

## Fluxo Corrigido

```text
Sync 1:
├── Busca hotspot.synced_profiles: []
├── Busca perfis da empresa: [tripulacao-googlemarine]
├── Perfis novos: [tripulacao-googlemarine] (não está em synced_profiles)
├── Injeta: [auto-profile-tripulacao-googlemarine]
├── Atualiza hotspot.synced_profiles: ["tripulacao-googlemarine"]
└── Retorna: [[create_profile|tripulacao-googlemarine|3M/3M|1|0;]]

Sync 2 (1 minuto depois):
├── Busca hotspot.synced_profiles: ["tripulacao-googlemarine"]
├── Busca perfis da empresa: [tripulacao-googlemarine]
├── Perfis novos: [] (já está em synced_profiles) ← FILTRADO!
├── Não injeta nada
└── Retorna: [[]] (vazio ou outras ações reais)

Sync 3 (admin cria novo perfil "visitante"):
├── Busca hotspot.synced_profiles: ["tripulacao-googlemarine"]
├── Busca perfis da empresa: [tripulacao-googlemarine, visitante]
├── Perfis novos: [visitante] (não está em synced_profiles) ← APENAS O NOVO!
├── Injeta: [auto-profile-visitante]
├── Atualiza hotspot.synced_profiles: ["tripulacao-googlemarine", "visitante"]
└── Retorna: [[create_profile|visitante|5M/5M|1|0;]]
```

---

## Resumo das Correções

| Problema | Antes | Depois |
|----------|-------|--------|
| Perfis reenviados | Todos a cada sync | Apenas novos |
| Tracking | Nenhum | Campo `synced_profiles` no hotspot |
| Loop infinito | Sim | Não |
| Performance | Envia N perfis sempre | Envia apenas delta |

---

## Considerações Adicionais

### Invalidação de Cache para Updates

Quando um perfil é **modificado** (não apenas criado), o sistema deve remover o slug do array `synced_profiles` para forçar re-sincronização:

```sql
-- Executar quando um perfil é atualizado
UPDATE hotspots 
SET synced_profiles = synced_profiles - 'slug-do-perfil-modificado'
WHERE embarcacao_id IN (
  SELECT id FROM embarcacoes WHERE empresa_id = 'uuid-da-empresa'
);
```

Isso pode ser implementado via trigger ou no hook de mutação do perfil.

### Forçar Re-sync Completo

Para forçar re-sincronização de todos os perfis de um hotspot:

```sql
UPDATE hotspots SET synced_profiles = '[]'::jsonb WHERE id = 'hotspot-id';
```

---

## Impacto

- **Criticidade:** Alta (elimina loop infinito)
- **Risco:** Baixo (lógica adicional, não modifica comportamento existente)
- **Compatibilidade:** RouterOS 6.x e 7.x (sem mudanças no script)
