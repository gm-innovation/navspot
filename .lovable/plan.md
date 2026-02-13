

# Fix: Cache de perfis invalido apos recovery (v7.8.6)

## Problema

O usuario `alexandre.silva` nao consegue logar no hotspot porque o perfil `tripulacao-googlemarine` nao existe no MikroTik, mas o cache do banco (`synced_profiles`) diz que ja foi sincronizado.

## Acoes

### 1. Limpar cache do hotspot (acao imediata)

Executar SQL via migration tool para limpar o cache de perfis e resetar falhas de telemetria:

```sql
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb, telemetry_failures = 0 
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

Nota: Como o tool de read-query e somente leitura, usaremos o insert tool para executar este UPDATE.

### 2. Corrigir logica de reconciliacao no mikrotik-sync

Arquivo: `supabase/functions/mikrotik-sync/index.ts` (linhas 1527-1534)

Substituir o bloco de fallback atual:

```typescript
} else {
  // v6.9.9: Fallback - MikroTik didn't send profiles (old script)
  // Use cached synced_profiles but log warning
  if (syncedProfiles.includes(slug)) {
    console.log(`[mikrotik-sync] v6.9.9: Profile in cache (no MikroTik data), skipping: ${slug}`)
    return null
  }
  console.warn(`[mikrotik-sync] v6.9.9: No MikroTik profile data, will sync: ${slug}`)
}
```

Por:

```typescript
} else {
  // v7.8.6: Check if router is in virgin state (no profiles AND no users)
  const registeredUsersCsv = payload.registered_users_csv || ''
  if (registeredUsersCsv.trim().length === 0) {
    // Router has nothing - ignore cache, force profile re-sync
    console.log(`[mikrotik-sync] v7.8.6: Router in virgin state (no profiles, no users), forcing profile sync: ${slug}`)
  } else {
    // Old script sent users but not profiles - trust cache
    if (syncedProfiles.includes(slug)) {
      console.log(`[mikrotik-sync] v6.9.9: Profile in cache (no MikroTik data), skipping: ${slug}`)
      return null
    }
    console.warn(`[mikrotik-sync] v6.9.9: No MikroTik profile data, will sync: ${slug}`)
  }
}
```

A logica: se o roteador nao tem perfis E nao tem usuarios, ele esta em estado virgem (pos-recovery ou install limpo). Nesse caso, ignoramos o cache e forcamos o reenvio de todos os perfis.

### 3. Deploy automatico

O `mikrotik-sync` sera redeployado automaticamente apos a edicao.

## Resultado esperado

Apos a limpeza do cache (passo 1), o proximo sync (~1 min) enviara:

```text
add_user_profile|tripulacao-googlemarine|3M/3M|1|0
create_user|alexandre.silva|048706|tripulacao-googlemarine
```

O perfil sera criado antes do usuario, permitindo o login.

## Ordem de execucao

1. Limpar `synced_profiles` no banco (resolve o problema agora)
2. Atualizar logica no `mikrotik-sync/index.ts` (previne recorrencia)
3. Deploy automatico da edge function

