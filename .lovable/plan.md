

# Fix v7.1.57: Proteger bloco de telemetria com on-error e quebrar encadeamento

## Problema

Logs v7.1.56 confirmam crash entre `step=2c-profiles` e `step=3-collect`. O bloco de telemetria (linhas 774-784) nao tem protecao `on-error` e usa encadeamento perigoso na linha 777:

```text
:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]
```

No ROS 7, se o resultado interno retornar tipo inesperado, o `find` externo crasha o parser.

## Mudancas cirurgicas

### 1. Reescrever bloco de telemetria (linhas 774-784)

**ANTES:**
```text
# v7.1.46: Collect profile state for telemetry
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:local hlb ""
:local hlu ""
:if ([:len $hp]>0) do={
:set hlb [/ip hotspot profile get $hp login-by]
:set hlu [/ip hotspot profile get $hp login-url]
}
```

**DEPOIS:**
```text
# v7.1.57: Telemetry with error isolation + broken chaining
:set step "2d-telemetry"
:log info "NAVSPOT-SYNC: step=2d-telemetry"
:local hp ""
:local hlb ""
:local hlu ""
:do {
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={
:local pName [/ip hotspot get $hs profile]
:set hp [/ip hotspot profile find name=$pName]
}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
:set hlb [/ip hotspot profile get $hp login-by]
:set hlu [/ip hotspot profile get $hp login-url]
}
} on-error={:log warning "NAVSPOT-SYNC: telemetry collect failed"}
```

Mudancas chave:
- Variaveis `hp`, `hlb`, `hlu` declaradas FORA do `:do` (garantem existencia para o JSON)
- Encadeamento quebrado: `[/ip hotspot get $hs profile]` salvo em `:local pName` antes de usar no `find`
- Bloco inteiro protegido com `on-error`
- Sub-step `2d-telemetry` adicionado para rastreabilidade

### 2. VERSION bump para 7.1.57

Em ambos os arquivos:
- `supabase/functions/mikrotik-scripts/index.ts` (linha 38)
- `supabase/functions/mikrotik-script-generator/index.ts` (linha 8)

### 3. Nenhuma outra mudanca

Todo o restante do script permanece intacto.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | Reescrever linhas 774-784 (telemetria), VERSION 7.1.57 |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.57 |

## Resultado esperado nos logs

```text
NAVSPOT-SYNC v7.1.57
step=1-lock
step=2-token
step=2a-active
step=2b-users
step=2c-profiles
step=2d-telemetry
step=3-collect
step=4-json
step=5-fetch
NAVSPOT-SYNC v7.1.57: OK
```

Se a telemetria falhar, aparecera `telemetry collect failed` como warning, mas `hlb` e `hlu` ficarao vazios e o sync completara normalmente.

