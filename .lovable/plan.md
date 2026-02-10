

# v7.1.62c: Diagnose + Fix Silent Action Processor (Safe Lock Reset)

## Overview

The AP is present (5603b) and "runs" without errors, but produces zero log output. Three safe diagnostics will identify the root cause, using a **conditional lock reset** (age-based) instead of the originally proposed unconditional reset.

## Changes -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

All changes are in `generateSyncSource()`, in the AP execution block (lines 866-879).

### Change 1: Log AP source header (lines 873-875)

After `AP src=XXXXb`, log the first 80 characters to detect corruption/BOM.

```routeros
# Current (line 873):
:log info ("NAVSPOT-SYNC: AP src=" . $apLen . "b")

# New (insert after line 873):
:local apHead $apSrc
:if ($apLen>80) do={:set apHead [:pick $apSrc 0 80]}
:log info ("NAVSPOT-SYNC: AP head=" . $apHead)
```

### Change 2: Conditional lock reset before AP execution (lines 876-878)

Replace the direct `/system script run` with a safe age-based lock check. Only reset `navspotLock` if it appears stale (older than 120s or lockTime missing).

```routeros
# Current (lines 876-879):
} else={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
:if ([:len $aerr]>0) do={:log error ("NAVSPOT-SYNC: AP ERRO=".$aerr)} else={:log info "NAVSPOT-SYNC: AP OK"}

# New:
} else={
# v7.1.62c: Safe conditional lock reset
:global navspotLock
:global navspotLockTime
:local apUs 0
:do {:set apUs [/system resource get uptime-as-secs]} on-error={:set apUs 0}
:if ([:type $navspotLock]="nothing") do={:set navspotLock "0"}
:if ($navspotLock="1") do={
:local lockAge 99999
:if (($apUs>0)&&([:type $navspotLockTime]!="nothing")&&($navspotLockTime>0)) do={:set lockAge ($apUs - $navspotLockTime)}
:log info ("NAVSPOT-SYNC: AP lock=1 age=" . $lockAge . "s lockTime=" . $navspotLockTime . " uptime=" . $apUs)
:if ($lockAge>120) do={
:log warning "NAVSPOT-SYNC: AP lock stale -> resetting"
:set navspotLock "0"
} else={
:log warning "NAVSPOT-SYNC: AP lock active -> skipping AP run"
}
}
:if ($navspotLock="0") do={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
:if ([:len $aerr]>0) do={
:log error ("NAVSPOT-SYNC: AP ERRO=" . $aerr)
} else={
:log info "NAVSPOT-SYNC: AP OK"
# v7.1.62c: Check if AP consumed actions file
:delay 200ms
:local actLeft [/file find name="navspot-actions.txt"]
:if ([:len $actLeft]>0) do={
:local leftSize 0
:do {:set leftSize [:len [/file get "navspot-actions.txt" contents]]} on-error={}
:if ($leftSize>0) do={
:log warning ("NAVSPOT-SYNC: AP did NOT consume actions (" . $leftSize . "b remain)")
} else={
:log info "NAVSPOT-SYNC: AP consumed actions (file empty)"
}
} else={
:log info "NAVSPOT-SYNC: AP consumed actions (file removed)"
}
}
} else={
:log warning "NAVSPOT-SYNC: AP skipped (lock held)"
}
```

### Change 3: No version bump

VERSION stays `7.1.62` -- script-only update.

## Safety Analysis

| Original plan | This plan | Why |
|---|---|---|
| Unconditional `:set navspotLock "0"` | Age-based check (>120s) | Prevents concurrent AP execution |
| No lock state logging | Logs lock value, age, lockTime, uptime | Full visibility into lock state |
| Simple file existence check | File existence + size check | Detects partial consumption |

## Expected Log Outcomes

| Scenario | Logs you will see |
|---|---|
| Source corrupted | `AP head=` shows garbage/BOM, no `NAVSPOT-ACTION` |
| Lock was stuck | `AP lock=1 age=99999s` then `lock stale -> resetting` then normal AP logs |
| Lock legitimately held | `AP lock active -> skipping AP run` |
| AP runs but fails to parse | `AP OK` + `AP did NOT consume actions (XXXb remain)` |
| AP works correctly | `AP OK` + `AP consumed actions (file removed)` + `NS-AP:` logs |

## Deploy and Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. Run `/system script run navspot-sync`
4. Check logs for `AP head=` and `AP lock=` entries
5. If AP runs successfully, verify `/ip hotspot user profile print` and `/ip hotspot user print`

