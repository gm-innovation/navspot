

# Fix: Move Profile Config Block Outside `:do { fetch }` (L4 → L1)

## Current State (Database Confirmed)

The `cfgLu` declaration is at **line 43** (inside `:if ($s >= 0)` — L3 scope). The profile config block is at **lines 170-180** (also inside L3). The `/ip hotspot profile set [find ...]` commands run at **L4/L5**, which is too deep for the hAP ax2 parser.

```text
Current nesting of profile block:
L1: source="..."                                    ← line 11
  L2: :do { fetch } on-error={}                     ← line 33
    L3: :if ($s >= 0 && $e > $s) do={}              ← line 39
      L4: :if ([:len $cfgLu] > 0) do={}             ← line 170
        L5: :if ($p2 >= 0) do={[:pick]}              ← line 174
        L5: /ip hotspot profile set [find ...]       ← lines 175-178 ← FAILS
```

## Changes Required (SQL UPDATE to `sync-standalone`)

### 1. Move `cfgLu` declaration from line 43 to before line 33

Insert `:local cfgLu \"\"` after line 32 (after the JSON post variable), before `:do {`. Remove it from line 43.

This ensures `cfgLu` is visible at the outer scope and its value survives the `:do {} on-error={}` block.

### 2. Remove profile block from inside `:if ($s >= 0)` (lines 170-180)

Delete the entire block:
```routeros
        :if ([:len \$cfgLu] > 0) do={
            ...4 profile set commands...
        }
```

### 3. Add profile block after `on-error={}` closes (after line 184)

Insert between `} on-error={...}` and `:set navspotSyncLock "0"`:

```routeros
:if ([:len \$cfgLu] > 0) do={
    :local p2 [:find \$cfgLu \"|\"]
    :local lu \$cfgLu
    :local dn \"\"
    :if (\$p2 >= 0) do={:set lu [:pick \$cfgLu 0 \$p2]; :set dn [:pick \$cfgLu (\$p2 + 1) [:len \$cfgLu]]}
    /ip hotspot profile set [find where name=hsprof-navspot] login-by=cookie,http-pap,http-chap http-cookie-lifetime=3d login-url=\$lu dns-name=\$dn
    :log info (\"NAVSPOT-SYNC: profile ok login-url=\" . \$lu)
}
```

**New nesting:**
```text
L1: source="..."
  L2: :if ([:len $cfgLu] > 0) do={}        ← SAFE
    L3: :if ($p2 >= 0) do={[:pick]}          ← SAFE
    L3: /ip hotspot profile set [find ...]   ← SAFE (L3 + [find] = L4 max)
```

### 4. Version bumps
- Template version comment: `7.8.17`
- `gen7post/index.ts`: `V = "7.9.7"`

## Implementation Summary

One SQL UPDATE to `script_templates` with three structural changes:
1. Move `cfgLu` declaration to outer scope (before `:do { fetch }`)
2. Remove profile block from L4 (inside `:if ($s >= 0)`)
3. Add profile block at L2 (after `on-error={}`)
4. Consolidate 4 `/ip hotspot profile set` commands into 1

One file edit to `gen7post/index.ts`: bump `V` to `"7.9.7"`.

## Why This Is the Definitive Fix

The previous fixes (v7.8.14–v7.8.16) flattened the handler inside the loop but left the profile block **inside** the `:do { fetch } on-error={}` and `:if ($s >= 0)` wrappers. The parser sums ALL nesting levels — being inside the fetch block adds +2 levels to everything. Moving outside drops from L5 to L3 for the most complex line.

