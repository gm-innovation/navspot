

# Fix: Edge Functions Not Working (Recovery 404 + mt-gen 404)

Two separate issues were identified:

## Issue 1: Recovery Button Calls Wrong Function Name

The frontend (`src/hooks/useHotspots.ts` line 236) still calls `mikrotik-recovery-download`, but this function was renamed to `mt-recovery` in the last change. The function directory no longer exists at the old name.

**Fix**: Update `useDownloadRecoveryScript` in `src/hooks/useHotspots.ts` to call `mt-recovery` instead of `mikrotik-recovery-download`.

## Issue 2: mt-gen Returns 404 (Gateway Registration Issue)

The `mt-gen` function code exists and is correct, but the Supabase gateway returns 404. This is the known "phantom 404" issue where the gateway loses the function registration.

**Fix**: Delete and redeploy `mt-gen` to force a clean gateway registration (the known "Function Name Reset" strategy).

## Changes

| File / Action | Change |
|---|---|
| `src/hooks/useHotspots.ts` | Line 236: change `mikrotik-recovery-download` to `mt-recovery` |
| Edge Function deploy | Delete + redeploy `mt-gen` to fix gateway 404 |

## Verification

After changes:
- "Baixar Recovery" button should work (calls `mt-recovery`)
- "Regenerar Scripts" should work (calls `mt-gen`)
- Modular downloads should work (calls `mt-gen?mode=serve`)
