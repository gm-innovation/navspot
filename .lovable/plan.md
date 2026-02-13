

# Fix: Perfil nao criado no MikroTik — handler ausente no switch

## Problema

A acao `create_profile` foi inserida e marcada como "executado" no banco, mas o roteador **nao a processou corretamente**. Motivo: o `switch` na Edge Function `mikrotik-sync` nao tem um `case 'create_profile'`, entao cai no `default` (linha 1821) que gera um pipe malformado.

O handler correto esta em `case 'add_user_profile'` (linha 1787), que gera:
```
create_profile|nome|rate_limit|shared_users|limit_bytes
```

Mas o `default` gerou algo como:
```
create_profile|tripulacao-googlemarine|3M/3M|1
```
Faltando o campo `limit_bytes`, causando parse incorreto no roteador.

## Correcao

### 1. Edge Function: adicionar `create_profile` ao switch (mikrotik-sync)

No arquivo `supabase/functions/mikrotik-sync/index.ts`, linha 1787, adicionar `create_profile` como alias:

```typescript
case 'create_profile':      // <-- ADICIONAR
case 'add_user_profile':
  // v6.9.5: Create profile with normalized rate-limit
  ...
```

### 2. Re-inserir a acao com payload correto

Inserir uma nova acao `add_user_profile` (que ja tem handler) com os campos corretos:

```sql
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'add_user_profile',
  '{"name": "tripulacao-googlemarine", "rate_limit": "3M/3M", "shared_users": 1, "limit_bytes": 0}'::jsonb,
  'pendente'
);
```

## Resultado esperado

No proximo sync (~30s apos deploy):
1. O roteador recebe `create_profile|tripulacao-googlemarine|3M/3M|1|0`
2. O perfil e criado no MikroTik
3. O login de `alexandre.silva` passa a funcionar

## Alteracoes

| Tipo | Detalhe |
|------|---------|
| Edge Function | Adicionar `case 'create_profile':` ao switch em `mikrotik-sync/index.ts` |
| Migracao SQL | Inserir 1 acao `add_user_profile` com payload correto |

