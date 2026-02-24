

# Fix: Replace Regex Match with Exact Match for Profile Name

## Root Cause (Definitive)

The error at **line 159 column 95** is precisely at `dns-name=$dn` on this line inside the running navspot-sync script:

```text
:if ([:len $lu] > 0) do={/ip hotspot profile set [find where name~hsprof] dns-name=$dn}
                                                                                  ^col 95
```

The `~` (regex) operator without quotes makes the parser unable to distinguish where the pattern `hsprof` ends and the bracket `]` begins. It interprets `hsprof]` as part of the regex value, consuming the closing `]`, so `[find ...]` never closes. Then `dns-name` appears where the parser expects `]`, causing "expected end of command".

**The v7.8.12 fix of removing `\"` from `name~\"hsprof\"` was incorrect for regex operators.** Quotes are mandatory for regex patterns inside `[find]` brackets because the parser needs delimiters to separate the pattern from the `]`.

However, we **can't put the quotes back** because `\"` at this nesting depth (L6) also fails (that was the original problem).

## Solution: Use Exact Match Instead of Regex

The hotspot profile is always named `hsprof-navspot` (set in the infra template). There is no need for regex matching. Replace all `name~hsprof` with `name=hsprof-navspot` — an exact match that requires no quotes and has no ambiguity with brackets.

```text
Before (4 lines, ALL fail):
  /ip hotspot profile set [find where name~hsprof] login-by=...
  /ip hotspot profile set [find where name~hsprof] http-cookie-lifetime=3d
  /ip hotspot profile set [find where name~hsprof] login-url=$lu
  /ip hotspot profile set [find where name~hsprof] dns-name=$dn

After (4 lines, unambiguous):
  /ip hotspot profile set [find where name=hsprof-navspot] login-by=...
  /ip hotspot profile set [find where name=hsprof-navspot] http-cookie-lifetime=3d
  /ip hotspot profile set [find where name=hsprof-navspot] login-url=$lu
  /ip hotspot profile set [find where name=hsprof-navspot] dns-name=$dn
```

`name=hsprof-navspot` is a single unquoted word (hyphens are allowed in unquoted values). The parser sees `hsprof-navspot]` and correctly identifies `]` as the bracket close because `=` (exact match) doesn't consume special characters like `~` (regex) does.

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Replace all 4 occurrences of `name~hsprof` with `name=hsprof-navspot`
- Bump version to `7.8.14`

One file update:
- `supabase/functions/gen7post/index.ts`: bump `V` to `7.9.4`

## Technical Details

The profile name `hsprof-navspot` is hardcoded in the `infra` template (`/ip hotspot profile add name=$hspName` where `$hspName = "hsprof-navspot"`). It never changes. Using exact match is actually more correct than regex — it prevents accidentally matching other profiles that might contain "hsprof" in their name.

Template lines to change (in sync-standalone):
- Line 167: `name~hsprof` → `name=hsprof-navspot`
- Line 168: `name~hsprof` → `name=hsprof-navspot`
- Line 169: `name~hsprof` → `name=hsprof-navspot`
- Line 170: `name~hsprof` → `name=hsprof-navspot`

## Risk

Very low. The profile name is deterministic and set by our own infra template. Exact match is safer and more precise than regex.

