

# Fix v7.2.0 Sync Crash and Guardian Repair Loop (Hoisting + Logic Fix)

## Problem

1. `navspot-sync` crashes with `expected end of command (line 167)` because `login-by=cookie,http-pap,http-chap` (comma-separated literal) sits at nesting level 9+ in the fallback block.
2. Guardian triggers false repairs every 10 minutes because it treats `http-chap` as a fault indicator, but v7.2.0 intentionally enables it.
3. Recovery script still applies old `login-by=cookie,http-pap` (missing `http-chap`).

## Solution: Variable Hoisting + Guardian Logic Inversion

Declare `:local lby "cookie,http-pap,http-chap"` at a shallow nesting level and reference `$lby` in deep blocks, avoiding the RouterOS 7 parser crash.

## Changes

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Sync fallback (3 edits):**

- **Line 779** -- Insert `lby` declaration right after the `q` variable (nesting level 2, very shallow):
```
:local lby "cookie,http-pap,http-chap"
```

- **Line 912** -- Replace literal with variable:
```
/ip hotspot profile set $hp login-by=$lby
```

**AP Core (2 edits):**

- **Line 977** -- Insert `lby` declaration after `cnt` (nesting level 1):
```
:local lby "cookie,http-pap,http-chap"
```

- **Line 1003** -- Replace literal with variable:
```
/ip hotspot profile set $hp login-by=$lby
```

- **Line 1004** -- Update log message to use `$lby`:
```
:log info ("NAVSPOT: login-by=" . $lby . " aplicado em ".[/ip hotspot profile get $hp name])
```

**AP Full (2 edits):**

- **Line 1105** -- Insert `lby` declaration after `cnt` (nesting level 1):
```
:local lby "cookie,http-pap,http-chap"
```

- **Line 1130** -- Replace literal with variable:
```
/ip hotspot profile set $hp login-by=$lby
```

- **Line 1131** -- Update log message:
```
:log info ("NAVSPOT: login-by=" . $lby . " aplicado em ".[/ip hotspot profile get $hp name])
```

**Guardian (1 edit):**

- **Line 1362** -- Invert the check to detect MISSING `http-pap` instead of flagging present `http-chap`:
```
:if ([:find $loginBy "http-pap"]<0) do={:set needsRepair 1;:set missing ($missing."login-pap ")}
```

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

- **Line 243** -- Update log message:
```
:log info "NAVSPOT-RECOVERY v${VERSION}: Aplicando login-by=cookie,http-pap,http-chap..."
```

- **Line 249** -- Update the actual command:
```
/ip hotspot profile set $hp login-by=cookie,http-pap,http-chap
```
(This is at nesting level 2-3, safe without hoisting.)

- **Line 262** -- Update the summary note:
```
:log info "NOTE: login-by=cookie,http-pap,http-chap aplicado localmente"
```

## Verification (post-deploy)

1. Generate new `.rsc` from the panel -- confirm `:local lby "cookie,http-pap,http-chap"` appears in sync and AP scripts
2. Import on router and run `/system script run navspot-sync` -- must NOT crash
3. `/ip hotspot profile print detail where name="hsprof-navspot"` -- confirm `login-by` includes `http-chap`
4. Run Guardian manually -- should report `Sistema OK` (no false `login-chap` trigger)
5. Check recovery script: download and verify `login-by=cookie,http-pap,http-chap` is present

