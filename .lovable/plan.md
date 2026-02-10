

# Fix: Remove `:do { }` Wrappers and Add Quoting in Sync Fallback

## Root Cause (Confirmed)

The RouterOS 7 parser fails when `/ip hotspot profile set` with key=value parameters is wrapped in its own `:do { }` block. The working Action Processor uses the same command directly inside `:if ... do={ }` without individual wrappers.

## Change -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Lines 940-948: Remove `:do { }` wrappers + add quotes on `$lu` and `$dn`

**Before:**
```
:if ([:len $hp]>0) do={
:do {
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
} on-error={:log error "NAVSPOT-SYNC: fallback set login-url failed"}
:do {
/ip hotspot profile set $hp login-by=cookie,http-pap
} on-error={:log error "NAVSPOT-SYNC: fallback set login-by failed"}
:log info ("NAVSPOT-SYNC: FALLBACK applied login-url + login-by on " . [/ip hotspot profile get $hp name])
}
```

**After:**
```
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url="$lu" dns-name="$dn"
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info ("NAVSPOT-SYNC: FALLBACK applied login-url + login-by on " . [/ip hotspot profile get $hp name])
}
```

Two changes:
1. Removed the individual `:do { } on-error={}` wrappers (the outer block at line 951 handles errors).
2. Added quotes around `$lu` and `$dn` to protect special URL characters (`?`, `&`, `=`, `$`).

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. `/system script run navspot-sync` -- no more `expected end of command`
4. `/ip hotspot profile print` -- confirm `login-url` and `login-by` are set
5. Check logs for `FALLBACK applied` or `AP ran`

