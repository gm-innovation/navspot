

# Fix: Flatten configure_hotspot_profile Handler (L7 → L6)

## Current State (Database Confirmed)

Lines 164-168 of `sync-standalone` template:

```routeros
:if (\$c = \"configure_hotspot_profile\") do={           ← L6
    :local p2 [:find \$r \"|\"]
    :if (\$p2 >= 0) do={:set cfgLu [:pick \$r 0 \$p2]; :set cfgDn [:pick \$r (\$p2 + 1) [:len \$r]]}   ← L7 FAILS
    :set cnt (\$cnt + 1)
}
```

The `:if (\$p2 >= 0) do={...}` at **L7** with `[:pick]` and `[:len]` inside crashes the hAP ax2 parser. This is exactly what the error at line 165 column 70 points to.

## Changes Required

### 1. Remove `cfgDn` declaration (line 44)
```routeros
# Before:
:local cfgLu \"\"
:local cfgDn \"\"

# After:
:local cfgLu \"\"
```

### 2. Flatten handler (lines 164-168)
```routeros
# Before (L7 — crashes):
:if (\$c = \"configure_hotspot_profile\") do={
    :local p2 [:find \$r \"|\"]
    :if (\$p2 >= 0) do={:set cfgLu [:pick \$r 0 \$p2]; :set cfgDn [:pick \$r (\$p2 + 1) [:len \$r]]}
    :set cnt (\$cnt + 1)
}

# After (L6 — safe, single assignment):
:if (\$c = \"configure_hotspot_profile\") do={
    :set cfgLu \$r
    :set cnt (\$cnt + 1)
}
```

### 3. Update post-loop block (lines 172-178) to parse pipe there

```routeros
# Before (uses pre-parsed cfgLu and cfgDn):
:if ([:len \$cfgLu] > 0) do={
    /ip hotspot profile set [find where name=hsprof-navspot] login-by=cookie,http-pap,http-chap
    /ip hotspot profile set [find where name=hsprof-navspot] http-cookie-lifetime=3d
    /ip hotspot profile set [find where name=hsprof-navspot] login-url=\$cfgLu
    /ip hotspot profile set [find where name=hsprof-navspot] dns-name=\$cfgDn
    :log info (\"NAVSPOT-SYNC: profile ok login-url=\" . \$cfgLu)
}

# After (parses raw cfgLu = "url|dns" here at L4):
:if ([:len \$cfgLu] > 0) do={
    :local p2 [:find \$cfgLu \"|\"]
    :local lu \$cfgLu
    :local dn \"\"
    :if (\$p2 >= 0) do={:set lu [:pick \$cfgLu 0 \$p2]; :set dn [:pick \$cfgLu (\$p2 + 1) [:len \$cfgLu]]}
    /ip hotspot profile set [find where name=hsprof-navspot] login-by=cookie,http-pap,http-chap
    /ip hotspot profile set [find where name=hsprof-navspot] http-cookie-lifetime=3d
    /ip hotspot profile set [find where name=hsprof-navspot] login-url=\$lu
    /ip hotspot profile set [find where name=hsprof-navspot] dns-name=\$dn
    :log info (\"NAVSPOT-SYNC: profile ok login-url=\" . \$lu)
}
```

The pipe parsing now happens at L5 (inside L4 `:if` → L5 `:if ($p2 >= 0)`), well within the parser limit.

### 4. Version bumps
- Template version comment: `7.8.16`
- `gen7post/index.ts`: `V = "7.9.6"`

## Implementation

One SQL UPDATE to `script_templates` where `id = 'sync-standalone'` with the three changes above, plus one line edit to `gen7post/index.ts`.

## Technical Details — Nesting Depth Comparison

```text
Post-loop block nesting:
L1: source="..."
  L2: :do { fetch } on-error={}
    L3: :if ($s >= 0) do={}
      L4: :if ([:len $cfgLu] > 0) do={}
        L5: :if ($p2 >= 0) do={:set lu ...}   ← SAFE (L5)
        L4: /ip hotspot profile set ...        ← SAFE (L4)

vs. Inside-loop (before fix):
L1: source="..."
  L2: :do { fetch }
    L3: :if ($s >= 0) do={}
      L4: :while () do={}
        L5: :if ($p1 >= 0) do={}
          L6: :if ($c = "configure_hotspot_profile") do={}
            L7: :if ($p2 >= 0) do={:set cfgLu ...}   ← CRASHES
```

