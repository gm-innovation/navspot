

# Atualizar template infra com correções estruturais testadas

Sua versão está excelente. Incorpora todas as lições aprendidas. Há **um ponto crítico** a resolver antes de aplicar:

## Ponto de atenção: `login-url` ausente

Seu template **não inclui `login-url`** no hotspot profile. Sem isso, o captive portal redireciona para a página HTML local padrão do MikroTik em vez do NavSpot. Precisamos manter a `login-url` — mas usando o padrão de variável local que você propôs:

```routeros
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br" login-url=$lurl
```

A `login-url` é passada via `$lurl` (variável local) inline no `add` — sem `set [find]`, sem problemas de parse.

## Diferenças entre o DB atual e a sua versão

| # | Mudança | Ação |
|---|---------|------|
| 1 | Adicionar `:local poolStart/poolEnd/wanInterface/embarcacao/supabaseHost` | Aplicar |
| 2 | FastTrack — remover `:do {} on-error={}` | Aplicar |
| 3 | Cleanup — remover `dynamic=no` | Aplicar |
| 4 | Pool — concatenação `($poolStart . "-" . $poolEnd)` | Aplicar |
| 5 | NAT — usar `$wanInterface` | Aplicar |
| 6 | WiFi SSID — usar `$embarcacao` (1 linha em vez de 2) | Aplicar |
| 7 | `login-by=http-chap,http-pap` | Aplicar |
| 8 | Walled Garden — `$supabaseHost` + lista unificada | Aplicar |
| 9 | Bridge host — `[find]` sem `dynamic=no` | Aplicar |
| 10 | **Adicionar `login-url=$lurl`** no profile add | **Crítico** |

## Implementação

1. **SQL UPDATE `script_templates` (id='infra')** — substituir conteúdo completo pelo template do usuário + `login-url=$lurl`
2. **`.lovable/plan.md`** — documentar versão final estável

