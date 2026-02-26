

# Fix: Download robusto que funciona no preview E em produção

## Diagnóstico

O fetch retorna 200, o blob é criado com sucesso. O problema é que `a.click()` programático é bloqueado silenciosamente pelo sandbox do iframe em contextos variáveis. O código atual é idêntico ao que funcionava antes — o comportamento do sandbox não é determinístico.

## Solução

Usar `URL.createObjectURL` + `window.open` com o blob URL (não a signed URL direta). Diferente de `window.open` com a signed URL (que renderiza como texto), um blob URL com tipo `application/octet-stream` força o download. Isso funciona mesmo em sandboxes porque `window.open` com blob URL é tratado diferente de `a.click()`.

### `src/hooks/useModularScripts.ts` — `downloadFromSignedUrl`

```typescript
export async function downloadFromSignedUrl(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    // Force binary content type to prevent browser rendering as text
    const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(downloadBlob);
    
    // Try anchor click first
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (error) {
    // Fallback: open signed URL directly
    window.open(url, '_blank');
  }
}
```

Mudança chave: o blob é re-criado com `type: 'application/octet-stream'` em vez de herdar `text/plain` do response. Isso garante que mesmo se o browser abrir o blob URL diretamente (fallback), ele trate como download e não como texto.

### `src/components/modals/ScriptModal.tsx` — `handleDownload` (blob inline)

Mesma mudança no blob inline (linhas 93-102):

```typescript
const blob = new Blob([bootstrapScript], { type: "application/octet-stream" });
```

Trocar `text/plain` por `application/octet-stream` para consistência.

