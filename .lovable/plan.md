

# Fix: `expected end of command` on line 85 — hotspot profile add too many properties

## Root cause

The `login-url` added to the `/ip hotspot profile add` command on line 85 causes two problems:
1. **Property count**: 7 properties on a single `add` command exceeds the hAP ax2 parser limit (~5 properties per line)
2. **Column 160**: The long URL with `\$(mac)` escape sequences hits the parser at that position

## Fix (SQL UPDATE on `script_templates` id='infra')

Split into two commands — `add` with core properties, then `set` the `login-url` separately:

```routeros
# BEFORE (line 85):
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br" login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"

# AFTER (two commands):
/ip hotspot profile add name=$hspName login-by=http-pap http-cookie-lifetime=0s hotspot-address=$lanIp html-directory=hotspot dns-name="portal.navspot.com.br"
:do { /ip hotspot profile set [find name=$hspName] login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" } on-error={}
```

## Files modified

1. **SQL UPDATE `script_templates` (id='infra')** — split profile add into add + set
2. **`.lovable/plan.md`** — document fix
