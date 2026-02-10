

# Fix: RouterOS Parser Fails on Single-Line `:do {/ip hotspot profile set ... }` 

## Root Cause

The error `expected end of command (line 198 column 34)` points to `login-url` on TS line 941. The RouterOS parser cannot handle `/ip hotspot profile set` with key=value parameters when the closing `}` follows directly after the last value on the same line:

```routeros
# FAILS: parser sees $dn} as ambiguous
:do {/ip hotspot profile set $hp login-url=$lu dns-name=$dn} on-error={...}
```

The main Action Processor (lines 1031-1032) avoids this by placing the command on its own line. The fix is to match that pattern.

## Change -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Lines 941-942: Multi-line the `:do { }` blocks

**Before:**
```
:do {/ip hotspot profile set $hp login-url=$lu dns-name=$dn} on-error={:log error "NAVSPOT-SYNC: fallback set login-url failed"}
:do {/ip hotspot profile set $hp login-by=cookie,http-pap} on-error={:log error "NAVSPOT-SYNC: fallback set login-by failed"}
```

**After:**
```
:do {
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
} on-error={:log error "NAVSPOT-SYNC: fallback set login-url failed"}
:do {
/ip hotspot profile set $hp login-by=cookie,http-pap
} on-error={:log error "NAVSPOT-SYNC: fallback set login-by failed"}
```

This matches the exact pattern used by the working AP handler (lines 1031-1032) where `/ip hotspot profile set` is on its own line.

## Why the Previous Fix Failed

The single-line `:do {/ip hotspot profile set $hp login-url=$lu dns-name=$dn}` causes the parser to interpret `$dn}` as part of the value or variable context. Line 899 works with `:do {/system script run ...;:set apRan true}` because the semicolon + `:set` statement provides a clear separator before `}`.

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. Run `/system script run navspot-sync` -- no more `expected end of command`
4. Check logs for `AP THREW error` + `FALLBACK applied` or `AP ran`

