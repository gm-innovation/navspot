

# Add GET Serve Mode to gen7post

## Problem

The `gen7post` function currently only handles POST requests (line 5: returns 405 for non-POST). But recovery scripts and MikroTik routers need to fetch templates via GET (`gen7post?mode=serve&token=X&type=Y`). Both `mt-recovery` and `navspot-recovery` already generate scripts pointing to this URL.

Since creating new function names has repeatedly failed with phantom 404s, the safest approach is to add GET handling directly into `gen7post` -- which is already registered and working in the gateway.

## Solution

Modify `gen7post/index.ts` to handle both GET and POST:

- **GET `?mode=health`** -- returns `{ version, status: "ok" }`
- **GET `?mode=serve&token=X&type=Y`** -- fetches hotspot by sync_token, renders template from `script_templates` table, returns plain text
- **POST `{ hotspot_id }`** -- existing logic (generate 4 scripts, upload, sign URLs) -- unchanged

## Changes

### 1. `supabase/functions/gen7post/index.ts`

Replace the early `405` rejection (line 5) with GET handling:

```
GET ?mode=health -> JSON { version, status }
GET ?mode=serve  -> fetch hotspot by sync_token, render template, return text/plain
POST             -> existing logic (unchanged)
```

The GET serve handler needs:
- Parse query params: `mode`, `token`, `type`, `ros_version`
- Use the existing `rest` helper to find hotspot by `sync_token`
- Use the existing `tpl` helper to render the requested template
- If `type=all`, concatenate all 4 templates
- Return as `text/plain`

The function will grow slightly but stays well within bundler limits since:
- The GET handler is simple (query params + one DB lookup + one template render)
- No new dependencies or complex logic
- The `rest`, `tpl`, and `vars` helpers are already present and reused

### 2. No other files need changes

- `useHotspots.ts` already calls `gen7post` for POST -- correct
- `mikrotikService.ts` already calls `gen7post` -- correct
- `useModularScripts.ts` already points to `gen7post?mode=serve` -- correct
- `mt-recovery` and `navspot-recovery` already generate URLs pointing to `gen7post?mode=serve` -- correct
- `supabase/config.toml` already has `gen7post` with `verify_jwt = false` -- correct

## Verification

After deploy:
1. `GET /gen7post?mode=health` returns `{ version: "7.9.1", status: "ok" }`
2. `GET /gen7post?mode=serve&token=X&type=bootstrap` returns RSC script text
3. `POST /gen7post` with `{ hotspot_id }` continues to work (signed URLs)
4. "Regenerar Scripts" button works
5. "Baixar Recovery" generates a script that can fetch templates from `gen7post?mode=serve`

