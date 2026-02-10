

# v7.1.61: Complete Reliability Overhaul

## Overview

Three interlocking failures prevent the system from working:
1. **AP produces zero log output** -- The AP script source may be corrupted or the `:tostr` wrapper crashes the telemetry
2. **Telemetry deadlock** -- `:tostr` on unset `login-url` crashes telemetry, causing unreliable readings that block portal repair
3. **`initial_config_sent` set too early** -- Config marked as sent but never confirmed (`portal_profile_version` stays null forever)

Current DB state confirms the deadlock: `initial_config_sent=true`, `portal_profile_version=null`, `telemetry_failures=0`.

## Files Modified (3 files, 11 edits)

### File 1: `supabase/functions/mikrotik-scripts/index.ts`

#### Edit A -- VERSION bump (line 38)
```
"7.1.60" -> "7.1.61"
```

#### Edit B -- Fix telemetry crash (lines 807-808)
Remove `:tostr` wrapper that crashes when `login-url`/`login-by` properties are unset on fresh RouterOS profiles.

Before:
```routeros
:do {:set hlb [:tostr [/ip hotspot profile get $hp login-by]]} on-error={...}
:do {:set hlu [:tostr [/ip hotspot profile get $hp login-url]]} on-error={...}
```

After:
```routeros
:do {:set hlb [/ip hotspot profile get $hp login-by]} on-error={...}
:do {:set hlu [/ip hotspot profile get $hp login-url]} on-error={...}
```

#### Edit C -- AP health verification in sync script (lines 861-868)
Before running the AP, verify the script source exists and has valid size. This immediately reveals if AP source is corrupted/empty.

Before:
```routeros
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
:log error "NAVSPOT-SYNC: action-processor NAO ENCONTRADO!"
} else={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={...}
}
```

After:
```routeros
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
:log error "NAVSPOT-SYNC: AP NAO ENCONTRADO!"
} else={
:local apSrc ""
:do {:set apSrc [/system script get [find name="navspot-action-processor"] source]} on-error={}
:local apLen [:len $apSrc]
:log info ("NAVSPOT-SYNC: AP src=" . $apLen . "b")
:if ($apLen<100) do={
:log error ("NAVSPOT-SYNC: AP corrompido (" . $apLen . "b)")
} else={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={...}
}}
```

New log entries:
- `NAVSPOT-SYNC: AP src=5476b` -- confirms AP source is intact
- `NAVSPOT-SYNC: AP corrompido (0b)` -- reveals corruption

#### Edit D -- Core AP diagnostic logging (after line 914)
Add size log after reading `navspot-actions.txt`:
```routeros
:log info ("NS-AP: " . [:len $d] . "b")
```

#### Edit E -- Full AP diagnostic logging (lines 1038-1039)
Add data size + first 80 chars for debugging:
```routeros
:local dHead $d
:if ([:len $d]>80) do={:set dHead [:pick $d 0 80]}
:log info ("NS-AP: data=" . [:len $d] . "b head=" . $dHead)
```

#### Edit F -- Fallback AP diagnostic logging (lines 307-308)
Add size log:
```routeros
:log info ("NS-AP: " . [:len $raw] . "b")
```

---

### File 2: `supabase/functions/mikrotik-sync/index.ts`

#### Edit G -- VERSION bump (line 9)
```
"7.1.60d" -> "7.1.61"
```

#### Edit H -- Re-inject portal config when never confirmed (after line 1102)
This is the key fix that breaks the deadlock. When `initial_config_sent=true` but `portal_profile_version=null`, the config was sent but never applied successfully. Re-inject it on EVERY sync until confirmed, regardless of telemetry reliability.

```typescript
// v7.1.61: Re-inject portal config if never confirmed
if (hotspot.initial_config_sent && !(hotspot as any).portal_profile_version) {
  console.log(`[mikrotik-sync] v7.1.61: portal_profile_version=null, re-injecting portal config`)
  
  const hotspotSlugRetry = hotspot.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const retryLoginUrl = `https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
  const retryDnsName = `${hotspotSlugRetry}.navspot.local`
  
  const alreadyHasConfig = formattedActions.some(a => a.type === 'configure_hotspot_profile')
  if (!alreadyHasConfig) {
    formattedActions.unshift({ configure_hotspot_profile action })
    
    // Also inject essential CPD walled garden entries
    const essentialDomainsRetry = [
      'navspot.lovable.app', backendHost,
      'connectivitycheck.gstatic.com', 'clients3.google.com',
      'captive.apple.com', 'www.apple.com',
      'msftconnecttest.com', 'www.msftconnecttest.com'
    ]
    // ... push add_whitelist_domain for each
  }
  
  // Reset telemetry_failures + last_force_repair_at
  await supabase.from('hotspots')
    .update({ telemetry_failures: 0, last_force_repair_at: null })
    .eq('id', hotspot.id)
}
```

#### Edit I -- Lower force repair threshold (line 1127)
```
>= 10  ->  >= 3
```
Portal auto-repairs after 3 minutes instead of 10.

#### Edit J -- Remove obsolete warning (lines 1159-1161)
Remove the `>= 5` warning since threshold is now 3.

---

### File 3: `supabase/functions/mikrotik-script-generator/index.ts`

#### Edit K -- VERSION bump (line 8)
```
"7.1.60" -> "7.1.61"
```

---

## How the deadlock is broken

```text
Current flow (BROKEN):
  initial_config_sent=true, portal_profile_version=null
    -> telemetry reads login-url -> :tostr crashes
      -> telemetry unreliable -> portal repair skipped
        -> login-url never set -> deadlock forever

Fixed flow (v7.1.61):
  initial_config_sent=true, portal_profile_version=null
    -> v7.1.61 block ALWAYS re-injects config (bypasses telemetry)
    -> telemetry fix: no :tostr crash
    -> AP health check confirms source is intact
    -> AP processes commands -> creates profiles + users
    -> telemetry reads valid login-url -> confirms portal_profile_version
    -> system stable
```

## Deploy and Verification

1. Deploy `mikrotik-scripts`, `mikrotik-sync`, `mikrotik-script-generator`
2. On the router, use the "Atualizar Scripts" command from the modal to re-import scripts
3. Run `/system script run navspot-sync`
4. Check logs for:
   - `NAVSPOT-SYNC: AP src=XXXXb` -- reveals actual AP source size
   - `NS-AP: data=XXXb head=configure_hotspot_profile|...` -- confirms AP reads data
   - `NS-AP: cfg-hp` -- confirms AP processes hotspot config
   - `NS-AP: c-prof` / `NS-AP: c-user` -- confirms profiles and users created
5. Verify: `/ip hotspot user profile print` and `/ip hotspot user print` show created entries
6. Verify: `/ip hotspot profile print` shows correct `login-url` and `login-by=cookie,http-pap`

