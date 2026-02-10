

# Fix: Remaining `[:type]` on line 840 causing persistent parse error

## Root Cause

Line 840 of `supabase/functions/mikrotik-scripts/index.ts` still contains the invalid `[:type $s]` syntax:

```
:if ([:type $s]="nil") do={:log warning ("NAVSPOT-SYNC: no [[ marker in " . $rl . "b resp")}
```

RouterOS parses the ENTIRE script before execution. Even though we fixed `[:type]` on lines 885 and 888, this earlier occurrence on line 840 causes the parser to fail first. The error `line 199 column 29` points exactly to this token.

## Change -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Line 840: Replace `[:type]` with `[:typeof]`

**Before:**
```
:if ([:type $s]="nil") do={:log warning ("NAVSPOT-SYNC: no [[ marker in " . $rl . "b resp")}
```

**After:**
```
:if ([:typeof $s]="nil") do={:log warning ("NAVSPOT-SYNC: no [[ marker in " . $rl . "b resp")}
```

This is the LAST remaining `[:type]` usage in the sync script. All other occurrences already use the correct `[:typeof]` form.

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. Run `/system script run navspot-sync` -- no more `expected end of command`
4. Check logs for `AP THREW error` + `FALLBACK applied` or `AP ran`

