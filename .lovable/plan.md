
# Fix: Cache de perfis impede re-sincronizacao

## Problema

O erro no roteador e claro: **"login failed: unknown user profile"** -- o perfil `tripulacao-googlemarine` nao existe no hardware.

Porem o backend acha que esta tudo certo:
1. `synced_profiles = ["tripulacao-googlemarine"]` (cache diz que o perfil ja foi enviado)
2. `registered_profiles_csv = ""` (roteador reporta 0 perfis)
3. Backend entra no fallback de cache (linha 1535-1541) e pula: "Profile in cache, skipping"
4. Log diz "All profiles confirmed synced" -- falso

**Causa raiz**: O sistema "fire-and-forget" marca a acao como `executado` e atualiza o cache no momento do envio. Se o roteador falha ao processar (bug do parser antigo), o cache fica inconsistente permanentemente.

## Correcao

### Parte 1: Codigo - Invalidar cache quando roteador reporta 0 perfis

No `mikrotik-sync/index.ts`, antes do loop de perfis (entre linhas 1517-1520), adicionar logica:

Se `registeredProfilesCsv` esta vazio **E** `syncedProfiles` tem itens, o cache esta mentindo. Limpar o cache para forcar reenvio.

```typescript
// v7.8.7: Invalidate cache when router reports 0 profiles but cache is non-empty
// This means a previous action was sent but never processed by the router
if (registeredProfilesCsv.length === 0 && syncedProfiles.length > 0) {
  console.warn(`[mikrotik-sync] v7.8.7: Cache/router mismatch - cache has ${syncedProfiles.length} profiles but router reports 0. Clearing cache to force re-sync`)
  syncedProfiles.length = 0 // Clear in-memory to force re-injection below
  await supabase
    .from('hotspots')
    .update({ synced_profiles: [] })
    .eq('id', hotspot.id)
}
```

Isso garante que na proxima iteracao do loop, o perfil sera re-injetado automaticamente sem intervencao manual.

### Parte 2: SQL imediato - Desbloquear agora

Limpar o cache novamente para que o fix funcione antes mesmo do deploy do codigo:

```sql
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

Nao precisa inserir nova acao -- o codigo de reconciliacao vai re-injetar o perfil automaticamente quando ver cache vazio.

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Adicionar invalidacao de cache (entre linhas 1517-1520) |
| SQL (hotspots) | Limpar synced_profiles para desbloqueio imediato |

## Resultado esperado

1. Cache limpo -> proximo sync detecta perfil ausente -> envia `create_profile` no payload
2. Template corrigido parseia o perfil corretamente
3. Login do `alexandre.silva` funciona
4. Futuras inconsistencias de cache sao auto-corrigidas pelo novo guard
