
# Fix v7.1.62b: Fix Response File Read Failure on RouterOS 7

## Root Cause

The logs confirm:
- First sync: `resp=838b` -- worked perfectly, AP executed, actions processed
- Second+ syncs: `file read FAILED`, `resp=0b` -- file can't be read

The issue is in the sync script's response file handling (lines 817-833):

1. **Timestamped filename** (`navspot-resp-HHMMSS.txt`) creates a NEW file each sync
2. **Pre-fetch cleanup** (line 822) deletes all `navspot-resp-*` files RIGHT BEFORE `/tool fetch`
3. RouterOS 7 file deletion is **asynchronous** -- the filesystem may not have fully purged the old file when fetch writes the new one
4. **500ms post-fetch delay** is too short for the hAP ax2 flash storage to flush the write
5. Result: `/file get $respFile contents` throws an error because the file is in an inconsistent state

The first sync worked because there were no old files to delete (clean install).

## Fix

Replace the timestamped filename approach with a **fixed filename** and proper delays:

### File: `supabase/functions/mikrotik-scripts/index.ts`

**Change the response file handling in `generateSyncSource()`** (lines 817-833):

Before:
```routeros
:local ts [:tostr [/system clock get time]]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local respFile ("navspot-resp-" . $tsStr . ".txt")
# Limpar arquivos de resposta antigos
:do {:foreach oldF in=[/file find where name~"navspot-resp-"] do={/file remove $oldF}} on-error={}
:set step "5-fetch"
:log info "NAVSPOT-SYNC: step=5-fetch"
:delay 200ms
:do {
/tool fetch ... dst-path=$respFile
:set ok true
} on-error={...}
:if ($ok) do={
:delay 500ms
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={...}
:do {/file remove $respFile} on-error={}
```

After:
```routeros
:local respFile "navspot-resp.txt"
:do {/file remove $respFile} on-error={}
:delay 1s
:set step "5-fetch"
:log info "NAVSPOT-SYNC: step=5-fetch"
:do {
/tool fetch ... dst-path=$respFile
:set ok true
} on-error={...}
:if ($ok) do={
:delay 2s
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={...}
:do {/file remove $respFile} on-error={}
```

Key changes:
1. **Fixed filename** `navspot-resp.txt` -- no timestamp, no regex cleanup, `/tool fetch` overwrites naturally
2. **Single file removal** before fetch instead of regex-based foreach loop
3. **1s delay after removal** to let RouterOS flush the filesystem
4. **2s delay after fetch** (was 500ms) to ensure the flash write completes before reading
5. Remove the 200ms pre-fetch delay (replaced by the 1s post-removal delay)

### Also clean up old timestamped files (one-time)

Add a cleanup at the start of the sync script (before the lock) to remove any leftover `navspot-resp-*.txt` files from previous versions:

```routeros
:do {:foreach oldF in=[/file find where name~"^navspot-resp-"] do={/file remove $oldF}} on-error={}
```

This runs once per sync and cleans up legacy files without interfering with the current response file.

## Technical Details

### Why the fixed filename approach is better

| Aspect | Timestamped (current) | Fixed (proposed) |
|--------|----------------------|-------------------|
| File creation | New file each sync | Overwrites same file |
| Cleanup needed | Regex foreach delete | Single file remove |
| Filesystem race | Deletion + creation race | Overwrite is atomic |
| Flash wear | Creates new file every minute | Reuses same block |

### Delay rationale

- **1s post-removal**: RouterOS 7 on NAND flash (hAP ax2) needs time to fully purge a file from the filesystem journal
- **2s post-fetch**: The response write completes when `/tool fetch` returns, but the flash controller may still be flushing to NAND. 2s provides margin for the hAP ax2's flash controller

### Files modified

| File | Change |
|------|--------|
| `supabase/functions/mikrotik-scripts/index.ts` | Fix response file handling: fixed filename, proper delays |

### No version bump needed

This is a script-only fix (no backend logic change). The VERSION stays `7.1.62` -- the scripts endpoint will serve the updated sync source automatically after deploy.

### Deploy and Verification

1. Deploy `mikrotik-scripts`
2. Re-import scripts on router via "Atualizar Scripts" command
3. Run `/system script run navspot-sync`
4. Check logs -- expect `resp=XXXb` (not 0b) on every sync
5. Wait for scheduler to run a second sync -- confirm it also shows `resp=XXXb`
6. Verify AP executes: `NS-AP: data=XXXb` in logs
