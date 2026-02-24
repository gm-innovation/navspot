

# Comprehensive Fix: Strip ALL Escaped Quotes from Command Properties

## Root Cause

The error keeps shifting lines (161 → 158 → new line) because there are **multiple** lines in the `sync-standalone` template that use `\"word\"` (escaped quotes around single-word values) inside deeply nested command properties. Each fix removes one occurrence, only to expose the next one.

The hAP ax2 RouterOS 7 parser fails to correctly resolve escaped quotes (`\"`) within command property values when they appear inside a `source="..."` block at nesting depth L6/L7. The parser misinterprets the closing `\"` as affecting the command boundary, causing "expected end of command" errors.

## Fix: Strip ALL Unnecessary Escaped Quotes

In RouterOS, single-word values (no spaces, no special chars) do NOT require quotes. `comment=navspot` is identical to `comment="navspot"`. By removing the escaped quotes, we eliminate the parser confusion entirely.

**Every occurrence to change:**

| Template Line | Before | After |
|---|---|---|
| 28 | `comment=\"navspot\"` | `comment=navspot` |
| 64 | `comment=\"navspot\"` | `comment=navspot` |
| 86 | `comment=\"navspot\"` | `comment=navspot` |
| 111 | `comment=\"navspot\"` | `comment=navspot` |
| 112 | `comment=\"navspot\"` | `comment=navspot` |
| 149 | `comment=\"QUOTA_EXCEDIDA\"` | `comment=QUOTA_EXCEDIDA` |
| 151 | `comment=\"BLOCK_QUOTA\"` | `comment=BLOCK_QUOTA` |
| 156 | `comment=\"QUOTA_EXCEDIDA\"` | `comment=QUOTA_EXCEDIDA` |
| 157 | `comment=\"BLOCK_QUOTA\"` | `comment=BLOCK_QUOTA` |
| 166 | `name~\"hsprof\"` | `name~hsprof` |
| 167 | `name~\"hsprof\"` | `name~hsprof` |
| 168 | `name~\"hsprof\"` | `name~hsprof` |
| 169 | `name~\"hsprof\"` | `name~hsprof` |

**NOT changed** (these require quotes):
- `:local pr \"default\"` — variable assignment, quotes needed
- `:local bu \"\"` — empty string assignment
- Log messages like `\"NAVSPOT-SYNC: ...\"` — multi-word strings need quotes
- JSON body strings — need all escaping intact

## Implementation

One SQL UPDATE to `script_templates` table, row `id = 'sync-standalone'`:
- Replace all `comment=\"navspot\"` → `comment=navspot`
- Replace all `comment=\"QUOTA_EXCEDIDA\"` → `comment=QUOTA_EXCEDIDA`
- Replace all `comment=\"BLOCK_QUOTA\"` → `comment=BLOCK_QUOTA`
- Replace all `name~\"hsprof\"` → `name~hsprof`
- Bump version to `7.8.12`

## Technical Details

The SQL will perform a targeted replacement of the entire template content, changing only the quoted single-word values in command properties while preserving all other escaped quotes (variable assignments, log messages, JSON body).

```text
Before: /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr comment=\"navspot\" disabled=no
After:  /ip hotspot user set [find name=\$un] password=\$pw profile=\$pr comment=navspot disabled=no

Before: /ip hotspot ip-binding add mac-address=\$bm type=blocked comment=\"QUOTA_EXCEDIDA\"
After:  /ip hotspot ip-binding add mac-address=\$bm type=blocked comment=QUOTA_EXCEDIDA

Before: /ip hotspot profile set [find where name~\"hsprof\"] login-by=...
After:  /ip hotspot profile set [find where name~hsprof] login-by=...
```

## Why This Works

RouterOS treats unquoted single-word values identically to quoted ones for command properties. `comment=navspot` and `comment="navspot"` produce the same result. By removing the quotes, we eliminate the nested escaping that confuses the import parser at depth L6/L7 inside `source="..."`.

## Risk

Very low. All values being unquoted are single words with no spaces or special characters (navspot, QUOTA_EXCEDIDA, BLOCK_QUOTA, hsprof). RouterOS handles these identically with or without quotes. This change affects only the import-time parsing — the runtime behavior is identical.

