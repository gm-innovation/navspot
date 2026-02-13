

# Fix: Breaking the Infinite Loop — Force Repair + Synced Profiles Cache

## Root Cause (3 interlocking problems)

### Problem 1: Force Repair resets `portal_profile_version` to null every 3 syncs
The telemetry from the router always reports `login_by=""` (empty), making it "unreliable". After 3 consecutive unreliable telemetry readings, the force repair logic at line 1232 resets `portal_profile_version` back to `null`. This triggers line 1141 to inject 8 walled garden + 1 configure_hotspot_profile actions on every sync — flooding the pipe with redundant actions and blocking real ones.

### Problem 2: `synced_profiles` cache is re-populated immediately after clearing
When we clear the cache, the SAME sync cycle that detects the missing profile immediately re-adds it to the cache (line 1564-1570). If the router fails to receive that response ("Falha no fetch"), the profile is never created but the cache says it is.

### Problem 3: Fire-and-forget marks actions as executed before delivery
Line 1722-1739 marks ALL actions as `executado` the moment they're included in the JSON response, not when the router confirms receipt.

## Fix (2 changes)

### 1. Edge Function: Stop force repair from resetting portal_profile_version

In `supabase/functions/mikrotik-sync/index.ts`, line 1232:

**Before:**
```typescript
.update({ telemetry_failures: 0, portal_profile_version: null, last_force_repair_at: new Date().toISOString() })
```

**After:**
```typescript
.update({ telemetry_failures: 0, last_force_repair_at: new Date().toISOString() })
```

This stops the infinite loop. The force repair will still inject the configure_hotspot_profile action, but won't reset the version flag, preventing the re-injection on every subsequent sync.

Also at line 1278-1282, when initial config is first sent, the code resets `portal_profile_version` to null. Change this to set it to the required version instead:

**Before:**
```typescript
.update({ portal_profile_version: null })
```

**After:**
```typescript
.update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
```

### 2. SQL: Fix hotspot state + re-insert actions

```sql
-- Fix portal loop + clear profile cache
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb,
    portal_profile_version = '7.1.50-http-pap',
    telemetry_failures = 0,
    last_force_repair_at = NOW()
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- Re-insert profile action
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'add_user_profile',
  '{"name": "tripulacao-googlemarine", "rate_limit": "3M/3M", "shared_users": 1, "limit_bytes": 0}',
  'pendente'
);

-- Re-insert user action with correct password
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'create_user',
  '{"user": "alexandre.silva", "password": "048706", "profile": "tripulacao-googlemarine"}',
  'pendente'
);
```

Setting `last_force_repair_at = NOW()` activates the 2-minute cooldown, preventing force repair from immediately resetting anything.

## Expected Result

On the next sync (~30s after deploy):
1. No walled garden flood (portal_profile_version is set + force repair cooldown active)
2. Only 2 real actions in the pipe: create_profile + create_user
3. Profile `tripulacao-googlemarine` is created on MikroTik
4. User `alexandre.silva` is linked to the profile
5. Login works

## Changes Summary

| Type | File/Location | Change |
|------|--------------|--------|
| Edge Function | mikrotik-sync line 1232 | Remove `portal_profile_version: null` from force repair update |
| Edge Function | mikrotik-sync line 1280 | Change `portal_profile_version: null` to `REQUIRED_PORTAL_VERSION` |
| SQL Migration | hotspots table | Set portal_profile_version, clear synced_profiles, activate cooldown |
| SQL Migration | acoes_pendentes | Insert 2 actions (profile + user) |

