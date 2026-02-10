

# Replace AP + Fallback Block with Flat, Parser-Safe Logic

## What Changes

Replace lines 865-958 in `supabase/functions/mikrotik-scripts/index.ts` (inside `generateSyncSource()`) with the user-provided flat AP execution + fallback logic.

## Current Problem

The existing code (lines 865-958) has 14+ nesting levels due to:
- AP existence check -> AP source validation -> AP lock management -> AP execution -> AP failure else -> fallback loop -> action match -> pipe check -> profile find -> profile set

This causes `expected end of command` at the `/ip hotspot profile set` lines regardless of syntax.

## Replacement Logic (User-Validated)

The new code replaces the entire block from `:if ($wok) do={` (line 865) through the matching `}}` (line 958) with:

1. **AP execution** -- flat: find script, try run, set sentinel `apRan`
2. **Post-AP check** -- verify if actions file was consumed
3. **Fallback** -- if AP failed or didn't consume, use `[:find]` to locate `configure_hotspot_profile|` in the file contents (no `:while` loop), extract `lu` and `dn`, then apply profile set at ~level 8

### Nesting depth of `/ip hotspot profile set` commands:

```text
L1: :do {                    (main error handler)
L2:   :if ($ok) do={         (fetch success)  
L3:     :if (markers) do={
L4:       :if ([:len $a]>0) do={
L5:         :while write-retry
L6:           :if ($wok) do={        <-- line 865
L7:             :if (fallback needed) do={
L8:               :if ($psep>=0) do={
L9:                 :if ([:len $hp]>0) do={
                      /ip hotspot profile set  <-- Level 9 (safe!)
```

Level 9 matches the Action Processor's proven working depth.

### Key design rules applied:
- One property per `/set` command (no multi-property)
- No quotes on `$lu` / `$dn`
- No individual `:do {}` wrappers around `/set` commands
- `[:typeof $sem]="nil"` check for safe nil handling from `[:find]`
- Flat `[:find]`-based extraction instead of `:while` loop

## Technical Details

### File: `supabase/functions/mikrotik-scripts/index.ts`

**Lines 865-958 replaced** with the following RouterOS block (inside the template literal):

```routeros
:if ($wok) do={
:local apScriptId [/system script find name="navspot-action-processor"]
:local apRan false
:if ([:len $apScriptId] > 0) do={
:do {
/system script run navspot-action-processor
:set apRan true
} on-error={
:log error "NAVSPOT-SYNC: AP threw runtime error"
:set apRan false
}
} else={
:log info "NAVSPOT-SYNC: AP script not found, will attempt fallback"
}
:delay 300ms
:local actionsId2 [/file find name="navspot-actions.txt"]
:local afterSize 0
:if ([:len $actionsId2] > 0) do={:set afterSize [/file get $actionsId2 size]}
:if ($apRan = true) do={
:if ($afterSize = 0) do={
:log info "NAVSPOT-SYNC: AP ran and consumed actions - sync complete"
} else={
:log warning ("NAVSPOT-SYNC: AP ran but did not consume actions (size=" . $afterSize . "b)")
}
}
:if (($apRan = false) || ($afterSize > 0)) do={
:local full ""
:do {:set full [/file get "navspot-actions.txt" contents]} on-error={:set full ""}
:local marker "configure_hotspot_profile|"
:local pos [:find $full $marker]
:if ($pos >= 0) do={
:local sem [:find $full ";" $pos]
:local seg ""
:if ([:typeof $sem]="nil") do={:set seg [:pick $full $pos [:len $full]]} else={:set seg [:pick $full $pos $sem]}
:local prefixLen [:len $marker]
:if ([:len $seg] > $prefixLen) do={
:local payload [:pick $seg $prefixLen [:len $seg]]
:local psep [:find $payload "|"]
:if ($psep >= 0) do={
:local lu [:pick $payload 0 $psep]
:local dn [:pick $payload ($psep + 1) [:len $payload]]
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs] > 0) do={:do {:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]} on-error={}}
:if ([:len $hp] > 0) do={
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info "NAVSPOT-SYNC: Fallback aplicado com sucesso"
:do {/file remove "navspot-actions.txt"} on-error={}
} else={
:log error "NAVSPOT-SYNC: fallback - hotspot profile not found"
}
}
}
} else={
:log info "NAVSPOT-SYNC: no configure_hotspot_profile in actions"
}
}
}
```

Closing braces remain the same from line 959 onward (the `} else={` for `$wok` failure, etc.).

## What Was Removed

- AP source size validation (`apSrc`, `apLen`, `apHead` diagnostics) -- simplifies script size
- AP lock re-acquisition inside sync (`navspotLock` management) -- sync already has `navspotSyncLock`
- Deep `:while` loop for action parsing -- replaced with flat `[:find]`
- Nested profile find + set inside loop -- hoisted to flat level

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router
3. `/system script run navspot-sync` -- no `expected end of command`
4. `/ip hotspot profile print` -- confirm `login-url`, `dns-name`, `login-by`
5. Check logs for `AP ran` or `Fallback aplicado`
