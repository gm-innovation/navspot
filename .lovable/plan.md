

# Fix v7.1.56: Coleta de hotspot com caminhos completos + sub-step logging

## Problema confirmado

Os logs v7.1.55 mostram crash entre `step=2-token` e `step=3-collect`. O crash ocorre nas linhas 760-767 que usam "context mode" do RouterOS (`/ip hotspot active` seguido de `find` sem caminho completo).

## Mudancas cirurgicas

### 1. Reescrever coleta de dados do hotspot (linhas 760-767)

**ANTES (context mode - causa do crash):**
```text
/ip hotspot active
:foreach a in=[find] do={
:set u ($u.[get $a user].",".[get $a mac-address].",".[get $a bytes-in].",".[get $a bytes-out].";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={:set r ($r.[get $i name].",")}
/ip hotspot user profile
:foreach x in=[find] do={:set p ($p.[get $x name].",")}
```

**DEPOIS (inline mode com sub-step logging e error handling):**
```text
:log info "NAVSPOT-SYNC: step=2a-active"
:do {:foreach a in=[/ip hotspot active find] do={
:local au [/ip hotspot active get $a user]
:local am [/ip hotspot active get $a mac-address]
:local abi [/ip hotspot active get $a bytes-in]
:local abo [/ip hotspot active get $a bytes-out]
:set u ($u.$au.",".$am.",".$abi.",".$abo.";")
}} on-error={:log warning "NAVSPOT-SYNC: active collect failed"}
:log info "NAVSPOT-SYNC: step=2b-users"
:do {:foreach i in=[/ip hotspot user find where dynamic=no] do={:set r ($r.[/ip hotspot user get $i name].",")
}} on-error={:log warning "NAVSPOT-SYNC: user collect failed"}
:log info "NAVSPOT-SYNC: step=2c-profiles"
:do {:foreach x in=[/ip hotspot user profile find] do={:set p ($p.[/ip hotspot user profile get $x name].",")
}} on-error={:log warning "NAVSPOT-SYNC: profile collect failed"}
```

### 2. VERSION bump para 7.1.56

Em ambos os arquivos:
- `supabase/functions/mikrotik-scripts/index.ts`: linha 38
- `supabase/functions/mikrotik-script-generator/index.ts`: linha 8

### 3. Nenhuma outra mudanca

O step logging geral (1-lock, 2-token, 3-collect, 4-json, 5-fetch) e o fix do `[:tostr]` da v7.1.55 sao mantidos intactos.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | Reescrever linhas 760-767 (coleta hotspot), VERSION 7.1.56 |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.56 |

## Resultado esperado nos logs

```text
NAVSPOT-SYNC v7.1.56
step=1-lock
step=2-token
step=2a-active
step=2b-users
step=2c-profiles
step=3-collect
step=4-json
step=5-fetch
NAVSPOT-SYNC v7.1.56: OK
```

Se uma coleta especifica falhar, aparecera o warning correspondente sem crashar o script.

## Deploy

Redeployar `mikrotik-scripts` e `mikrotik-script-generator`. Reimportar bootstrap v7.1.56 no roteador.

