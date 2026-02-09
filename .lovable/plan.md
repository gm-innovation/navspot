

# Fix v7.1.59: Sanitizar \u0026, corrigir Recovery, e adicionar diagnostico ao AP

## Diagnostico

A telemetria do sync script (linhas 781-784) ja foi corrigida na v7.1.57 com `:local pName` separado. Porem, 3 problemas restantes impedem o login:

### Problema 1: `\u0026` no JSON (sabotador silencioso)
`JSON.stringify()` do Deno codifica `&` como `\u0026`. O RouterOS le o arquivo raw e ve `\u0026` literal. A login-url fica: `...?h=UUID\u0026mac=$(mac)\u0026ip=$(ip)` em vez de `...?h=UUID&mac=$(mac)&ip=$(ip)`. O portal nunca recebe mac/ip.

### Problema 2: Recovery tem nested command na secao 2.5
Linha 246 do recovery-download ainda usa o padrao antigo: `find name=[/ip hotspot get $hs profile]`. Se o recovery crashar nesse ponto, o login-by nao e corrigido.

### Problema 3: Recovery nao passa ros_version=7
Linha 226 gera URL sem `&ros_version=7`, fazendo o instalador usar delays de ROS 6 (2500ms vs 500ms).

### Problema 4: AP sem logs de diagnostico
O AP nao produz logs granulares para identificar qual handler esta falhando.

## Mudancas

### 1. mikrotik-sync/index.ts (linhas 1659-1673): Sanitizar \u0026 no JSON

Aplicar `.replace(/\\u0026/g, '&')` no output do `JSON.stringify` antes de enviar a response:

```typescript
// ANTES (linha 1660):
JSON.stringify({
  pending_actions_pipe: formattedPipe,
  ...
})

// DEPOIS:
JSON.stringify({
  pending_actions_pipe: formattedPipe,
  ...
}).replace(/\\u0026/g, '&')
```

### 2. mikrotik-recovery-download/index.ts (linha 226): Adicionar ros_version=7

```typescript
// ANTES:
:local scriptsUrl "${scriptsUrl}?type=all&token=${syncToken}"

// DEPOIS:
:local scriptsUrl "${scriptsUrl}?type=all&token=${syncToken}&ros_version=7"
```

### 3. mikrotik-recovery-download/index.ts (linha 246): Corrigir nested command

```
# ANTES:
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}

# DEPOIS:
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={:set hp ""}}
```

### 4. mikrotik-scripts/index.ts: Adicionar logs de diagnostico ao CORE AP e FULL AP

Adicionar `:log info` antes de cada handler critico:
- `NS-AP: cfg-hp` antes de configure_hotspot_profile
- `NS-AP: c-prof` antes de create_profile
- `NS-AP: c-user` antes de create_user

### 5. mikrotik-recovery-download/index.ts: Incrementar VERSION para 7.1.59

Para que o nome do arquivo baixado reflita a versao corrigida.

## Arquivos a modificar

| Arquivo | Linha(s) | Mudanca |
|---------|----------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | 1660 | `.replace(/\\u0026/g, '&')` no JSON.stringify |
| `supabase/functions/mikrotik-recovery-download/index.ts` | 21 | VERSION = "7.1.59" |
| `supabase/functions/mikrotik-recovery-download/index.ts` | 226 | Adicionar `&ros_version=7` |
| `supabase/functions/mikrotik-recovery-download/index.ts` | 246 | Corrigir nested command |
| `supabase/functions/mikrotik-scripts/index.ts` | 899, 916, 935 | Logs NS-AP no CORE AP |
| `supabase/functions/mikrotik-scripts/index.ts` | 1009, 1026, 1045 | Logs NS-AP no FULL AP |

## O que NAO muda

- Telemetria do sync (ja corrigida na v7.1.57 com `:local pName`)
- escapeRouterOSPlaceholders removido (v7.1.58f ja aplicado)
- Nested commands no AP e Guardian (v7.1.58f ja aplicado)
- extractFirstJsonObject, filtro UUID, correcao URL `?h=`
- Portal HotspotLogin.tsx / hotspot-login edge function

## Redeploy

- `mikrotik-sync` -- sanitizacao \u0026
- `mikrotik-scripts` -- logs diagnostico AP
- `mikrotik-recovery-download` -- ros_version=7, nested command fix, version bump

## Acao manual apos deploy

1. Baixar novo Recovery script (sera `navspot-recovery-v7.1.59.rsc`)
2. Importar no roteador: `/import navspot-recovery-v7.1.59.rsc`
3. Aguardar 2 ciclos de sync
4. Verificar nos logs: `NS-AP: cfg-hp`, `NS-AP: c-prof`, `NS-AP: c-user`
5. Verificar que `telemetry collect failed` NAO aparece mais
6. Testar login do tripulante

## Resultado esperado

1. Login-url contem `&mac=$(mac)` (sem `\u0026`)
2. Recovery nao crashar na secao 2.5 (nested command corrigido)
3. Recovery roda 5x mais rapido (delays de ROS 7)
4. Logs do AP permitem diagnosticar exatamente qual handler falha
5. Backend confirma portal configurado (para de reinjetar repair)
6. Tripulante consegue fazer login

