

# Fix Sync Template: Use Inline Find Instead of Variable Reference

## Problem

The error moved from column 58 → 64 → 76 across fixes, proving the set commands are being reached but still failing. The root cause is confirmed: **`set $variable property=value` fails at L7**, but **`set [find ...] property=value` works at L7**. This is proven by the `create_user` handler which successfully runs `set [find name=$un] password=$pw` at the same depth.

Current failing code:
```routeros
# At L6 (inside L5's do={}):
:if ([:len $hsp] > 0) do={/ip hotspot profile set $hsp login-by=cookie,http-pap,http-chap}
#                          ^^^^^^^^^^^^^^^^^^^^^^^^ set $variable at L7 = FAILS
```

Working `create_user` for comparison:
```routeros
:do { /ip hotspot user set [find name=$un] password=$pw profile=$pr } on-error={...}
#                      ^^^^^^^^^^^^^^^^^^^^ set [find ...] at L7 = WORKS
```

## Fix

Eliminate the `$hsp` variable entirely. Replace all `set $hsp` calls with `set [find where name~"hsprof"]` inline. Guard with `[:len $lu] > 0` instead of `[:len $hsp] > 0`.

**After:**
```routeros
:if ($c = "configure_hotspot_profile") do={
    :local lu ""
    :local dn ""
    :local p2 [:find $r "|"]
    :if ($p2 >= 0) do={:set lu [:pick $r 0 $p2]; :set dn [:pick $r ($p2 + 1) [:len $r]]}
    :if ([:len $lu] > 0) do={/ip hotspot profile set [find where name~"hsprof"] login-by=cookie,http-pap,http-chap}
    :if ([:len $lu] > 0) do={/ip hotspot profile set [find where name~"hsprof"] http-cookie-lifetime=3d}
    :if ([:len $lu] > 0) do={/ip hotspot profile set [find where name~"hsprof"] login-url=$lu}
    :if ([:len $lu] > 0) do={/ip hotspot profile set [find where name~"hsprof"] dns-name=$dn}
    :if ([:len $lu] > 0) do={:log info ("NAVSPOT-SYNC: profile ok login-url=" . $lu)}
    :set cnt ($cnt + 1)
}
```

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Replace all `set \$hsp` with `set [find where name~\"hsprof\"]`
- Remove the `:local hsp` variable and `:set hsp` assignment line
- Change guard from `[:len \$hsp]` to `[:len \$lu]`
- Bump version to `7.8.10`

## Why This Works

The RouterOS 7 parser on hAP ax2 resolves `[find ...]` inline at parse time, treating `set [find ...] property=value` as a single complete command. In contrast, `set $variable property=value` requires the parser to first resolve `$variable`, then continue parsing — which fails at nesting depth L7+.

## Risk

Low. The `[find where name~"hsprof"]` pattern is deterministic (only one profile matches). If no profile exists, `find` returns empty and `set` errors silently (no crash). The `[:len $lu] > 0` guard prevents execution when no data was parsed.

