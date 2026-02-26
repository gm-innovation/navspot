

# Fix: extractSourceBody must unescape source="..." escaping

## Root cause

The `sync-standalone` template stores the script body inside `source="..."` with RouterOS escaping:
- `\"` for literal `"`
- `\$` for literal `$`  
- `\\` for literal `\`

`extractSourceBody` extracts the lines but returns them **still escaped**. When the installer does `/system script set source=$srcBody`, the content has `\"` and `\$` as literal characters instead of `"` and `$`.

Evidence from logs: `source=":log info \\\"NAVSPOT-SYNC: START\\\"\;     \n` — the stored source has `\"` instead of `"`.

## Fix in gen7post/index.ts

Update `extractSourceBody` to unescape after extraction:

```typescript
function extractSourceBody(script: string): string {
  const lines = script.split("\n");
  let inSource = false;
  const body: string[] = [];
  for (const line of lines) {
    if (!inSource) {
      if (line.endsWith('source="')) { inSource = true; continue; }
      continue;
    }
    if (line === '"') { break; }
    body.push(line);
  }
  // Unescape from source="..." context to raw RouterOS script
  return body.join("\n")
    .replace(/\\\\/g, '\x00')   // 1. placeholder for literal backslash
    .replace(/\\"/g, '"')       // 2. escaped quote → real quote
    .replace(/\\\$/g, '$')      // 3. escaped dollar → real dollar
    .replace(/\x00/g, '\\');    // 4. restore literal backslashes
}
```

Ordering is critical:
- `\\\"` in template → `\"` in raw script (escaped quote inside a RouterOS string)
- `\"` in template → `"` in raw script
- `\$` in template → `$` in raw script

## Version bump

`7.9.12` → `7.9.13`

## No other changes needed

- Templates in database: unchanged
- `replaceSourceWithFetch`: unchanged (installer logic is correct)
- Only `extractSourceBody` needs the unescape step

