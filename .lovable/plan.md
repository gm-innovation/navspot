

# Fix v7.1.58f: Corrigir double-escape e nested commands (ROS 7.x)

## Mudancas

### 1. mikrotik-sync/index.ts -- Remover double-escape (linha 1584)

Remover chamada a `escapeRouterOSPlaceholders()`. O `$(mac)` no JS passa como `$(mac)` no JSON (pois `$` nao precisa escape em JSON) e chega ao RouterOS corretamente.

```typescript
// ANTES:
const escapedLoginUrl = escapeRouterOSPlaceholders(String(p.login_url || ''))
return `configure_hotspot_profile|${sanitizeForPipe(escapedLoginUrl)}|${p.dns_name || ''}`

// DEPOIS:
const loginUrl = String(p.login_url || '')
return `configure_hotspot_profile|${sanitizeForPipe(loginUrl)}|${p.dns_name || ''}`
```

### 2. mikrotik-scripts/index.ts -- Corrigir nested commands em 3 locais

Todos os 3 pontos com `find name=[/ip hotspot get $hs profile]` serao separados em `:local` + `find`:

**Linha 908 (CORE AP):**
```
# ANTES:
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}

# DEPOIS:
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={:set hp ""}}
```

**Linha 1018 (FULL AP):**
Mesma correcao, mesma variavel `pN`.

**Linha 1233 (Guardian):**
```
# ANTES:
:if ([:len $hs]>0) do={:set hsprof [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}

# DEPOIS:
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hsprof [/ip hotspot profile find name=$pN]} on-error={:set hsprof ""}}
```

### 3. Redeploy + Reimport

- Redeploy `mikrotik-sync` e `mikrotik-scripts`
- Usuario reimporta Recovery script no roteador

## Arquivos a modificar

| Arquivo | Linhas | Mudanca |
|---------|--------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | 1584 | Remover escapeRouterOSPlaceholders |
| `supabase/functions/mikrotik-scripts/index.ts` | 908 | Separar nested command (CORE AP) |
| `supabase/functions/mikrotik-scripts/index.ts` | 1018 | Separar nested command (FULL AP) |
| `supabase/functions/mikrotik-scripts/index.ts` | 1233 | Separar nested command (Guardian) |

## O que NAO muda

- extractFirstJsonObject (v7.1.58c)
- Filtro UUID (v7.1.58d)
- Correcao URL `?h=` (v7.1.58e)
- Recovery download (ja reseta flags)
- sanitizeForPipe() (mantido para seguranca)
- Portal HotspotLogin.tsx / hotspot-login edge function

## Resultado esperado

1. Pipe contem `$(mac)` sem backslashes extras
2. AP processa `configure_hotspot_profile` sem crash de nested command
3. login-url armazenado corretamente, login-by = cookie,http-pap
4. `create_profile` e `create_user` executam normalmente
5. Tripulante consegue fazer login

