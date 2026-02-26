

# Fix: sanitização agressiva no `tpl()` — remover `\;` e lixo inicial

## Diagnóstico
O `.trimStart()` adicionado na v7.9.19 remove whitespace, mas não remove combinações de `\;` (backslash + ponto-e-vírgula) que o RouterOS interpreta como comando vazio. Os logs confirmam que o script gravado ainda contém prefixo `\; \n` antes do primeiro comando real.

## Mudanças

### 1. `supabase/functions/gen7post/index.ts` — linha 10
Substituir o `.trimStart()` final por `.replace(/^[\\;\s]+/, "")` que remove qualquer combinação de `\`, `;`, espaços e newlines do início do output:

```
// Antes (atual):
return c.trimStart()

// Depois:
return c.replace(/^[\\;\s]+/, "")
```

### 2. Version bump — linha 2
`const V="7.9.19"` → `const V="7.9.20"` para que o aviso de "scripts desatualizados" funcione e hotspots detectem a mudança.

### 3. Deploy da edge function

## Arquivos
- `supabase/functions/gen7post/index.ts` — 2 alterações (sanitização + version bump)

