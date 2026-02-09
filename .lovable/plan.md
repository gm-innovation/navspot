

# Fix v7.1.58c: Corrigir deteccao de payload duplicado

## Problema

O codigo atual (linha 525) verifica `rawBody.includes('}{')`, mas o payload real usa `};{` como separador. A substring `}{` nao aparece no body `...""};{"sync_token"...` porque ha um `;` entre `}` e `{`.

## Mudanca

### mikrotik-sync/index.ts -- Abordagem parse-first + fallback

Substituir a logica das linhas 521-532 por uma abordagem mais robusta: tentar `JSON.parse` primeiro, e se falhar, usar `extractFirstJsonObject` como fallback:

```typescript
let rawBody = ''
try {
  rawBody = await req.text()
  let jsonText = rawBody
  
  // v7.1.58c: Try parse first, fallback to extraction if duplicated payload
  try {
    payload = JSON.parse(jsonText)
  } catch (parseErr) {
    // Attempt robust extraction of first JSON object
    const first = extractFirstJsonObject(rawBody)
    if (first) {
      console.warn('[mikrotik-sync] Sanitized payload, original length:', rawBody.length, 'extracted length:', first.length)
      payload = JSON.parse(first)
    } else {
      throw parseErr // re-throw original error
    }
  }
} catch (jsonError) {
  // ... keep existing diagnostic logs
}
```

Esta abordagem:
- Nao depende de heuristicas de substring (`};{` ou `}{`)
- Funciona com qualquer separador ou forma de duplicacao
- Zero impacto em payloads validos (o primeiro `JSON.parse` sucede diretamente)

### Redeploy obrigatorio

Forcar redeploy de `mikrotik-sync` para garantir que o codigo atualizado entre em producao.

## Arquivo a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Linhas 521-532: parse-first + fallback extraction |

## Resultado esperado

- Proximo sync (~1 minuto): backend aceita o payload
- `ultima_sincronizacao` atualiza
- Hotspot volta a **Online** no frontend

