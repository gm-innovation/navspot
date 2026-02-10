

# Fix v7.1.62c: Two Syntax Errors Causing `expected end of command`

## Problem

The sync script fails at line 198 column 29 on the router due to two syntax bugs in the generated RouterOS code.

## Changes -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Fix 1: `[:type]` to `[:typeof]` (lines 885 and 888)

`[:type]` is not a valid RouterOS function. The correct form is `[:typeof]`.

- **Line 885**: `:if ([:type $navspotLock]="nothing")` becomes `:if ([:typeof $navspotLock]="nothing")`
- **Line 888**: `[:type $navspotLockTime]!="nothing"` becomes `[:typeof $navspotLockTime]!="nothing"`

### Fix 2: Split fallback profile set into two commands (line 941)

Split the combined `/ip hotspot profile set` into two separate commands, matching the established pattern used in the main AP handler. Each wrapped in `:do { } on-error={}` for robustness.

**Before (line 941):**
```
/ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=cookie,http-pap
```

**After:**
```
:do {/ip hotspot profile set $hp login-url=$lu dns-name=$dn} on-error={:log error "NAVSPOT-SYNC: fallback set login-url failed"}
:do {/ip hotspot profile set $hp login-by=cookie,http-pap} on-error={:log error "NAVSPOT-SYNC: fallback set login-by failed"}
```

## Files modified

| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/mikrotik-scripts/index.ts` | 885 | `[:type]` to `[:typeof]` |
| `supabase/functions/mikrotik-scripts/index.ts` | 888 | `[:type]` to `[:typeof]` |
| `supabase/functions/mikrotik-scripts/index.ts` | 941 | Split into 2 set commands with on-error |

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. Run `/system script run navspot-sync` -- no more `expected end of command`
4. Check logs for `AP THREW error` + `FALLBACK applied` or `AP ran`

