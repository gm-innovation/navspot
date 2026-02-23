

# Split gen7 into Two Smaller Functions

## Problem

The `gen7` function combines GET (serve templates) and POST (generate + upload + sign URLs) logic in a single file. The full combined code exceeds the Deno bundler's complexity limit, causing silent deployment failures (phantom 404s).

## Solution

Split into two functions that share the same helpers but handle different HTTP methods:

| Function | Method | Purpose | Callers |
|---|---|---|---|
| `gen7` | GET only | Health check + serve templates by token | MikroTik routers via `fetch`, `useModularScripts.ts`, recovery functions |
| `gen7post` | POST only | Generate 4 scripts, upload to Storage, sign URLs, update hotspot | `useHotspots.ts`, `mikrotikService.ts` |

## Technical Details

### 1. `supabase/functions/gen7/index.ts` (Slim down -- GET only)

Keep lines 1-12 and 14-16 (health + serve + 405 fallback). Remove the entire POST block (line 13). This makes the function roughly 50% smaller.

Handles:
- `GET ?mode=health` -- returns version/status
- `GET ?mode=serve&token=X&type=Y` -- fetches hotspot by sync_token, renders template, returns plain text

### 2. `supabase/functions/gen7post/index.ts` (New -- POST only)

Contains the POST logic extracted from line 13. Includes the same `rest`, `tpl`, and `vars` helpers (duplicated, not shared -- each function must be self-contained).

Handles:
- `POST { hotspot_id }` with Authorization header
- Validates JWT via `/auth/v1/user`
- Renders 4 templates (infra, sync-standalone, guardian-standalone, bootstrap)
- Uploads to Storage bucket `hotspot-scripts`
- Signs URLs (15min expiry)
- Updates hotspot record with version info
- Returns JSON with signed URLs

### 3. `supabase/config.toml`

Add entry:
```
[functions.gen7post]
verify_jwt = false
```

### 4. Frontend updates

| File | Change |
|---|---|
| `src/services/mikrotikService.ts` line 72 | `supabase.functions.invoke('gen7')` becomes `supabase.functions.invoke('gen7post')` |
| `src/hooks/useHotspots.ts` line 179 | `supabase.functions.invoke('gen7')` becomes `supabase.functions.invoke('gen7post')` |

No changes needed for:
- `src/hooks/useModularScripts.ts` -- already uses GET via fetch URL (stays on `gen7`)
- `supabase/functions/navspot-recovery/index.ts` -- uses `gen7?mode=serve` (stays on `gen7`)
- `supabase/functions/mt-recovery/index.ts` -- uses `gen7?mode=serve` (stays on `gen7`)

### 5. Self-reference in vars

The `{{SCRIPTS_URL}}` placeholder in the `vars` helper must stay pointing to `gen7?mode=serve` (the GET function), since MikroTik routers use this URL to download scripts. Both functions will have this same value hardcoded.

## Verification

After deploy:
1. `GET /gen7?mode=health` returns `{ version, status: "ok" }`
2. `GET /gen7?mode=serve&token=X&type=bootstrap` returns RSC script text
3. `POST /gen7post` with `{ hotspot_id }` returns `{ success: true, infra_url, sync_url, ... }`
4. "Regenerar Scripts" button works end-to-end
5. "Baixar Recovery" generates script pointing to `gen7?mode=serve`

