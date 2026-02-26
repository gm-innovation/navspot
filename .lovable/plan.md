

# Fix: Download not triggering save dialog

## Root cause

The `downloadFromSignedUrl` function uses `a.click()` with a blob URL to trigger downloads. In the Lovable preview iframe (sandboxed), programmatic `a.click()` downloads are silently blocked by the browser's sandbox policy. The fetch succeeds (200), the blob is created, but the click never opens a save dialog. The `catch` block isn't reached because there's no error — the download is just silently suppressed.

## Fix

Replace the blob-based download with `window.open(url, '_blank')` as the **primary** method for signed URLs. Since these are already direct file URLs from storage, opening them in a new tab triggers the browser's native download behavior, which works even in sandboxed iframes.

### `src/hooks/useModularScripts.ts` — `downloadFromSignedUrl`

```typescript
export async function downloadFromSignedUrl(url: string, filename: string) {
  // Signed URLs point directly to files — open in new tab to trigger download
  window.open(url, '_blank');
}
```

This is simpler and more reliable. The browser will handle the content-disposition from the storage response.

### `src/components/modals/ScriptModal.tsx` — `handleDownload` (bootstrap)

The bootstrap download at line 87-96 also uses the blob pattern for inline script content (not a signed URL). This path should keep the blob approach but needs the same iframe-safe fix. For the signed URL path (line 87-90), switch to `window.open`:

```typescript
if (signedUrls?.bootstrap_url) {
  window.open(signedUrls.bootstrap_url, '_blank');
  toast({ ... });
  return;
}
```

The inline blob download (lines 91-99) for non-signed-URL case also needs `a.target = '_blank'` to work in sandboxed contexts.

## No version bump needed — frontend-only change

