

# Template Infra v7.9.27 — Regras de Ouro RouterOS 7

## Regras de ouro

> **NUNCA** usar `login-url` no comando `add` do hotspot profile. O parser do RouterOS 7 interpreta `login` como keyword e `-url` como subtração na coluna ~147. Sempre separar: `add` sem `login-url`, depois `find` para obter o ID, depois `set $id login-url=$var`.

> **NUNCA** usar variáveis (`$var`) dentro de listas inline `{$var;"literal";...}` no RouterOS 7. Usar `:toarray` com string CSV.

> **NUNCA** usar `set [find]` com propriedades hifenizadas (`login-url`, `http-cookie-lifetime`). Resolver o ID primeiro com `:local idx [find ...]`, depois `set $idx prop=val`.

## Padrão Hotspot Profile (add + find + set)

```routeros
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br"
:local profIdx [/ip hotspot profile find name=$hspName]
/ip hotspot profile set $profIdx login-url=$lurl
```

## Padrão Walled Garden (`:toarray`)

```routeros
:local hosts "cdn.jsdelivr.net,*.gstatic.com,*.googleapis.com,connectivitycheck.gstatic.com,*.navspot.com.br"
:if ([:len $supabaseHost] > 0) do={
  :set hosts ($supabaseHost . "," . $hosts)
}
:foreach d in=[:toarray $hosts] do={
  :do { /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot" } on-error={}
}
```
