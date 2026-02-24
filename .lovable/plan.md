

# Fix: Split Nested Functions on Line 178 of sync-standalone

## Problem Confirmed

Template line 178 (database confirmed):
```routeros
:if ($p2 >= 0) do={:set lu [:pick $cfgLu 0 $p2]; :set dn [:pick $cfgLu ($p2 + 1) [:len $cfgLu]]}
```

Column 121 = `[:len $cfgLu]` nested inside `[:pick ...]` on a single line. The hAP ax2 parser cannot handle nested function calls (`[:pick ... [:len ...]]`) in a single statement.

## Changes Required

### 1. SQL UPDATE to `sync-standalone` template

Replace this single line:
```routeros
:if ($p2 >= 0) do={:set lu [:pick $cfgLu 0 $p2]; :set dn [:pick $cfgLu ($p2 + 1) [:len $cfgLu]]}
```

With multi-line, pre-computed length:
```routeros
:if ($p2 >= 0) do={
    :local cfgLen [:len $cfgLu]
    :set lu [:pick $cfgLu 0 $p2]
    :set dn [:pick $cfgLu ($p2 + 1) $cfgLen]
}
```

This eliminates the nested `[:len]` inside `[:pick]` by pre-computing it into `$cfgLen`.

### 2. Version bump in `gen7post/index.ts`

Line 2: `const V="7.9.7"` → `const V="7.9.8"`

## Why This Is the Final Fix

The profile block is already correctly positioned at L1/L2 (outside `:do { fetch }`). The only remaining issue is the inline nesting of `[:pick ... [:len ...]]` which the parser rejects regardless of scope depth. Splitting into separate statements resolves this definitively.

