

# Fix Completo v7.9.27: 4 correções simultâneas no template infra

## Problema central
`/ip hotspot profile set $hsprof login-url=$lurl` — parser do hAP ax2 não reconhece `login-url` após variável no contexto global.

## Correções aplicadas

### Fix 1: Hotspot Profile — context menu (linhas 84-88)
Entrar em `/ip hotspot profile` antes de `add`/`set` para que o parser reconheça `login-url`.

### Fix 2: WiFi set — split SSID separado (linha 47)
Separar `configuration.ssid` em linha própria para evitar >160 chars com nomes longos.

### Fix 3: Walled Garden — split foreach (linha 94)
Dividir 6 domínios em 2 loops (4+2) para manter <160 chars.

### Fix 4: Auditoria completa
Todas as demais linhas verificadas — nenhuma excede 160 chars ou combina `[find]` + strings longas.
