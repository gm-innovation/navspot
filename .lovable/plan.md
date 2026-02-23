

# Fix: Recovery Script 404 - Wrong Endpoint URL

## Root Cause

In `supabase/functions/mikrotik-recovery-download/index.ts`, line 167:

```text
const scriptsUrl = `${supabaseUrl}/functions/v1/mt-scripts`
```

The endpoint `mt-scripts` does not exist. The correct function name is `mt-gen`. This causes the MikroTik `fetch` to return a 404 when trying to download scripts during recovery.

## Fix

One-line change in `supabase/functions/mikrotik-recovery-download/index.ts`:

**Line 167** -- change `mt-scripts` to `mt-gen`:

```text
const scriptsUrl = `${supabaseUrl}/functions/v1/mt-gen?mode=serve`
```

Note: The `?mode=serve` base parameter is added here because the recovery script appends `?type=all&token=...` -- but since the recovery script builds the full URL with `?type=all&token=...&ros_version=7`, we need to ensure the base URL is just the path. Looking at the generated script (line 210):

```text
:local scriptsUrl "${scriptsUrl}?type=all&token=${syncToken}&ros_version=7"
```

So the fix is simply:

```text
const scriptsUrl = `${supabaseUrl}/functions/v1/mt-gen?mode=serve`
```

## Deployment

- Edit `supabase/functions/mikrotik-recovery-download/index.ts` line 167
- Re-deploy the `mikrotik-recovery-download` Edge Function
- No database migration needed
- After deploy, recovery will work immediately -- no need to update existing routers

