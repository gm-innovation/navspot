

# Template Infra v7.9.27 — Ultra-Stable Structural Fix

## Padrões aplicados

1. **Isolamento de placeholders**: Todos os `{{VAR}}` são atribuídos a `:local` no topo do script. Comandos usam apenas `$var`.
2. **FastTrack**: Comando direto sem `:do {} on-error={}` wrapper.
3. **Cleanup**: `[find]` sem `dynamic=no` para compatibilidade cross-version.
4. **Pool**: Concatenação nativa `($poolStart . "-" . $poolEnd)`.
5. **NAT**: `out-interface=$wanInterface` via variável local.
6. **WiFi SSID**: `configuration.ssid=$embarcacao` em linha única.
7. **login-by**: `http-chap,http-pap` (segurança + compatibilidade).
8. **login-url**: Inline no `add` via `$lurl` — **nunca** usar `set [find]` com propriedades hifenizadas.
9. **Walled Garden**: `$supabaseHost` via variável local + lista unificada.
10. **Bridge host cleanup**: `[find]` sem filtro `dynamic=no`.

## Regra de ouro

> **NUNCA** usar `set [find]` ou `set $var` com propriedades que contêm hífen (`login-url`, `http-cookie-lifetime`, etc.) no RouterOS 7. O parser interpreta o hífen como operador de subtração após resolver a expressão `[find]`.
