

# Fix: Restore blob-based download for signed URLs

## Problem

`window.open(url, '_blank')` opens the .rsc file as plain text in the browser instead of triggering a download. The Storage signed URL serves the content with `Content-Type: text/plain` and no `Content-Disposition: attachment` header, so the browser just renders it.

The previous blob-based approach (fetch → blob → anchor click with `download` attribute) was working correctly in production (not in the Lovable preview sandbox, but in the real published app). We broke it by replacing it with `window.open`.

## Fix

Revert `downloadFromSignedUrl` to the blob-based approach. The blob pattern forces the browser to treat it as a download because the `download` attribute on the anchor element works for same-origin blob URLs. Keep the `setTimeout` for revocation and `window.open` as fallback only if fetch fails.

### `src/hooks/useModularScripts.ts`

```typescript
export async function downloadFromSignedUrl(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (error) {
    window.open(url, '_blank');
  }
}
```

### `src/components/modals/ScriptModal.tsx` — `handleDownload`

Revert the signed URL path back to using `downloadFromSignedUrl` instead of `window.open`:

```typescript
if (signedUrls?.bootstrap_url) {
  await downloadFromSignedUrl(signedUrls.bootstrap_url, `navspot-bootstrap-v${scriptVersion}.rsc`);
  toast({ ... });
  return;
}
```

The blob download works in the published app (navspot.lovable.app) because it's not sandboxed. The Lovable preview may still block it, but that's expected — the production environment is what matters.

