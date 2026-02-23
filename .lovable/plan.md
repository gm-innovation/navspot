

# Fix: Consolidate Script Generator into Working Recovery Function Pattern

## Diagnosis

| Function | Status | Gateway |
|---|---|---|
| `navspot-recovery` | Working (400) | Registered |
| `mt-recovery` | Working (400) | Registered |
| `navspot-gen` | **404** | NOT registered |
| `mt-gen` | **404** | NOT registered |

The script generator logic (`navspot-gen`) has been renamed multiple times (`mikrotik-script-generator` -> `mt-gen` -> `navspot-gen`) but continues to fail with phantom 404s. Meanwhile, `navspot-recovery` and `mt-recovery` (similar complexity, same zero-SDK pattern) work perfectly.

**Best alternative**: Stop fighting the gateway. Move the generator logic into a fresh function with a completely new name that has never been used before.

## Strategy

Use a fresh, never-corrupted function name: **`script-gen`**. This avoids all prior gateway registration corruption from `mt-gen`, `navspot-gen`, `mikrotik-script-generator`, etc.

Additionally, fix the recovery functions to point to the new working endpoint.

## Changes

### 1. Create `supabase/functions/script-gen/index.ts`
- Copy the exact logic from current `navspot-gen/index.ts` (already working code, just gateway-blocked)
- Update self-references: `{{SCRIPTS_URL}}` points to `script-gen?mode=serve`
- Update `{{RECOVERY_URL}}` to point to `navspot-recovery`

### 2. Update `supabase/config.toml`
- Add `[functions.script-gen]` with `verify_jwt = false`

### 3. Update frontend references
- `src/hooks/useHotspots.ts` line 179: `navspot-gen` -> `script-gen`
- `src/hooks/useModularScripts.ts` line 17: `navspot-gen` -> `script-gen`
- `src/services/mikrotikService.ts` line 72: `navspot-gen` -> `script-gen`

### 4. Fix recovery endpoints
- `supabase/functions/mt-recovery/index.ts` line 138: change `mt-gen?mode=serve` to `script-gen?mode=serve`
- `supabase/functions/navspot-recovery/index.ts` line 136: change `navspot-gen?mode=serve` to `script-gen?mode=serve`

### 5. Cleanup
- Delete `supabase/functions/navspot-gen/` (gateway-corrupted)
- Delete `supabase/functions/mt-gen/` (gateway-corrupted)
- Remove their entries from `config.toml`

## Verification

After deploy:
1. `GET /script-gen?mode=health` should return `{ version: "7.9.1", status: "ok" }`
2. "Regenerar Scripts" button on the embarcacoes page should work (calls `script-gen` POST)
3. "Baixar Recovery" should generate a script pointing to `script-gen?mode=serve`

