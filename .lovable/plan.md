

# Fix definitivo: eliminar `set [find]` — colocar login-url no `add`

## Análise precisa do erro

```text
set [find name=$hspName] login-url=$lurl
                         ^--- col 26: parser interpreta "login-" como subtração
```

O parser do hAP ax2 falha em TODAS as variantes de `set` com `login-url`:
- `set [find ...] login-url=...` → falha
- `set $var login-url=...` → falha  
- Context menu + `set [find ...] login-url=...` → falha

O problema é estrutural: após resolver o `[find]` ou `$var`, o parser não reconhece `login-url` (propriedade com hífen) como token válido.

## Fix: mover login-url para dentro do `add`

```routeros
# ANTES (5 linhas, 87-89 falham):
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile
add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"
set [find name=$hspName] login-url=$lurl

# DEPOIS (2 linhas, sem set, sem find):
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br" login-url=$lurl
```

- `add` recebe TODAS as propriedades inline — parser aceita `login-url` normalmente em `add`
- `html-directory=hotspot` removido (é o default do RouterOS)
- Linha source = 151 chars (sob o limite de 160)
- Zero `set`, zero `[find]`, zero context menu

## Auditoria completa das demais linhas

Verifiquei todas as 106 linhas do template. Nenhuma outra usa `set [find] property-with-hyphen`. Linhas com `set [find]` existentes (37, 73) usam propriedades simples sem hífen (`bridge=`, `disabled=`) que o parser aceita.

## Alterações

1. **SQL UPDATE `script_templates` (id='infra')** — substituir linhas 85-89 por 2 linhas
2. **`.lovable/plan.md`** — documentar fix definitivo

