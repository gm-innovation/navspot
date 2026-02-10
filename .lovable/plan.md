

# Fix: Hoist Profile Set Commands Out of Deep Nesting (Nesting Depth Reduction)

## Why Previous Fixes Failed

Every iteration changed the SYNTAX at line 198 but the error persisted because the RouterOS 7 parser fails at that nesting depth (~14-15 levels), not because of any specific syntax issue. The Action Processor uses the same command successfully because it runs at ~9 levels of nesting.

## Root Cause: Nesting Depth

The `/ip hotspot profile set` command sits inside 14+ nested blocks:

```text
Level 1:  :do {                    (main error handler)
Level 2:  :if ($ok) do={           (fetch success)
Level 3:  :if (markers found)
Level 4:  :if (has actions)
Level 5:  :if ($wok)
Level 6:  else {                   (AP section)
Level 7:  :if (lock free)
Level 8:  else {                   (AP failed)
Level 9:  :if (has data)
Level 10: :do {                    (fallback error handler)
Level 11: :while ... do={          (action loop)
Level 12: :if (configure_hp match)
Level 13: :if (has pipe)
Level 14: :if (profile found)
          --> /ip hotspot profile set  <-- FAILS HERE
```

## Solution: Extract-then-Apply Pattern

Instead of finding the hotspot profile AND setting its properties deep inside the loop, we:

1. Inside the deep loop: ONLY extract `login-url` and `dns-name` values into variables declared at a higher scope
2. Outside the loop (at ~level 8-9): Apply the profile set commands

This moves `/ip hotspot profile set` from level 14 to level ~10, well within the parser's capability.

## Change -- Single file: `supabase/functions/mikrotik-scripts/index.ts`

### Lines 915-950: Restructure fallback to hoist profile commands

**Before (lines 915-950):**
The loop finds the hotspot profile AND sets properties all at nesting level 14+.

**After:**
```routeros
} else={
:log error "NAVSPOT-SYNC: AP FAILED (did not complete)"
:delay 200ms
:local fallD ""
:do {:set fallD [/file get "navspot-actions.txt" contents]} on-error={}
:local fallLu ""
:local fallDn ""
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
:set fallLu [:pick $rest 0 $pp2]
:set fallDn [:pick $rest ($pp2+1) [:len $rest]]
}
}
}} on-error={:log error "NAVSPOT-SYNC: fallback parse error"}
}
:if ([:len $fallLu]>0) do={
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:do {:local pN [/ip hotspot get $hs profile];:set hp [/ip hotspot profile find name=$pN]} on-error={}}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$fallLu
/ip hotspot profile set $hp dns-name=$fallDn
/ip hotspot profile set $hp login-by=cookie,http-pap
:log info ("NAVSPOT-SYNC: FALLBACK applied login-url + login-by on " . [/ip hotspot profile get $hp name])
}
}
}
```

### Key Changes

1. Declare `:local fallLu ""` and `:local fallDn ""` at level 8 (the `else` block for AP-failed)
2. Inside the deep loop (level 12-13): ONLY extract values with `:set fallLu` and `:set fallDn` -- no hotspot find, no profile set
3. After the `:do { :while ... } on-error={}` block ends (back at level 8-9): find the hotspot profile and apply the `/set` commands

### Nesting Comparison

| Command | Before | After |
|---------|--------|-------|
| `:set fallLu [:pick ...]` | -- | Level 13 (just variable assignment, always works) |
| `/ip hotspot profile set` | Level 14-15 | Level 10 |
| Hotspot find + profile find | Level 14-15 | Level 9-10 |

Level 10 is well within RouterOS parser limits (AP works at ~9).

## Why This Will Work

- Variable assignment (`:set`) works at ANY nesting depth -- it's a simple parser operation
- `/ip hotspot profile set` with key=value parameters is the command that fails at deep nesting
- Moving it from level 14 to level 10 puts it within proven working range
- The AP proves that level ~9 works for this exact command

## Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router ("Atualizar Scripts")
3. `/system script run navspot-sync` -- no more `expected end of command`
4. `/ip hotspot profile print` -- confirm `login-url`, `dns-name`, and `login-by` are set
5. Check logs for `FALLBACK applied` or `AP ran`
