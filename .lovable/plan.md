

# Fix: Download de scripts abre no navegador em vez de salvar

## Problema

A funcao `downloadFromSignedUrl` usa o atributo HTML `download` em um link apontando para uma URL cross-origin (Supabase Storage). Navegadores ignoram o atributo `download` quando a URL e de outro dominio -- resultado: o arquivo abre no navegador em vez de acionar o dialogo de "Salvar como".

## Solucao

Alterar `downloadFromSignedUrl` em `src/hooks/useModularScripts.ts` para:

1. Fazer `fetch()` do conteudo da URL assinada
2. Converter a resposta em `Blob`
3. Criar uma URL local via `URL.createObjectURL(blob)`
4. Usar essa URL local (mesmo dominio) com o atributo `download` -- que agora funciona corretamente
5. Revogar a URL local apos o download

## Arquivo alterado

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useModularScripts.ts` | Reescrever `downloadFromSignedUrl` para usar fetch + blob |

## Codigo da correcao

A funcao `downloadFromSignedUrl` sera alterada de:

```typescript
export function downloadFromSignedUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

Para:

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
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    // Fallback: abrir em nova aba se fetch falhar
    window.open(url, '_blank');
  }
}
```

Tambem sera necessario ajustar as chamadas em `ScriptModal.tsx` para usar `await` (a funcao passa a ser async), adicionando tratamento de erro adequado.

## Impacto

- Nenhuma mudanca de backend
- Nenhuma mudanca de banco
- Correcao puramente frontend (2 arquivos)

