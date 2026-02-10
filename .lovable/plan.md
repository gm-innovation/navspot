

# Fix v7.1.62: Add Response Diagnostics + Fix Silent Action Drop

## Problem

The backend returns 10-13 actions on every sync, but the router NEVER processes them. The logs show:

```
step=5-fetch
Download from focqrhkozhdefohroqyi.supabase.co FINISHED
NAVSPOT-SYNC v7.1.61: OK
```

There are NO logs between the download completing and the "OK" message. This means either:
1. The response file is empty when read back
2. The `[[` / `]]` markers are not found in the response
3. The extracted content is empty after trimming

The sync script has **zero diagnostic logging** in the failure paths after reading the response file (lines 832-882). When markers aren't found or content is empty, it just falls through silently to "OK".

## Answer to "Do we need telemetry?"

**No.** Telemetry is NOT needed for core sync. The backend already generates and returns all necessary actions (profiles, users, portal config) regardless of telemetry status. The v7.1.61 deadlock recovery block ensures actions are injected when `portal_profile_version` is null.

The real blocker is that the RouterOS script can't extract actions from the HTTP response. Telemetry is a secondary concern -- once actions actually get processed, the portal will be configured, telemetry will start reporting correctly, and the cycle will self-heal.

## Root Cause Theory

The `/tool fetch` saves the full JSON response to a file. The response includes BOTH `pending_actions_pipe` (the compact pipe format) AND `pending_actions` (full JSON objects array). With 10+ actions, the total response is likely 5-8KB. RouterOS `/file get contents` may truncate at ~4KB on some hardware/versions, potentially corrupting the data.

Even if markers are within the first 1KB, the response file read itself may fail or return partial content. We need diagnostics to confirm.

## Changes

### File: `supabase/functions/mikrotik-scripts/index.ts`

#### 1. VERSION bump
```
"7.1.61" -> "7.1.62"
```

#### 2. Add diagnostic logging to sync script response processing (lines 830-882)

After reading the response file, add logs for:
- Response length: `[:len $resp]`
- Whether markers were found
- Extracted content length

Current (no logging on failure):
```routeros
:if ($ok) do={
:delay 500ms
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={}
:do {/file remove $respFile} on-error={}
:local s [:find $resp "[["]
:local e [:find $resp "]]"]
:if (($s>=0)&&($e>$s)) do={
  ... process actions ...
}
}
```

New (with diagnostics):
```routeros
:if ($ok) do={
:delay 500ms
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={:log error "NAVSPOT-SYNC: file read FAILED"}
:do {/file remove $respFile} on-error={}
:local rl [:len $resp]
:log info ("NAVSPOT-SYNC: resp=" . $rl . "b")
:if ($rl=0) do={:log error "NAVSPOT-SYNC: response EMPTY"}
:local s [:find $resp "[["]
:local e [:find $resp "]]"]
:if ([:type $s]="nil") do={:log warning ("NAVSPOT-SYNC: no [[ marker in " . $rl . "b resp")}
:if (($s>=0)&&($e>$s)) do={
  ... process actions (unchanged) ...
} else={
:if ($rl>0) do={
:local rHead $resp
:if ($rl>120) do={:set rHead [:pick $resp 0 120]}
:log warning ("NAVSPOT-SYNC: no actions, head=" . $rHead)
}}
}
```

This will reveal:
- `resp=0b` + `response EMPTY` = file read failed
- `resp=5000b` + `no [[ marker` = markers not in response
- `resp=5000b` + `no actions, head=...` = markers found but extraction failed

#### 3. Reduce response size -- remove `pending_actions` JSON array from response

**File**: `supabase/functions/mikrotik-sync/index.ts`

The backend response includes BOTH:
- `pending_actions_pipe`: compact pipe format inside `[[...]]` (what the router uses)
- `pending_actions`: full JSON array with all actions (for debugging only)

The `pending_actions` array is likely 3-5KB and serves no purpose for the router. It only bloats the response and may cause truncation. Remove it from the response or replace with just the count.

Current (line 1791):
```typescript
const jsonBody = JSON.stringify({
    pending_actions_pipe: formattedPipe,
    success: true,
    server_time: new Date().toISOString(),
    pending_actions: expandedActions,        // <-- 3-5KB of data
    firewall_rules: firewallRules,           // <-- more data
    device_violations: deviceViolations,
    blocked_devices: blockedDevices
})
```

New:
```typescript
const jsonBody = JSON.stringify({
    pending_actions_pipe: formattedPipe,
    success: true,
    server_time: new Date().toISOString(),
    actions_count: expandedActions.length,
    blocked_devices: blockedDevices
})
```

This should reduce the response from ~5-8KB to ~1-2KB, well within any RouterOS buffer limit.

### File: `supabase/functions/mikrotik-script-generator/index.ts`

#### 4. VERSION bump
```
"7.1.61" -> "7.1.62"
```

## Technical Details

### Why actions are likely being dropped

RouterOS has undocumented buffer limits for `/file get contents`. The limits vary by hardware and firmware version but are typically 4-8KB. When the response exceeds this limit, the content is silently truncated. If the truncation cuts off the `]]` marker, the extraction fails. If it cuts off the entire content, `$resp` is empty.

By removing `pending_actions` (the full JSON array), we reduce the response to just the pipe string + minimal metadata, ensuring the response stays under 2KB.

### Diagnostic log reference

| Log | Meaning |
|-----|---------|
| `NAVSPOT-SYNC: resp=Xb` | Response file was read, shows size |
| `NAVSPOT-SYNC: response EMPTY` | File read returned empty string |
| `NAVSPOT-SYNC: file read FAILED` | File read threw an error |
| `NAVSPOT-SYNC: no [[ marker in Xb resp` | Markers not found in response |
| `NAVSPOT-SYNC: no actions, head=...` | Shows first 120 chars of response for debugging |

### Files modified

| File | Change |
|------|--------|
| `supabase/functions/mikrotik-scripts/index.ts` | VERSION 7.1.62, diagnostic logging in sync response path |
| `supabase/functions/mikrotik-sync/index.ts` | Remove pending_actions/firewall_rules/device_violations from response |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.62 |

## Deploy and Verification

1. Deploy `mikrotik-scripts`, `mikrotik-sync`, `mikrotik-script-generator`
2. Re-import scripts on router via modal command
3. Run `/system script run navspot-sync`
4. Check logs -- now we will see EXACTLY why actions aren't being processed
5. Expected outcome: with smaller response, markers should be found and AP should execute
6. Verify: `NS-AP: data=` log appears, profiles and users are created

