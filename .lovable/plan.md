

# Fix v7.1.59b: Tokenizar placeholders + Telemetria granular

## Problema central: Double-Escaping via JSON.stringify

O `escapeRouterOSPlaceholders` converte `$(mac)` para `\$(mac)` no JS (1 backslash). Porem, `JSON.stringify` escapa o backslash para `\\$(mac)` no texto raw do JSON. O RouterOS le o arquivo raw e ve `\\$(mac)` -- dois backslashes. No RouterOS, `\\` = um backslash literal, e `$(mac)` AINDA e expandido. Resultado: o escape nao funciona.

A solucao v7.1.58f (remover o escape) tambem falha porque sem escape o RouterOS expande `$(mac)` para vazio no momento do `set`.

## Solucao: Tokenizacao pos-JSON.stringify

Em vez de escapar no JS (que JSON.stringify corrompe), usamos tokens neutros no pipeline JS e os substituimos por `\$(...)` DEPOIS do JSON.stringify, diretamente no texto raw.

```text
Pipeline:
  1. JS string: "$(mac)" -> "__NAVSPOT_DOLLAR__mac)"
  2. JSON.stringify: "__NAVSPOT_DOLLAR__mac)" (sem backslash, nada para escapar)
  3. pos-stringify replace: "__NAVSPOT_DOLLAR__" -> "\$(" no texto raw
  4. Raw JSON contem: "\$(mac)" (exatamente 1 backslash)
  5. RouterOS le arquivo: \$(mac) -> armazena $(mac) literal no profile
```

## Mudancas

### 1. mikrotik-sync/index.ts -- Substituir escapeRouterOSPlaceholders por tokenizacao

**Linha 36-38**: Substituir `escapeRouterOSPlaceholders` por `tokenizePlaceholders`:

```typescript
// v7.1.59b: Tokenize RouterOS runtime placeholders
// $(mac) -> __NAVSPOT_DOLLAR__mac) - neutral token that JSON.stringify won't touch
// Post-stringify, we replace __NAVSPOT_DOLLAR__ with \$( in the raw text
const PLACEHOLDER_TOKEN = '__NAVSPOT_DOLLAR__'
function tokenizePlaceholders(value: string): string {
  return value.replace(/\$\(([^)]+)\)/g, `${PLACEHOLDER_TOKEN}$1)`)
}
```

**Linha 1583-1586**: Usar `tokenizePlaceholders` no handler:

```typescript
case 'configure_hotspot_profile':
  // v7.1.59b: Tokenize placeholders (post-stringify converts to \$)
  const loginUrl = tokenizePlaceholders(String(p.login_url || ''))
  return `configure_hotspot_profile|${sanitizeForPipe(loginUrl)}|${p.dns_name || ''}`
```

**Linha 1671**: Adicionar replace de tokens pos-JSON.stringify:

```typescript
const jsonBody = JSON.stringify({
    pending_actions_pipe: formattedPipe,
    ...
  })
  .replace(/\\u0026/g, '&')                         // existente
  .replace(/__NAVSPOT_DOLLAR__/g, '\\$(')            // v7.1.59b: token -> \$(
```

Nota: no `.replace(/__NAVSPOT_DOLLAR__/g, '\\$(')`, a string JS `'\\$('` produz o texto raw `\$(` -- exatamente 1 backslash.

### 2. mikrotik-scripts/index.ts -- Telemetria granular (linhas 780-791)

Substituir o bloco monolitico por sub-steps com on-error individuais:

