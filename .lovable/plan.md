# v6.9.31 - Fix Wildcard Parser Issue

## Status: ✅ DEPLOYED

## Problema Corrigido

O erro `expected end of command (line 641 column 33)` era causado pelo wildcard `*.supabase.co` dentro de um comando `[find dst-host="*.supabase.co"]`. O parser do RouterOS 6.x não aceita esse padrão específico durante `/import`.

## Mudanças Implementadas

### 1. Walled Garden - Host Explícito (CRITICAL)

**Antes (v6.9.30 - QUEBRAVA):**
```routeros
:do { /ip hotspot walled-garden remove [find dst-host="*.supabase.co"] } on-error={}
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-api"
:do { /ip hotspot walled-garden remove [find dst-host="*.supabase.in"] } on-error={}
/ip hotspot walled-garden add dst-host="*.supabase.in" action=allow comment="navspot-api"
```

**Depois (v6.9.31 - FUNCIONA):**
```routeros
# Backend (explicit host - v6.9.31: avoids *.supabase.* wildcard parser issues)
:do { /ip hotspot walled-garden remove [find where comment="navspot-api"] } on-error={}
/ip hotspot walled-garden add dst-host="focqrhkozhdefohroqyi.supabase.co" action=allow comment="navspot-api"
```

### 2. Token File - Extensão Explícita

**Antes:**
```routeros
/file print file=navspot-token where name="__never__"
/file set [find name~"navspot-token"] contents="..."
```

**Depois:**
```routeros
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="..."
```

### 3. Linter Atualizado

Nova regra adicionada para impedir regressão:
```typescript
{ regex: /dst-host="\*\.supabase\.(co|in)"/, desc: '*.supabase.* wildcard (breaks RouterOS 6.x parser)' }
```

## Arquivos Modificados

| Arquivo | Mudanças |
|---------|----------|
| `mikrotik-recovery-download/index.ts` | v6.9.31, backendHost, token .txt, linter |
| `mikrotik-script-generator/index.ts` | v6.9.31, backendHost, token .txt, linter |
| `ScriptModal.tsx` | scriptVersion = "6.9.31" |

## Como Testar

```routeros
# 1. Baixar recovery v6.9.31 pelo painel
# 2. Upload para Files do MikroTik
# 3. Executar:
/import navspot-recovery-v6.9.31.rsc

# 4. Verificar logs:
/log print where message~"NAVSPOT"
# Deve mostrar: "NAVSPOT-RECOVERY v6.9.31: REPARACAO CONCLUIDA!"

# 5. Verificar Walled Garden:
/ip hotspot walled-garden print where comment="navspot-api"
# Deve mostrar: dst-host=focqrhkozhdefohroqyi.supabase.co (host explícito)
```

## Resultado Esperado

O script v6.9.31 deve importar **sem erros** no RouterOS 6.46-6.49.x.
