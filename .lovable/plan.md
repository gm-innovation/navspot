

# Fix: collapseSourceBlocks — `\\r\\n` para `\\n`

## Problema

Na linha 3 do `gen7post/index.ts`, o `collapseSourceBlocks` junta as linhas com `"\\r\\n"` (4 caracteres: `\`, `r`, `\`, `n`). Quando o RouterOS processa o `.rsc` via `/import`, ele interpreta esses 4 caracteres literalmente em vez de como newline — o script fica inválido.

## Correção

Trocar `"\\r\\n"` por `"\\n"` (2 caracteres: `\`, `n`). O RouterOS interpreta `\n` dentro de strings como newline real.

Bump de versão: `7.9.10` para `7.9.11`.

## Alteração (linha 2-3 do `gen7post/index.ts`)

**Antes:**
```
const V="7.9.10";
...sourceLines.join("\\r\\n")...
```

**Depois:**
```
const V="7.9.11";
...sourceLines.join("\\n")...
```

## Após deploy

Regenerar scripts pelo painel e reimportar no router.

