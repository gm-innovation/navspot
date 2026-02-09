
# Fix v7.1.53: Parsing de 4 parametros no create_profile + sync resiliente

## Diagnostico

O FALLBACK action-processor (linha 317-320) ja parseia corretamente 4 parametros -- faz o segundo split para isolar `shared-users` do `limitBytes`. Porem o CORE (linha 898) e o FULL (linha 1008) NAO fazem isso, resultando em `shared-users="1|0"` que o RouterOS rejeita.

Alem disso, o primeiro sync e chamado sem protecao em dois pontos (instalador linha 665 e bootstrap linha 567), fazendo com que qualquer erro do sync aborte o `/import` inteiro.

## Mudancas (4 pontos cirurgicos)

### 1. CORE action-processor -- linha 898

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

**ANTES:**
```
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:set sh [:pick $sub ($p3+1) [:len $sub]]} else={:set rt $sub}
```

**DEPOIS:**
```
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:local sub2 [:pick $sub ($p3+1) [:len $sub]];:local p4 [:find $sub2 "|"];:if ($p4>=0) do={:set sh [:pick $sub2 0 $p4]} else={:set sh $sub2}} else={:set rt $sub}
```

Logica: apos extrair `$rt`, faz um segundo split no restante para isolar `$sh` de qualquer parametro adicional (como `limitBytes`).

### 2. FULL action-processor -- linha 1008

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

Mesmo fix identico ao item 1.

### 3. Wrap do primeiro sync no instalador -- linha 665

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

**ANTES:**
```
/system script run navspot-sync
```

**DEPOIS:**
```
:do {/system script run navspot-sync} on-error={:log warning "NAVSPOT-INSTALL: sync inicial falhou (nao-fatal)"}
```

### 4. Wrap do primeiro sync no bootstrap -- linha 567

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**ANTES:**
```
/system script run navspot-sync
```

**DEPOIS:**
```
:do {/system script run navspot-sync} on-error={:log warning ("NAVSPOT v\${VERSION}: sync inicial falhou (nao-fatal)")}
```

### 5. VERSION bump

- `mikrotik-scripts/index.ts`: VERSION de "7.1.52" para "7.1.53"
- `mikrotik-script-generator/index.ts`: VERSION de "7.1.52" para "7.1.53"

## O que NAO muda

- FALLBACK (linhas 310-324) -- ja esta correto, nao tocar
- Nenhuma outra logica do bootstrap, sync, guardian ou instalador
- Nenhuma mudanca em handlers que nao sejam `create_profile`

## Nota sobre o FALLBACK

O FALLBACK (linhas 317-320) ja implementa o parsing correto de 4 parametros:
```
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={ :set ps [:pick $sub2 0 $p4] } else={ :set ps $sub2 }
```

Os handlers CORE e FULL devem seguir exatamente essa mesma logica, adaptada ao estilo compactado em linha unica.

## Deploy

Redeployar `mikrotik-script-generator` e `mikrotik-scripts` apos as mudancas.
