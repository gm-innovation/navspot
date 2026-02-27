

# Fix: Sync handler corrompe `login-by` — captive portal bypass (v7.9.27)

## Correções aplicadas

### 1. Template `sync-standalone` — handler `configure_hotspot_profile`
- **Antes**: `login-by=$loginBy` → escrevia a URL no campo `login-by`, corrompendo a autenticação
- **Depois**: `login-url=$loginUrl login-by=http-pap` → seta corretamente `login-url` e reforça `login-by`

### 2. Template `infra` — hotspot profile add
- **Antes**: sem `login-url` → captive portal só funcionava após primeiro sync
- **Depois**: `login-url` com `{{HOTSPOT_ID}}` hardcoded → portal funciona imediatamente após import

### 3. `gen7post/index.ts` — variável `{{HOTSPOT_ID}}`
- Adicionado `"{{HOTSPOT_ID}}": h.id` ao mapa de variáveis

## Fix anterior: "can not remove dynamic" (v7.9.27)
- FastTrack disable: wrapped em `:do {} on-error={}`
- Bridge host remove: adicionado `dynamic=no` + error handler
