

# Fix Completo: Auditoria de TODAS as linhas do template infra

## Problema central (linha 110 renderizada / 88 do RSC)

```text
/ip hotspot profile set $hsprof login-url=$lurl
                                ^--- col 33: parser falha aqui
```

O parser do hAP ax2 não reconhece `login-url` como propriedade após `$hsprof` (variável resolvida em runtime para ID interno como `*0`). No contexto global, após o `$hsprof`, o parser interpreta `login-` como subtração ou token desconhecido.

**Solução**: Usar o padrão de "context menu" (já usado com sucesso nas linhas 101-104 do firewall filter). Ao entrar em `/ip hotspot profile` antes, `set` e `add` são executados dentro do contexto correto onde `login-url` é uma propriedade reconhecida.

## 4 correções simultâneas

### Fix 1: Hotspot Profile — context menu (linhas 84-88 template)

```routeros
# ANTES (3 linhas, $hsprof falha):
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"
:local hsprof [/ip hotspot profile find name=$hspName]
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile set $hsprof login-url=$lurl

# DEPOIS (context menu, sem variável intermediária):
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile
add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"
set [find name=$hspName] login-url=$lurl
```

Por quê funciona: dentro do context `/ip hotspot profile`, o parser reconhece `login-url` como propriedade. O `[find]` inline é curto (`login-url=$lurl` ≈ 20 chars). Nenhuma variável intermediária necessária.

### Fix 2: WiFi set — split SSID separado (linha 47 template)

Linha renderizada com nome longo de embarcação pode ultrapassar 160 chars.

```routeros
# ANTES (1 linha com 4 props dentro de :do):
:do { /interface wifi set $w datapath=dp-navspot security.authentication-types="" security.passphrase="" configuration.ssid="{{EMBARCACAO_NOME}}" } on-error={}

# DEPOIS (2 linhas):
:do { /interface wifi set $w datapath=dp-navspot security.authentication-types="" security.passphrase="" } on-error={}
:do { /interface wifi set $w configuration.ssid="{{EMBARCACAO_NOME}}" } on-error={}
```

### Fix 3: Walled Garden foreach — split lista (linha 94 template)

Linha renderizada = 162 chars (sobre o limite de 160).

```routeros
# ANTES (1 foreach com 6 domínios):
:foreach d in={"{{SUPABASE_HOST}}";"cdn.jsdelivr.net";"*.gstatic.com";"*.googleapis.com";"connectivitycheck.gstatic.com";"*.navspot.com.br"} do={

# DEPOIS (2 foreach):
:foreach d in={"{{SUPABASE_HOST}}";"cdn.jsdelivr.net";"*.gstatic.com";"*.googleapis.com"} do={
  /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot"
}
:foreach d in={"connectivitycheck.gstatic.com";"*.navspot.com.br"} do={
  /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot"
}
```

### Fix 4: Verificação de comprimento pós-substituição

Auditei todas as outras linhas renderizadas com placeholders substituídos. Nenhuma outra linha excede 160 chars ou combina `[find]` + strings longas.

## Resumo de alterações

1. **SQL UPDATE `script_templates` (id='infra')** — 4 correções simultâneas
2. **`.lovable/plan.md`** — documentar auditoria completa

