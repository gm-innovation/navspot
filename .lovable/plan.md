

# Fix: Desativar Force Repair quando portal ja esta configurado

## Problema

O bloco de "Force Repair" na linha 1208 injeta `configure_hotspot_profile` e `create_whitelist_domain` a cada 3 syncs com telemetria nao confiavel. O roteador nao tem handler para `configure_hotspot_profile`, o que causa crash no processamento de TODAS as acoes daquele sync -- incluindo as validas como `create_user` e `add_user_profile`.

## Correcao

### Parte 1: Edge Function (mikrotik-sync, linhas 1208-1239)

Adicionar guard que verifica `portal_profile_version`. Se ja esta configurado, apenas resetar o contador sem injetar acoes quebradas.

**Antes (linha 1208):**
```typescript
if (newFailures >= 3) {
  // injeta configure_hotspot_profile + create_whitelist_domain
  // ...
}
```

**Depois:**
```typescript
const currentPPV = (hotspot as any).portal_profile_version
if (newFailures >= 3 && !currentPPV) {
  // Portal NUNCA configurado - force repair necessario
  // ... (codigo existente de injecao)
} else if (newFailures >= 3) {
  // Portal ja configurado - apenas resetar contador
  console.log(`[mikrotik-sync] v7.8.8: Skipping force repair - portal already configured (version=${currentPPV})`)
  await supabase.from('hotspots').update({ telemetry_failures: 0 }).eq('id', hotspot.id)
}
```

### Parte 2: SQL - Resetar estado e re-inserir acoes

```sql
-- Resetar hotspot
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb,
    telemetry_failures = 0,
    last_force_repair_at = NULL
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- Re-inserir acoes
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status) VALUES 
  ('27a1e1be-4ba7-4496-adb1-9227d3a80ad1', 'add_user_profile', 
   '{"name":"tripulacao-googlemarine","rate_limit":"3M/3M","shared_users":1,"limit_bytes":0}', 'pendente'),
  ('27a1e1be-4ba7-4496-adb1-9227d3a80ad1', 'create_user', 
   '{"user":"alexandre.silva","password":"048706","profile":"tripulacao-googlemarine"}', 'pendente');
```

## Resultado esperado

- Sem mais "Falha no fetch" causada por acoes nao reconhecidas
- Perfil e usuario chegam ao roteador sem interferencia
- Login volta a funcionar

## Arquivos modificados

| Tipo | Arquivo | Mudanca |
|------|---------|---------|
| Edge Function | mikrotik-sync (linhas 1208-1239) | Guard para pular force repair quando portal ja configurado |
| SQL | hotspots + acoes_pendentes | Reset estado + re-inserir acoes pendentes |

