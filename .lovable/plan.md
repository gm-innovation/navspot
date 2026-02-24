

# Fix update_user Handler: Same `set $variable` at L7 Bug

## Root Cause

The `configure_hotspot_profile` fix (v7.8.10) resolved that handler, but the `update_user` handler has the **identical** failing pattern at the same nesting depth:

```text
L1: :do {                                     (fetch block)
L2:   :if ($s >= 0 ...) do={                  (markers)
L3:     :while (...) do={                     (action loop)
L4:       :if ($p1 >= 0) do={                 (pipe check)
L5:         :if ($c = "update_user") do={     (handler)
L6:           :if ($p2 >= 0) do={             (args check)
L7:             :if ([:len $idx] > 0) do={    (user exists)
                  set $idx password=...        ← FAILS at L7
```

The rendered file (line 135 in curl output = ns-install.rsc line ~113):
```routeros
/ip hotspot user set \$idx password=\$pw profile=\$pr comment=\"navspot\" disabled=no
```

## Fix

Replace `set $idx` with `set [find name=$un]` using the same inline-find + `:do {} on-error={}` upsert pattern already proven in `create_user`:

**Before (fails at L7):**
```routeros
:local idx [/ip hotspot user find name=$un]
:if ([:len $idx] > 0) do={
    /ip hotspot user set $idx password=$pw profile=$pr comment="navspot" disabled=no
} else={
    /ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
}
```

**After (set [find ...] at L6, works):**
```routeros
:do { /ip hotspot user set [find name=$un] password=$pw profile=$pr comment="navspot" disabled=no } on-error={
    /ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
}
```

This eliminates:
- The `$idx` variable and its assignment
- The `:if ([:len $idx] > 0)` guard (replaced by try/catch)
- Drops the `set` command from L7 to L6

The pattern is identical to the `create_user` handler (line 85-87) which works without issues.

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Replace the `update_user` handler's 7-line `$idx` block with 3-line `set [find name=$un]` + `on-error` upsert
- Bump version to `7.8.11`

## Technical Details

```text
Before (lines 111-116 of template):
  :local idx [/ip hotspot user find name=\$un]
  :if ([:len \$idx] > 0) do={
      /ip hotspot user set \$idx password=\$pw ... disabled=no
  } else={
      /ip hotspot user add name=\$un password=\$pw ... comment=\"navspot\"
  }

After:
  :do { /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr comment=\"navspot\" disabled=no } on-error={
      /ip hotspot user add name=\$un password=\$pw profile=\$pr comment=\"navspot\"
  }
```

## Risk

Low. The `create_user` handler already uses this exact `set [find ...] on-error={ add }` pattern at the same depth and works. The `disabled=no` property is preserved to re-enable previously disabled users during updates.

