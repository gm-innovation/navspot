

# Fix: Add `configure_hotspot_profile` to Fallback AP

## Root Cause

The full Action Processor (5776 bytes) crashes on parse in RouterOS 7. The smoke test detects this and correctly installs the Fallback Inline (v7.2.0F). However, the Fallback AP only handles `create_profile` and `create_user` -- it has NO `configure_hotspot_profile` handler.

The Sync's inline fallback (which does handle `configure_hotspot_profile`) never triggers because:
- The Fallback AP runs successfully (`apRan = true`)
- The Fallback AP consumes the actions file (`afterSize = 0`)
- The Sync thinks everything succeeded

Result: `dns-name=""`, `login-url=""`, portal never configured.

## Solution

Add `configure_hotspot_profile` handler with hoisting to the Fallback AP source (lines 291-355 of `supabase/functions/mikrotik-scripts/index.ts`).

## Changes (1 file: `supabase/functions/mikrotik-scripts/index.ts`)

### Change 1: Add hoisting variables and `configure_hotspot_profile` handler to Fallback AP

In the fallback source (line 291), add:
- `cfgHp`, `cfgLu`, `cfgDn`, `lby` declarations at level 0
- `configure_hotspot_profile` handler inside the loop (captures to hoisted vars)
- Hoisted application block after the main `:do {} on-error={}` loop

The handler follows the same pattern already proven in the Core/Full APs:

```text
Level 0: :local cfgHp ""  (declaration)
Level 0: :do {
Level 1:   :while
Level 2:     :if ([:len $ln] > 0)
Level 3:       :if ($p1 >= 0)
Level 4:         :if ($c = "configure_hotspot_profile")
Level 5:           :do { ... capture cfgHp/cfgLu/cfgDn ... } on-error={}
Level 0: } on-error={...}
Level 0: :if ([:len $cfgHp]>0)
Level 1:   /ip hotspot profile set  <-- SAFE
```

Concrete RouterOS source to add:

Before the `:do {` loop (after `cnt` declaration):
```routeros
:local lby "cookie,http-pap,http-chap"
:local cfgHp ""
:local cfgLu ""
:local cfgDn ""
```

Inside the handler section (before `create_profile`):
```routeros
:if ($c = "configure_hotspot_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2 + 1) [:len $r]]
:if (([:len $lu] > 0) && ([:len $dn] > 0)) do={
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs] > 0) do={:do {:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]} on-error={}}
:if ([:len $hp] = 0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp] > 0) do={:set cfgHp $hp;:set cfgLu $lu;:set cfgDn $dn;:set cnt ($cnt + 1)}
}}} on-error={}}
```

After `} on-error={...}` (before `:set navspotLock "0"`):
```routeros
:if ([:len $cfgHp] > 0) do={
/ip hotspot profile set $cfgHp login-url=$cfgLu
/ip hotspot profile set $cfgHp dns-name=$cfgDn
/ip hotspot profile set $cfgHp login-by=$lby
:log info ("NAVSPOT: cfg-hp applied on " . [/ip hotspot profile get $cfgHp name])
}
```

This adds approximately 400 bytes to the fallback, keeping it well under 2KB.

## Expected Result

After re-importing the bootstrap:

1. The full AP will still fail the smoke test (known parse issue)
2. The Fallback AP (v7.2.0F) will be installed WITH `configure_hotspot_profile`
3. On next sync, log will show:
   - `NAVSPOT-ACTION v7.2.0F: Start`
   - `NAVSPOT: cfg-hp applied on hsprof-navspot`
   - `NAVSPOT-ACTION v7.2.0F: OK - X` (where X includes the profile config)
4. `/ip hotspot profile print detail` will show correct `login-url`, `dns-name`, and `login-by`
5. `tele-lu failed` will stop appearing on subsequent syncs

## Verification

```
/import navspot-bootstrap-v7.2.0.rsc
/system script run navspot-sync
/log print where message~"NAVSPOT"
/ip hotspot profile print detail where name~"navspot"
```

