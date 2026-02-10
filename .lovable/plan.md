
# v7.1.62c fix: Broken Error Capture Masking AP Parse Failure

## Diagnosis

All three screenshots show the EXACT same pattern on every sync cycle:

```
AP src=5603b
AP head=:log info "NAVSPOT-ACTION v7.1.62"
:global navspotLock          <-- sync script's own globals
:global navspotLockTime      <-- sync script's own globals
:                            <-- empty echo
NAVSPOT-SYNC: AP OK          <-- FALSE positive
AP did NOT consume actions (711-1030b remain)
```

The AP's very first line (`:log info "NAVSPOT-ACTION v7.1.62"`) NEVER appears in the logs, yet the sync reports "AP OK" (no error caught). This is impossible unless:

1. The AP is throwing a parse/runtime error
2. The `on-error` handler is ALSO crashing, leaving `aerr` empty

**Root cause**: The sync error handler uses `[:tostr $error]`:
```routeros
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
```

On this RouterOS 7 version, `$error` is either unavailable or returns a type that `[:tostr]` cannot handle. This causes a SECONDARY crash inside the error handler. Since `aerr` was initialized to `""`, it stays empty, and the sync falsely reports "AP OK".

**Why the smoke test passed during bootstrap**: The bootstrap's smoke test ran with a trivial 1-action file (`create_profile|navspot-smoke|1M|1;`). The real sync sends 10-13 actions including `configure_hotspot_profile` with a long URL containing special characters (`?`, `&`, `=`, `$`). The AP likely crashes parsing the `configure_hotspot_profile` action payload, not at the script level.

Actually -- re-reading more carefully, the first `:log info` at line 1 never fires, which means the SCRIPT itself fails to parse/compile (not a runtime data issue). But the smoke test passed with the same script... The most likely explanation is that `/system script run` on RouterOS 7 can silently fail when called from within a large parent script context (stack/memory limit), and `$error` compounds the problem.

## Solution: Two changes

### Change 1: Fix error capture with sentinel pattern

Replace the broken `[:tostr $error]` approach with a sentinel variable that definitively proves whether the AP executed:

```routeros
# Before (broken):
:local aerr ""
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
:if ([:len $aerr]>0) do={:log error ("NAVSPOT-SYNC: AP ERRO=" . $aerr)} else={:log info "NAVSPOT-SYNC: AP OK"}

# After (safe):
:local apRan false
:do {/system script run navspot-action-processor;:set apRan true} on-error={:log error "NAVSPOT-SYNC: AP THREW error"}
:if ($apRan) do={
  :log info "NAVSPOT-SYNC: AP ran"
} else={
  :log error "NAVSPOT-SYNC: AP FAILED (did not complete)"
}
```

Key: `:set apRan true` is AFTER the script run, on the same line. If the script throws, execution jumps to `on-error` and `apRan` stays `false`. No dependency on `$error`.

### Change 2: Inline fallback for configure_hotspot_profile

If the AP fails (apRan=false) AND the actions file still has content, parse it inline looking ONLY for `configure_hotspot_profile`. This is the critical action that sets `login-url` and `login-by`, breaking the deadlock. ~20 lines of RouterOS code.

```routeros
:if (!$apRan) do={
  :delay 200ms
  :local fallD ""
  :do {:set fallD [/file get "navspot-actions.txt" contents]} on-error={}
  :if ([:len $fallD]>0) do={
    :log info ("NAVSPOT-SYNC: inline fallback, data=" . [:len $fallD] . "b")
    :do {/file remove "navspot-actions.txt"} on-error={}
    :local fp 0
    :do {
    :while ([:find $fallD ";" $fp]>=0) do={
      :local fe [:find $fallD ";" $fp]
      :local fl [:pick $fallD $fp $fe]
      :set fp ($fe+1)
      :if ([:find $fl "configure_hotspot_profile|"]>=0) do={
        :local pp ([:find $fl "|"]+1)
        :local rest [:pick $fl $pp [:len $fl]]
        :local pp2 [:find $rest "|"]
        :if ($pp2>=0) do={
          :local lu [:pick $rest 0 $pp2]
          :local dn [:pick $rest ($pp2+1) [:len $rest]]
          :local hp ""
          :local hs [/ip hotspot find name="hs-navspot"]
          :if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={}}
          :if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
          :if ([:len $hp]>0) do={
            /ip hotspot profile set $hp login-url=$lu dns-name=$dn login-by=cookie,http-pap
            :log info ("NAVSPOT-SYNC: FALLBACK applied login-url + login-by on " . [/ip hotspot profile get $hp name])
          }
        }
      }
    }} on-error={:log error "NAVSPOT-SYNC: fallback parse error"}
  }
}
```

This ensures `configure_hotspot_profile` is always applied even when the full AP fails, breaking the chicken-and-egg deadlock.

## Technical Details

### Why this fixes the problem

| Current behavior | After fix |
|---|---|
| AP throws error | Same |
| `[:tostr $error]` crashes in handler | No `$error` used -- safe `on-error` |
| `aerr` stays empty, reports "AP OK" | `apRan=false`, reports "AP FAILED" |
| `configure_hotspot_profile` never applied | Inline fallback applies it immediately |
| `tele-lu failed` persists forever | `login-url` gets set, telemetry works next cycle |

### Size impact on sync script

The inline fallback adds approximately 20 lines (~600 bytes). Current sync is approximately 2.8KB. Adding 600 bytes puts it at ~3.4KB, which exceeds the 3.2KB limit for RouterOS 6.x. However, this router is ROS 7.x (confirmed by `ros_version=7`), and the sync script is generated dynamically per-request with the correct `rosVersion` parameter. ROS 7 has no practical buffer limit for script sources.

### Files modified

| File | Change |
|------|--------|
| `supabase/functions/mikrotik-scripts/index.ts` | Fix error capture + add inline fallback in `generateSyncSource()` |

### Expected log outcomes after fix

| Scenario | Logs |
|---|---|
| AP works | `AP ran` + `AP consumed actions` |
| AP throws (confirmed) | `AP THREW error` + `AP FAILED` + `inline fallback, data=XXXb` + `FALLBACK applied login-url` |
| AP works but doesn't consume | `AP ran` + `AP did NOT consume actions` (different issue) |

### Deploy and Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. Run `/system script run navspot-sync`
4. Check logs:
   - If `AP THREW error` appears: confirms the error was masked. Fallback should apply `login-url`
   - If `AP ran` appears: AP actually works now (unlikely without other changes)
5. Verify: `/ip hotspot profile print` should show `login-url` set
6. Next sync cycle: `tele-lu` should succeed, confirming portal is configured
