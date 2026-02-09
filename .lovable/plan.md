

# Update Script Generator to v7.1.60 and Improve Re-import Workflow

## Problem

1. The `mikrotik-script-generator` edge function still has `VERSION = "7.1.59"`, so the modal and generated bootstrap show the old version even though `mikrotik-scripts` was already updated to v7.1.60.

2. When you need to re-import just the scripts (not the full bootstrap), you need a `/tool fetch` command with the `sync_token` -- but you don't have it memorized. The system should provide a ready-to-use command.

## Changes

### 1. Version bump in `mikrotik-script-generator`

**File**: `supabase/functions/mikrotik-script-generator/index.ts` (line 8)

Change `VERSION` from `"7.1.59"` to `"7.1.60"`.

This ensures the modal title, download filename, and bootstrap header all show v7.1.60.

### 2. Add "Update Scripts" command in the Script Modal

**File**: `src/components/modals/ScriptModal.tsx`

Add a new section in the modal showing a ready-to-paste RouterOS command for re-importing just the scripts (without full reinstall). This command will:
- Use the hotspot's `sync_token` (passed as a prop)
- Build the correct `/tool fetch` URL with `type=all` and `ros_version=7`
- Show the `/import` command right after

The command block will look like:
```text
Atualizar scripts (sem reinstalar):

/tool fetch url="https://.../mikrotik-scripts?type=all&token=TOKEN&ros_version=7" dst-path=navspot-scripts.rsc
/import navspot-scripts.rsc
```

With a "Copy" button next to it.

### 3. Pass `sync_token` to ScriptModal

**File**: `src/pages/Embarcacoes.tsx`

When opening the ScriptModal, also pass the hotspot's `sync_token` so the modal can build the update command. The token is already available from the hotspots query data.

**File**: `src/components/modals/ScriptModal.tsx`

Add optional `syncToken` prop to the interface.

### 4. Deploy

- `mikrotik-script-generator` (version bump)
- Frontend changes auto-deploy

## Technical Details

### ScriptModal changes

New prop: `syncToken?: string`

When `syncToken` is provided, render a new section before the footer with:
- A small info box showing the update command (pre-built with the real token and API URL)
- A copy button for quick paste into RouterOS terminal

### Embarcacoes.tsx changes

Store `syncToken` in state when generating script, sourced from the hotspot record. Pass it to `ScriptModal`.

### Files modified

| File | Change |
|------|--------|
| `supabase/functions/mikrotik-script-generator/index.ts` line 8 | VERSION "7.1.59" -> "7.1.60" |
| `src/components/modals/ScriptModal.tsx` | Add syncToken prop + update command section |
| `src/pages/Embarcacoes.tsx` | Pass syncToken from hotspot data to ScriptModal |

