
# Fix v7.1.58: Diagnosticar JSON invalido no sync (deploy imediato, sem reimportar bootstrap)

## Problema

O sync v7.1.57 executa todos os steps sem crash, mas o backend rejeita o JSON com erro **"Unexpected non-whitespace character after JSON at position 231"** em TODAS as chamadas. Isso impede a atualizacao de `ultima_sincronizacao`, fazendo o hotspot aparecer como **Offline** no frontend.

A posicao 231 e consistente, indicando um caractere fixo nos dados coletados que corrompe o JSON.

## Estrategia: Diagnostico primeiro (sem tocar no roteador)

A mudanca e 100% no backend (`mikrotik-sync`). Nao requer reimportar bootstrap. O proximo sync (1 minuto) ja mostrara o body raw nos logs.

## Mudancas

### 1. mikrotik-sync/index.ts: Log do body raw no catch de JSON

Trocar `req.json()` por `req.text()` + `JSON.parse()` manual para capturar o body bruto quando o parse falhar.

**ANTES (linhas 500-512):**
```typescript
let payload: SyncPayload
try {
  payload = await req.json()
} catch (jsonError) {
  console.error('[mikrotik-sync] Invalid JSON body:', jsonError)
  return new Response(...)
}
```

**DEPOIS:**
```typescript
let payload: SyncPayload
let rawBody = ''
try {
  rawBody = await req.text()
  payload = JSON.parse(rawBody)
} catch (jsonError) {
  console.error('[mikrotik-sync] Invalid JSON body:', jsonError)
  console.error('[mikrotik-sync] Raw body (300 chars):', rawBody.substring(0, 300))
  console.error('[mikrotik-sync] Raw body length:', rawBody.length)
  if (rawBody.length > 225) {
    const around = rawBody.substring(220, 250)
    const codes = Array.from(around).map((c: string) => c.charCodeAt(0))
    console.error('[mikrotik-sync] Chars 220-250:', JSON.stringify(around), 'codes:', codes)
  }
  return new Response(...)
}
```

### 2. VERSION bump para 7.1.58

Em ambos:
- `supabase/functions/mikrotik-scripts/index.ts` (linha 38)
- `supabase/functions/mikrotik-script-generator/index.ts` (linha 8)

### 3. Nenhuma mudanca no script RouterOS

O bootstrap v7.1.57 continua rodando no roteador. Nao e necessario reimportar nada.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | `req.text()` + log raw body no catch |
| `supabase/functions/mikrotik-scripts/index.ts` | VERSION 7.1.58 |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.58 |

## Fluxo apos deploy

1. Deploy das 3 Edge Functions
2. Aguardar 1 minuto (proximo sync do roteador)
3. Verificar logs do `mikrotik-sync` para ver o body raw
4. Com base no diagnostico, aplicar fix cirurgico no script RouterOS

## Por que diagnostico primeiro?

Sem ver o body raw, qualquer fix no script seria "as cegas". A posicao 231 pode ser causada por:
- Token do arquivo com headers RouterOS (newlines)
- Valor de `login-by` com caracteres especiais (ex: `http-pap,http-chap` contendo virgula nao-escapada)
- Nome de profile com aspas ou caracteres especiais
- Carriage return (`\r`) no final de valores

Somente vendo os bytes exatos podemos aplicar o fix correto.
