

# Fix real: linha 90 = hotspot profile `login-url`

## Diagnóstico

O RSC renderizado mostra que a linha 90 é:
```
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br" login-url=$lurl
```

Contando caracteres: coluna 147 = início de `login-url`. O parser interpreta `login` como keyword e `-url` como subtração.

## Correção

Separar o `add` do `login-url`. Usar `set $profIdx` (com ID resolvido, sem `[find]` inline) para evitar a ambiguidade do parser:

```routeros
# 7. Hotspot Profile
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br"
:local profIdx [/ip hotspot profile find name=$hspName]
/ip hotspot profile set $profIdx login-url=$lurl
```

Isso funciona porque:
- O `add` não tem `login-url` (evita o parser travar)
- O `set $profIdx` usa o ID já resolvido (não `[find]` inline), então o parser processa `login-url` como property name sem ambiguidade

## Implementação

1. **SQL UPDATE `script_templates` (id='infra')** — substituir a linha do hotspot profile add por 3 linhas (add + find + set)
2. **`.lovable/plan.md`** — documentar que `login-url` especificamente causa parse error no `add` e deve ser definida via `set $id`
3. **Testar** — renderizar via gen7post e validar que a linha 90 não existe mais como comando longo

