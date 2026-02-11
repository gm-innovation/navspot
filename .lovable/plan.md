

# Fix v7.2.3: Achatar TODOS os handlers para Level 7

## Problema

O Fallback AP (v7.2.2F) continua crashando com "AP threw runtime error" em TODOS os syncs. O `dns-name` e `login-url` permanecem vazios. Dois pontos de falha identificados:

1. **Fallback AP - handler `create_profile`** atinge Level 8 (sub-parsing de `shared-users` com 3 niveis de `:if` aninhados)
2. **Sync Inline Fallback** - parser de `configure_hotspot_profile` atinge Level 9-10 (verificacao redundante de `[:len $seg]`, busca indireta via `hs-navspot`)

O `create_profile` causa crash de PARSE do Fallback AP inteiro antes mesmo da primeira linha executar, impedindo que o `configure_hotspot_profile` (ja corrigido na v7.2.2) seja alcancado.

## Mudancas

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

### 1. VERSION: "7.2.2" -> "7.2.3" (linha 38)

### 2. Fallback AP - Achatar `create_profile` (linhas 333-347)

Remover parsing profundo de `shared-users` (3 niveis extras). O perfil sera criado com `shared-users=1` (default do MikroTik). Reduz de Level 8 para Level 6.

Antes:
```text
:if ($c = "create_profile") do={        # L5
  :if ($p2 >= 0) do={                   # L6
    :if ($p3 >= 0) do={                 # L7
      :if ($p4 >= 0) do={              # L8  <-- CRASH
```

Depois:
```text
:if ($c = "create_profile") do={        # L5
  :if ($p2 >= 0) do={                   # L6  <-- SEGURO
```

### 3. Sync Inline Fallback - Achatar parser (linhas 916-947)

Remover verificacao redundante de `[:len $seg] > $prefixLen`, busca indireta via `hs-navspot`, e declarar `lu`/`dn` como strings vazias fora do `:if`. Reduz de Level 9-10 para Level 7.

Antes:
```text
:if (($apRan=false)||...)               # L6
  :if ($pos >= 0)                       # L7
    :if ([:len $seg] > $prefixLen)      # L8  <-- CRASH
      :if ($psep >= 0)                  # L9
        :if ([:len $hp]>0)              # L10
```

Depois:
```text
:if (($apRan=false)||...)               # L6
  :if ($pos >= 0)                       # L7
    (parsing inline, sem sub-ifs)       # L7  <-- SEGURO
```

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### 4. VERSION: "7.2.2" -> "7.2.3" (linha 8)

## Resumo de niveis apos fix

| Handler | Antes | Depois |
|---|---|---|
| Fallback AP: configure_hotspot_profile | L7 (ok desde v7.2.2) | L7 |
| Fallback AP: create_profile | L8 (CRASH) | L6 |
| Fallback AP: create_user | L7 | L7 (sem alteracao) |
| Sync Inline Fallback | L9-10 (CRASH) | L7 |

## Verificacao

Apos re-importar o bootstrap v7.2.3:
- `NAVSPOT-ACTION v7.2.3F: Start` (sem crash)
- `NAVSPOT: cfg-hp applied on hsprof-navspot`
- `dns-name` e `login-url` preenchidos no profile
- Logs mostrarao `NAVSPOT-SYNC v7.2.3`

