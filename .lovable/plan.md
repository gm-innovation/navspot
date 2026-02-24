

# Fix: Eliminate ALL Nested `[:len]` Inside `[:pick]` (v7.8.19 / v7.9.9)

## Problem

The error moved from line 167 to line 173, column 121 unchanged — proving there are **multiple** instances of the same problematic pattern `[:pick $x ($y + 1) [:len $x]]` across all handlers. Fixing one just moves the parser crash to the next occurrence.

## All 10 Instances Found in Database

| Line | Handler | Pattern |
|------|---------|---------|
| 51 | main extractor | `[:pick \$ln (\$p1 + 1) [:len \$ln]]` |
| 56 | create_user | `[:pick \$r (\$p2 + 1) [:len \$r]]` |
| 62 | create_user (inner) | `[:pick \$rest (\$p3 + 1) [:len \$rest]]` |
| 74 | create_profile | `[:pick \$r (\$p2 + 1) [:len \$r]]` |
| 78 | create_profile (inner) | `[:pick \$rt (\$p3 + 1) [:len \$rt]]` |
| 104 | update_user | `[:pick \$r (\$p2 + 1) [:len \$r]]` |
| 110 | update_user (inner) | `[:pick \$rest (\$p3 + 1) [:len \$rest]]` |
| 123 | update_password | `[:pick \$r (\$p2 + 1) [:len \$r]]` |
| 134 | kick_session | `[:pick \$r (\$p2 + 1) [:len \$r]]` |
| 149 | block_quota | `[:pick \$r (\$p2 + 1) [:len \$r]]` |

## Fix Pattern (Applied to Every Instance)

```routeros
# BEFORE (fails):
:local r [:pick $ln ($p1 + 1) [:len $ln]]

# AFTER (safe):
:local lnLen [:len $ln]
:local r [:pick $ln ($p1 + 1) $lnLen]
```

## Changes Required

### 1. SQL UPDATE to `sync-standalone` template

Replace the entire `content` column with the fixed version where all 10 instances have pre-computed `[:len]` into local variables. The user provided the complete corrected template — I will use it as the basis, verified against the current database content.

### 2. Version bumps
- Template version: `7.8.19` (in `{{VERSION}}` placeholder — no template change needed, the version comes from gen7post)
- `gen7post/index.ts` line 2: `V = "7.9.9"`

## Technical Details

Each fix follows the same mechanical pattern:
1. Add `:local xLen [:len \$x]` on the line before the `[:pick]`
2. Replace `[:len \$x]` inside `[:pick]` with `\$xLen`

Variable naming convention:
- `lnLen` for `[:len \$ln]` (line 51)
- `rLen` for `[:len \$r]` (lines 56, 74, 104, 123, 134, 149)
- `restLen` for `[:len \$rest]` (lines 62, 110)
- `rtLen` for `[:len \$rt]` (line 78)

The `cfgLu` block (lines 174-185) was already fixed in v7.8.18 and remains correct.

