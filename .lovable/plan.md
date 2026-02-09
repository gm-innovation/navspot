

# Fix v7.1.60d: Guard portal confirmation + add force-repair cooldown

## Problem

Line 1207 has `} else {` which runs whenever `needsPortalRepair` is false -- including when `reliable` is false. This immediately overwrites `portal_profile_version` back to the required version, undoing the force-repair's reset to `null`. The router never gets a chance to apply the config before the backend "confirms" it.

## Changes

### 1. New database column: `last_force_repair_at`

Add a nullable `timestamptz` column to track when force-repair was last injected. This prevents premature confirmation even if telemetry briefly reports valid data before the router fully applies the new config.

```sql
ALTER TABLE public.hotspots ADD COLUMN last_force_repair_at timestamptz DEFAULT NULL;
```

### 2. VERSION bump (line 9)

```
const VERSION = "7.1.60d"
```

### 3. Update force-repair block (lines 1148-1157)

When injecting force-repair, also set `last_force_repair_at: new Date().toISOString()` in the update:

```typescript
const { error: resetError } = await supabase
  .from('hotspots')
  .update({
    telemetry_failures: 0,
    portal_profile_version: null,
    last_force_repair_at: new Date().toISOString()
  })
  .eq('id', hotspot.id)
```

### 4. Guard portal confirmation block (lines 1207-1217)

Replace:
```typescript
} else {
  const currentVersion = (hotspot as any).portal_profile_version
  if (currentVersion !== REQUIRED_PORTAL_VERSION) {
    await supabase
      .from('hotspots')
      .update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
      .eq('id', hotspot.id)
    console.log(`[mikrotik-sync] v7.1.46: Portal configuration confirmed...`)
  }
}
```

With:
```typescript
} else if (reliable) {
  // Only confirm when telemetry is reliable AND no recent force-repair
  const FORCE_REPAIR_COOLDOWN_MS = 120_000 // 2 minutes
  const lastForceRepair = (hotspot as any).last_force_repair_at
  const forceRecent = lastForceRepair &&
    (Date.now() - new Date(lastForceRepair).getTime()) < FORCE_REPAIR_COOLDOWN_MS

  if (forceRecent) {
    console.log(`[mikrotik-sync] v7.1.60d: Skipping portal confirmation - force-repair cooldown active (hotspot=${hotspot.nome})`)
  } else {
    const currentVersion = (hotspot as any).portal_profile_version
    if (currentVersion !== REQUIRED_PORTAL_VERSION) {
      await supabase
        .from('hotspots')
        .update({
          portal_profile_version: REQUIRED_PORTAL_VERSION,
          last_force_repair_at: null
        })
        .eq('id', hotspot.id)
      console.log(`[mikrotik-sync] v7.1.60d: Portal configuration confirmed via telemetry - marked as ${REQUIRED_PORTAL_VERSION}`)
    }
  }
} else {
  console.log(`[mikrotik-sync] v7.1.60d: Skipping portal confirmation - telemetry unreliable (hotspot=${hotspot.nome})`)
}
```

### 5. Update log prefixes

Change all remaining `v7.1.46:` and `v7.1.60c:` log references in modified blocks to `v7.1.60d:`.

## Expected behavior

```text
Cycle with failures>=10:
  FORCE REPAIR fires
  Sets telemetry_failures=0, portal_profile_version=null, last_force_repair_at=now()
  else-if(reliable) does NOT run (reliable=false)

Next cycle (router hasn't applied config yet):
  reliable=false again
  else-if(reliable) still skipped
  Counter increments from 0

Cycle after router applies config:
  reliable=true, but last_force_repair_at is < 2min ago
  "Skipping portal confirmation - force-repair cooldown active"

Cycle 2+ min after force-repair:
  reliable=true, cooldown expired
  Portal confirmed, last_force_repair_at cleared
  Normal operation resumes (create_profile, create_user flow)
```

## Files modified

| File | Change |
|------|--------|
| Migration (new) | Add `last_force_repair_at` column to `hotspots` |
| `supabase/functions/mikrotik-sync/index.ts` line 9 | VERSION -> "7.1.60d" |
| `supabase/functions/mikrotik-sync/index.ts` lines 1148-1157 | Add `last_force_repair_at` to force-repair update |
| `supabase/functions/mikrotik-sync/index.ts` lines 1207-1217 | Guard with `reliable` + cooldown check |

## Redeploy

- `mikrotik-sync` only

## Verification

1. Backend logs: no "Portal configuration confirmed" while telemetry is unreliable
2. After force-repair: "Skipping portal confirmation - force-repair cooldown active" for ~2 min
3. After cooldown + reliable telemetry: confirmation log appears
4. `create_profile` and `create_user` flow through
5. `/ip hotspot user print` shows `alexandre.silva`
6. Login works