```text
:do {
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={
:do {:local pN [:tostr [/ip hotspot get $hs profile]];:set hp [/ip hotspot profile find name=$pN]} on-error={:log warning "NAVSPOT-SYNC: tele-profile-find failed"}
}
} on-error={:log warning "NAVSPOT-SYNC: tele-hs-find failed"}
:if ([:len $hp]=0) do={:do {:set hp [/ip hotspot profile find name="hsprof-navspot"]} on-error={}}
:if ([:len $hp]>0) do={
:do {:set hlb [:tostr [/ip hotspot profile get $hp login-by]]} on-error={:set hlb "";:log warning "NAVSPOT-SYNC: tele-lb failed"}
:do {:set hlu [:tostr [/ip hotspot profile get $hp login-url]]} on-error={:set hlu "";:log warning "NAVSPOT-SYNC: tele-lu failed"}
}
```

Beneficios:
- Se login-url falhar, login-by AINDA e reportado
- Logs indicam qual sub-step falhou (tele-hs-find, tele-profile-find, tele-lb, tele-lu)
- `[:tostr]` previne problemas com tipos internos do ROS 7.x
- Valores ficam `""` (nao `err-`) para nao confundir a logica de deteccao do backend

### 3. mikrotik-scripts/index.ts -- VERSION bump (linha 38)

```typescript
const VERSION = "7.1.59"
```

### 4. Remover funcao morta `escapeRouterOSPlaceholders` (linhas 34-38)

Substituir pela nova `tokenizePlaceholders`. Os comentarios explicam o motivo da mudanca.

## Arquivos modificados

| Arquivo | Linhas | Mudanca |
|---------|--------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | 34-38 | `escapeRouterOSPlaceholders` -> `tokenizePlaceholders` |
| `supabase/functions/mikrotik-sync/index.ts` | 1583-1586 | Usar `tokenizePlaceholders` |
| `supabase/functions/mikrotik-sync/index.ts` | 1671 | Adicionar `.replace(/__NAVSPOT_DOLLAR__/g, '\\$(')` |
| `supabase/functions/mikrotik-scripts/index.ts` | 38 | VERSION = "7.1.59" |
| `supabase/functions/mikrotik-scripts/index.ts` | 780-791 | Telemetria granular |

## Validacao do pipeline de escaping

```text
Entrada JS:     "https://navspot.lovable.app/hotspot-login?h=UUID&mac=$(mac)&ip=$(ip)"
tokenize:       "https://navspot.lovable.app/hotspot-login?h=UUID&mac=__NAVSPOT_DOLLAR__mac)&ip=__NAVSPOT_DOLLAR__ip)"
sanitizeForPipe: (sem mudanca - nao contem |)
JSON.stringify:  "...mac=__NAVSPOT_DOLLAR__mac)..." (tokens sao alfanumericos, nada escapado)
.replace u0026:  "...mac=__NAVSPOT_DOLLAR__mac)..." (sem &, nao afetado)
.replace token:  "...mac=\$(mac)..." (1 backslash no raw text)
RouterOS le:     ...mac=\$(mac)... 
AP extrai $lu:   "https://...mac=\$(mac)&ip=\$(ip)"
set login-url=$lu: RouterOS interpreta \$ como $ literal → armazena $(mac)
Hotspot runtime: $(mac) e expandido para MAC real do cliente
```

## O que NAO muda

- `.replace(/\\u0026/g, '&')` (mantido)
- `sanitizePipeForFileContents` (ja preserva backslashes)
- `sanitizeForPipe` (so substitui `|`)
- Recovery v7.1.59 (ja corrigido)
- Script-generator v7.1.59 (ja corrigido)
- AP handlers (ja com logs NS-AP e nested command fix)

## Redeploy

- `mikrotik-sync`
- `mikrotik-scripts`

## Teste pos-deploy

1. Forcar sync: `/system script run navspot-sync`
2. Verificar logs: `NS-AP: cfg-hp` seguido de sucesso (sem on-error)
3. Verificar profile: `/ip hotspot profile print` -- login-url deve conter `$(mac)` (sem backslash)
4. Verificar telemetria: backend deve receber `hotspot_login_url` com URL completa
5. Loop de reparo deve cessar (configure_hotspot_profile nao reinjetado)
6. Testar login do tripulante

