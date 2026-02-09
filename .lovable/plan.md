

# Fix v7.1.58b: Corrigir JSON duplicado no sync

## Problema confirmado

O RouterOS envia o JSON duplicado com `;` separador: `{...};{...}` (465 bytes = 2x 232 + 1). O `JSON.parse()` falha na posicao 231.

## Mudancas

### 1. mikrotik-sync/index.ts: Extracao robusta do primeiro JSON

Adicionar funcao `extractFirstJsonObject()` com brace-counting que respeita strings e escapes. Aplicar antes do `JSON.parse()`:

```typescript
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let inString = false;
  let escape = false;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
  }
  return null;
}
```

No bloco de parsing (linhas 500-521), inserir sanitizacao entre `req.text()` e `JSON.parse()`:

```typescript
let rawBody = ''
try {
  rawBody = await req.text()
  let jsonText = rawBody
  if (rawBody.length > 0 && rawBody.includes('}{')) {
    const first = extractFirstJsonObject(rawBody)
    if (first) {
      jsonText = first
      console.warn('[mikrotik-sync] Sanitized duplicated payload, original length:', rawBody.length, 'extracted length:', first.length)
    }
  }
  payload = JSON.parse(jsonText)
} catch (jsonError) {
  // ... keep existing diagnostic logs + add masked preview
}
```

Manter os logs diagnosticos existentes no catch, mas mascarar o token no preview (substituir valor do sync_token por `***`).

### 2. mikrotik-scripts/index.ts: `http-data=($b)` (linha 808)

Alterar:
```text
ANTES:  http-data=$b
DEPOIS: http-data=($b)
```

Os parenteses forcam o RouterOS a avaliar `$b` como expressao unica, evitando duplicacao na origem.

### 3. VERSION permanece 7.1.58

Nenhum bump adicional necessario -- a versao ja foi incrementada.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Funcao `extractFirstJsonObject()` + sanitizacao antes do parse |
| `supabase/functions/mikrotik-scripts/index.ts` | Linha 808: `http-data=($b)` |

## Resultado esperado

Apos deploy do backend (sem reimportar bootstrap):
- O proximo sync sera aceito (backend extrai primeiro JSON valido)
- `ultima_sincronizacao` volta a atualizar
- Hotspot aparece como **Online** no frontend

Apos reimportar bootstrap (opcional, corrige na origem):
- Body reduz de 465 para ~232 bytes
- Sanitizacao no backend deixa de ser acionada

