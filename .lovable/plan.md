

# Fix definitivo v7.9.27: login-url inline no `add`

## Problema
`set [find name=$hspName] login-url=$lurl` — parser do hAP ax2 não reconhece propriedades com hífen (`login-url`) após `[find]` ou `$var` em NENHUMA variante (global, context menu, variável intermediária).

## Solução aplicada
Eliminado `set [find]` completamente. Todas as propriedades (incluindo `login-url`) passadas inline no `add`:

```routeros
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br" login-url=$lurl
```

- `html-directory=hotspot` removido (é default do RouterOS)
- Linha = 151 chars (sob limite de 160)
- Template reduzido de 106 para 104 linhas
