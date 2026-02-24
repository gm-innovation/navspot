

# Fix Sync Template: Apply Inline Guard Pattern to configure_hotspot_profile

## Root Cause

The `/ip hotspot profile set $hsp property=value` commands at nesting Level 7 (L7) fail with "expected end of command" because the hAP ax2 parser cannot resolve property assignments on `set $variable` at that depth. The error at column 58 points exactly to `dns-name` — the parser treats `set $hsp` as complete and rejects the property name.

**Current nesting trace:**
```text
L1: :do {                                       (fetch block)
L2:   :if ($s >= 0 ...) do={                    (markers)
L3:     :while (...) do={                       (action loop)
L4:       :if ($p1 >= 0) do={                   (pipe check)
L5:         :if ($c = "configure_...") do={     (handler)
L6:           :if ($p2 >= 0) do={               (args check)
L7:             :if ([:len $hsp] > 0) do={      (profile guard)
                  set $hsp dns-name=$dn         <-- FAILS at L7
```

The `create_user` handler works at L7 because it uses inline `set [find name=$un]` which the parser resolves differently from `set $variable`.

## Fix: Inline Guard Pattern

Replace the two nested `:if` blocks (L6 + L7) with single-line inline guards, executing set commands at L5:

**Before (fails at L7):**
```routeros
:if ($c = "configure_hotspot_profile") do={          # L5
    :local p2 [:find $r "|"]
    :if ($p2 >= 0) do={                              # L6
        :local lu [:pick $r 0 $p2]
        :local dn [:pick $r ($p2 + 1) [:len $r]]
        :local hsp [/ip hotspot profile find ...]
        :if ([:len $hsp] > 0) do={                   # L7
            /ip hotspot profile set $hsp ...          # FAILS
        }
    }
}
```

**After (commands at L5):**
```routeros
:if ($c = "configure_hotspot_profile") do={          # L5
    :local lu ""
    :local dn ""
    :local hsp ""
    :local p2 [:find $r "|"]
    :if ($p2 >= 0) do={:set lu [:pick $r 0 $p2]; :set dn [:pick $r ($p2 + 1) [:len $r]]}
    :if ([:len $lu] > 0) do={:set hsp [/ip hotspot profile find where name~"hsprof"]}
    :if ([:len $hsp] > 0) do={/ip hotspot profile set $hsp login-by=cookie,http-pap,http-chap}
    :if ([:len $hsp] > 0) do={/ip hotspot profile set $hsp http-cookie-lifetime=3d}
    :if ([:len $hsp] > 0) do={/ip hotspot profile set $hsp login-url=$lu}
    :if ([:len $hsp] > 0) do={/ip hotspot profile set $hsp dns-name=$dn}
    :if ([:len $hsp] > 0) do={:log info ("NAVSPOT-SYNC: profile ok login-url=" . $lu)}
    :set cnt ($cnt + 1)
}
```

Each command is in a single-line `:if` at L6 — the deepest executable command is at L6, safely within the parser limit.

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Replace the multi-line `configure_hotspot_profile` handler with the inline guard version
- Bump version to `7.8.9`
- All variable declarations are hoisted to L5 with empty defaults
- Each set command is individually guarded by `[:len $hsp] > 0`

## Technical Details

The SQL will replace the block from `:if (\$c = \"configure_hotspot_profile\")` through its closing `}` with the flattened inline-guard version. The escaped syntax inside `source="..."` will use `\$` and `\"` as required.

## Risk

Low. The inline guard pattern is already validated in memory as the recommended approach for the hAP ax2. Each set command is individually protected. If `$hsp` is empty, all set commands are skipped.

