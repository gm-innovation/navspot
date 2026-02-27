

# Bug: Sync handler corrompe `login-by` com a URL — captive portal desativado

## Causa raiz

O handler `configure_hotspot_profile` no template **sync-standalone** tem um bug crítico. O backend envia:

```
configure_hotspot_profile|https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)...|hotspot-slug.navspot.local
```

O handler no MikroTik faz:
```routeros
:local loginBy [:pick $val 0 $p2]   # ← recebe a URL
/ip hotspot profile set ... login-by=$loginBy   # ← ESCREVE A URL NO CAMPO login-by!
```

**Resultado**: `login-by` (que deveria ser `http-chap,http-pap`) é substituído por uma URL. O MikroTik não reconhece esse valor como método de autenticação → desabilita a interceptação do hotspot → clientes passam direto.

Isso explica por que funciona logo após o import do infra (profile correto com `login-by=http-chap,http-pap`), mas para de funcionar segundos depois quando o sync roda e corrompe o campo.

## Cronologia do problema (screenshot)

```text
15:31:02 → infra conclui (profile OK: login-by=http-chap,http-pap)
15:31:29 → DHCP atribui IP ao cliente
15:31:34 → Sync roda, handler "configure_hotspot_profile" CORROMPE login-by com URL
15:31:34 → "Sync OK v7.9.26"
→ A partir daqui: hotspot não intercepta mais, cliente navega livre
```

## Correção (2 templates)

### 1. Template `sync-standalone` — corrigir handler

O handler deve setar `login-url` (não `login-by`) e opcionalmente reforçar `login-by=http-pap`:

```routeros
# ANTES (BUGADO):
:local loginBy [:pick $val 0 $p2]
/ip hotspot profile set ... login-by=$loginBy

# DEPOIS (CORRETO):
:local loginUrl [:pick $val 0 $p2]
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url=$loginUrl login-by=http-pap } on-error={}
```

### 2. Template `infra` — adicionar login-url direto

Para que o captive portal funcione IMEDIATAMENTE após o import (sem depender do sync):

```routeros
# ANTES:
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"

# DEPOIS:
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br" login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
```

Isso requer adicionar `{{HOTSPOT_ID}}` ao mapa de variáveis em `gen7post/index.ts`.

## Arquivos modificados

1. **SQL UPDATE `script_templates` (id='sync-standalone')** — corrigir handler para usar `login-url` em vez de `login-by`
2. **SQL UPDATE `script_templates` (id='infra')** — adicionar `login-url` no profile add
3. **`supabase/functions/gen7post/index.ts`** — adicionar `{{HOTSPOT_ID}}` ao mapa de variáveis
4. **`.lovable/plan.md`** — documentar fix

