

# Fix Recovery Script: Wrong Template Type + Bootstrap Self-Destruct

## Problem Analysis

There are **two critical issues** causing recovery to fail:

### Issue 1: Bootstrap deletes scripts that were just installed

The recovery downloads `type=all` from gen7post, which concatenates **4 templates** in order:

```text
1. INFRA         --> creates network infrastructure
2. SYNC-STANDALONE   --> creates navspot-sync script + scheduler
3. GUARDIAN-STANDALONE --> creates navspot-guardian script + scheduler
4. BOOTSTRAP     --> DELETES navspot-sync + navspot-guardian, then tries to re-download
```

The bootstrap template starts with a full cleanup (line 366-370 of the output) that **removes the sync and guardian scripts** that were just created by steps 2 and 3. Then bootstrap tries to re-download and import scripts again, but hits a syntax error.

### Issue 2: Bootstrap postData syntax error (line 529 column 27)

The bootstrap template has this line:
```
:local postData ("{\"mode\":\"serve\",\"type\":\"all\",\"token\":\"" . $tk . "\",\"ros_version\":\"" . $rosV . "\"}")
```

The `\"` escaping inside a standalone `.rsc` context causes a RouterOS syntax error. This prevents bootstrap from completing, leaving the router without the scripts it just deleted.

### Net result
Recovery downloads `type=all` -> sync/guardian scripts are created -> bootstrap deletes them -> bootstrap tries to re-download but crashes on syntax error -> `navspot-sync` doesn't exist.

## Solution

**Change the recovery script to fetch only `sync-standalone` and `guardian-standalone`** instead of `type=all`. Recovery already handles its own cleanup and token management -- it does NOT need infra or bootstrap.

### Step 1: Add a new `type=recovery` to gen7post

**File:** `supabase/functions/gen7post/index.ts`

Add a handler for `type=recovery` that returns only sync-standalone + guardian-standalone:

```javascript
if(type==="recovery"){
  const s1=await tpl("sync-standalone",v),s2=await tpl("guardian-standalone",v);
  return new Response(s1+"\n"+s2,{headers:{...H,"Content-Type":"text/plain; charset=utf-8"}});
}
```

### Step 2: Update recovery script to use `type=recovery`

**File:** `supabase/functions/navspot-recovery/index.ts`

Change the fetch line in `generateRecoveryScript` from `type=all` to `type=recovery`:

```
Before: "type":"all"
After:  "type":"recovery"
```

This way the downloaded `ns-install.rsc` will contain ONLY the sync and guardian script installers, without the infra or bootstrap sections that conflict with recovery's own logic.

### Why this is the correct fix

- Recovery already handles: token persistence, script cleanup, login-by fix, and initial_config_sent reset
- Recovery does NOT need infra (network is already configured) or bootstrap (which does a destructive full reinstall)
- The sync-standalone and guardian-standalone templates use `source=""` blocks where `\"` and `\$` escaping is correct
- No changes needed to any database templates

### Files changed
1. `supabase/functions/gen7post/index.ts` -- add `type=recovery` handler
2. `supabase/functions/navspot-recovery/index.ts` -- change type from "all" to "recovery"
3. Deploy both edge functions

