

# gen7post v7.9.12 — Fetch-based script creation

## Problema resolvido

RouterOS 7 `/import` NAO interpreta escape sequences (`\n`, `\r\n`) dentro de `source="..."`. Qualquer tentativa de embutir scripts multi-linha no source resulta em caracteres literais, quebrando o script.

## Solucao implementada

### 1. `extractSourceBody(script)` — nova funcao
Extrai o conteudo entre `source="` e `"` de um template standalone. Retorna apenas o body do script sem wrappers.

### 2. `replaceSourceWithFetch(script, ...)` — nova funcao
Transforma o output do template: substitui o bloco `source="...body..."` por `source=""` + logica de fetch via `/tool fetch` + `/file get` + `/system script set`.

### 3. Novos serve types: `sync-source`, `guardian-source`
Retornam APENAS o body do script (text/plain) para o router baixar via fetch.

### 4. Templates no banco — inalterados
Os templates continuam com o `source="...body..."` original. O gen7post faz a transformacao em runtime:
- Para `.rsc` files: `replaceSourceWithFetch` troca o source inline pelo fetch-based approach
- Para `*-source` API: `extractSourceBody` extrai o body puro

### 5. `collapseSourceBlocks` — removida
Nao e mais necessaria.

## Fluxo de instalacao

```text
1. /import infra.rsc       → Configura rede (sem source= blocks)
2. /import sync.rsc         → Cria script vazio, faz fetch do body via API, seta source
3. /import guardian.rsc      → Idem
4. /import bootstrap.rsc    → Configura schedulers
```

## Versao: 7.9.12
