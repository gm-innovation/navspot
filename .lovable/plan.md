

# Fix v7.1.55: Step logging diagnostico + fix time tostr

## Problema

O sync v7.1.54 crasha silenciosamente. Os logs mostram:
```
NAVSPOT-SYNC v7.1.54
NAVSPOT-SYNC: uptime-as-secs indisponivel
NAVSPOT-SYNC: CRASH=
NAVSPOT-SYNC v7.1.54: OK
```

O `$error` vem vazio, impossibilitando saber ONDE o crash ocorre. O crash esta entre o lock (linha 740) e o fetch (linha 784).

## Mudancas (3 pontos cirurgicos)

Arquivo unico: `supabase/functions/mikrotik-scripts/index.ts`, funcao `generateSyncSource`

### 1. Adicionar variavel `step` + step logging (5 pontos)

Inserir `:local step "0-init"` no inicio do bloco `:do {`, e atualizar `step` antes de cada operacao perigosa:

| Step | Posicao | Operacao |
|------|---------|----------|
| `1-lock` | Apos adquirir lock (linha 747) | Lock OK, proximo e ler token |
| `2-token` | Apos ler token (linha 750) | Token OK, proximo e coletar hotspot |
| `3-collect` | Apos coletar dados do hotspot (linha 773) | Coleta OK, proximo e montar JSON |
| `4-json` | Apos montar o payload JSON (linha 774) | JSON OK, proximo e parsear time |
| `5-fetch` | Apos parsear time, antes do fetch (linha 782) | Time OK, proximo e fazer fetch |

### 2. Fix preventivo: converter time para string (linha 777)

**ANTES:**
```
:local ts [/system clock get time]
```

**DEPOIS:**
```
:local ts [:tostr [/system clock get time]]
```

Isso previne crash se ROS 7 retornar tipo `time` nativo em vez de string.

### 3. Atualizar on-error global para incluir step (linha 833)

**ANTES:**
```
} on-error={:log error ("NAVSPOT-SYNC: CRASH=" . [:tostr $error]);:set navspotSyncLock "0"}
```

**DEPOIS:**
```
} on-error={:log error ("NAVSPOT-SYNC: CRASH step=" . $step);:set navspotSyncLock "0"}
```

Usa `$step` em vez de `$error` (que vem vazio nesse ROS). Assim saberemos exatamente qual secao causou o crash.

### 4. VERSION bump para 7.1.55

`const VERSION = "7.1.54"` -> `"7.1.55"`

Tambem atualizar em `mikrotik-script-generator/index.ts` para manter alinhado.

## Resultado esperado nos logs

**Se o crash e no time (hipotese principal):**
```
NAVSPOT-SYNC v7.1.55
step=1-lock
step=2-token
step=3-collect
step=4-json
CRASH step=4-json      <- crash no [:pick] do time
```

**Se o crash e na coleta de hotspot:**
```
NAVSPOT-SYNC v7.1.55
step=1-lock
step=2-token
CRASH step=2-token     <- crash nos comandos /ip hotspot
```

**Se tudo funcionar (fix do time resolveu):**
```
NAVSPOT-SYNC v7.1.55
step=1-lock
step=2-token
step=3-collect
step=4-json
step=5-fetch
NAVSPOT-SYNC v7.1.55: OK
```

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | Step logging, fix time tostr, on-error com step, VERSION 7.1.55 |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.55 |

## Deploy

Redeployar `mikrotik-scripts` e `mikrotik-script-generator`. Reimportar bootstrap no roteador.

