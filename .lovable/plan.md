

# Status: Generator Edge Function - Bundler Issue

## What Works
| Function | Status |
|---|---|
| `navspot-recovery` | ✅ Working |
| `mt-recovery` | ✅ Working |
| `gen7` (one-liner) | ✅ Registers in gateway |
| `gen7` (full logic) | ❌ Silent deploy failure - 404 |

## Root Cause
The Deno bundler silently rejects the full generator code (~120 lines with `mkVars` + `render` + POST storage logic). A one-liner deploys fine, confirming it's **not** a name/gateway issue but a **bundler complexity limit**.

## Frontend refs
All frontend files point to `gen7`:
- `src/hooks/useHotspots.ts` → `gen7`
- `src/hooks/useModularScripts.ts` → `gen7`
- `src/services/mikrotikService.ts` → `gen7`
- `supabase/functions/mt-recovery/index.ts` → `gen7?mode=serve`
- `supabase/functions/navspot-recovery/index.ts` → `gen7?mode=serve`

## Next Steps
Split `gen7` into two functions:
1. **`gen7`** — GET serve only (health + template rendering via token)
2. **`gen7post`** — POST only (generate + upload + sign URLs)

This keeps each function small enough for the bundler.
