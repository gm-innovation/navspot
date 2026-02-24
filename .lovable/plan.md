
# gen7post v7.9.11 — collapseSourceBlocks corrigido

Correção aplicada: `sourceLines.join("\\r\\n")` → `sourceLines.join("\\n")`.
RouterOS interpreta `\n` como newline real dentro de strings `.rsc`.

