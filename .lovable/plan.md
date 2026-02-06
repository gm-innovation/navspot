

# Plano: Sincronização de Versão v7.1.41 - mikrotik-script-generator

## Problema Confirmado

O arquivo `supabase/functions/mikrotik-script-generator/index.ts` ainda contém:

```typescript
const VERSION = "7.1.40"  // Linha 8
```

Isso causa o mismatch de versão no frontend e nos scripts gerados.

---

## Mudança Necessária

| Arquivo | Linha | De | Para |
|---------|-------|----|----|
| `supabase/functions/mikrotik-script-generator/index.ts` | 8 | `"7.1.40"` | `"7.1.41"` |

### Patch

```diff
--- a/supabase/functions/mikrotik-script-generator/index.ts
+++ b/supabase/functions/mikrotik-script-generator/index.ts
@@ -8 +8 @@
-const VERSION = "7.1.40"
+const VERSION = "7.1.41"
```

---

## Resultado Esperado

Apos aplicar e fazer deploy:

| Componente | Antes | Depois |
|------------|-------|--------|
| Titulo do modal | v7.1.40 | v7.1.41 |
| Header do script | v7.1.40 | v7.1.41 |
| Logs do RouterOS | v7.1.40 | v7.1.41 |
| Nome do arquivo | navspot-bootstrap-v7.1.40.rsc | navspot-bootstrap-v7.1.41.rsc |

---

## Verificacoes Pos-Deploy

1. Regenerar script no modal
2. Confirmar titulo mostra v7.1.41
3. Baixar arquivo e verificar header
4. Executar no MikroTik e verificar logs

---

## Rollback

Se necessario, reverter para `VERSION = "7.1.40"` e redeploy.

