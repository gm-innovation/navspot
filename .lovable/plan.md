
# v7.9.16 — Fix `tpl()`: strip seletivo + ordem correta

## Mudanças em `supabase/functions/gen7post/index.ts`

### 1. Version bump
`"7.9.15"` → `"7.9.16"`

### 2. `tpl()` — ordem corrigida + strip seletivo
1. CRLF normalize
2. `trimStart()` só fora de blocos `source="..."`
3. `replaceAll` variáveis por último

### 3. `replaceSourceWithImport` — remove script antes do import
Adicionado `:do { /system script remove [find name="navspot-${scriptName}"] } on-error={}` antes do `/import`.

Nenhum outro arquivo muda.
