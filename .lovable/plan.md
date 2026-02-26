

# Fix: Download guardian.rsc not triggering save dialog

## Problem

The `downloadFromSignedUrl` function revokes the blob URL immediately after `a.click()`, before the browser has time to process the download. This is a race condition -- the toast fires ("Download iniciado") but the actual file save dialog never opens.

## Fix in `src/hooks/useModularScripts.ts`

Add a `setTimeout` before revoking the blob URL, giving the browser time to process the download:

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
    // Delay revoke to let the browser process the download
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (error) {
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
}
```

Single change: `URL.revokeObjectURL(blobUrl)` -> `setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)`

