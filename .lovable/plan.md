

# Fix Sync Template: Nesting Depth Exceeds RouterOS 7 Limit

## Root Cause

The previous fix (splitting multi-property set) was a misdiagnosis. The actual problem is **nesting depth**. The `configure_hotspot_profile` handler wraps each `/ip hotspot profile set` command inside `:do {} on-error={}` blocks, pushing them to nesting Level 8 (L8). RouterOS 7 on hAP ax2 rejects executable commands beyond L7.

**Nesting trace for the failing line:**
```text
L1: :do {                                         (fetch block)
L2:   :if ($s >= 0 && $e > $s) do={               (markers check)
L3:     :while (...) do={                          (action loop)
L4:       :if ($p1 >= 0) do={                      (pipe check)
L5:         :if ($c = "configure_hotspot_profile") (handler)
L6:           :if ($p2 >= 0) do={                  (args check)
L7:             :if ([:len $hsp] > 0) do={         (profile exists)
L8:               :do { set $hsp dns-name=$dn }    <-- FAILS HERE
```

For comparison, the `create_user` handler's set command is at L7 (no `:do {} on-error={}` wrapper at that depth) and works fine.

## Fix

Remove the `:do {} on-error={}` wrappers from the four `/ip hotspot profile set` commands inside `configure_hotspot_profile`. The `:if ([:len $hsp] > 0)` guard already ensures the profile exists, so the error-catching wrappers are unnecessary. This drops the commands from L8 to L7.

**Before (fails at L8):**
```routeros
:if ([:len $hsp] > 0) do={                              # L7
    :do { /ip hotspot profile set $hsp login-by=... } on-error={}   # L8
    :do { /ip hotspot profile set $hsp http-cookie... } on-error={} # L8
    :do { /ip hotspot profile set $hsp login-url=... } on-error={}  # L8
    :do { /ip hotspot profile set $hsp dns-name=... } on-error={}   # L8
}
```

**After (works at L7):**
```routeros
:if ([:len $hsp] > 0) do={                              # L7
    /ip hotspot profile set $hsp login-by=cookie,http-pap,http-chap # L7
    /ip hotspot profile set $hsp http-cookie-lifetime=3d             # L7
    /ip hotspot profile set $hsp login-url=$lu                       # L7
    /ip hotspot profile set $hsp dns-name=$dn                        # L7
}
```

## Implementation

One SQL UPDATE to the `script_templates` table, row `id = 'sync-standalone'`:
- Replace the 4 `:do { set ... } on-error={}` lines with 4 direct `set` commands (no wrappers)
- Bump version to `7.8.8`

## Risk

Minimal. The `:if ([:len $hsp] > 0)` check already validates the profile exists before running the set commands. If any individual set fails (unlikely), the outer `:do {} on-error={}` at L1 (the main fetch block) catches it.

