

# Fix: line 86 column 52 — `:do` nesting too deep for profile set

## Root cause

The `:do { /ip hotspot profile set [find name=$hspName] login-url="..." } on-error={}` on line 86 creates nesting level L2 (`:do`) + L3 (`[find]`), which exceeds the hAP ax2 parser limit when combined with the long URL string containing `\$()` sequences. Column 52 is exactly where `login-url` starts after the `[find]` bracket closes.

## Fix

Remove the `:do {} on-error={}` wrapper. The profile was created on line 85 immediately before, so `[find]` will always match — no error handling needed.

```routeros
# BEFORE (line 86):
:do { /ip hotspot profile set [find name=$hspName] login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" } on-error={}

# AFTER:
/ip hotspot profile set [find name=$hspName] login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
```

## Files modified

1. **SQL UPDATE `script_templates` (id='infra')** — remove `:do` wrapper from profile set line
2. **`.lovable/plan.md`** — document fix
