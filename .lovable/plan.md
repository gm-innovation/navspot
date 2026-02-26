

# Fix: `.trimStart()` no output do `tpl()` para eliminar newline inicial

## Diagnóstico
O `tpl()` (linha 10) faz trimStart por linha, mas não remove o `\n` inicial do template inteiro. Resultado: o `source="` do script começa com linha vazia → RouterOS marca como **invalid**.

## Mudança
Em `supabase/functions/gen7post/index.ts`, linha 10 — adicionar `.trimStart()` ao resultado final do `tpl()`:

```
// Antes:
for(const[k,val]of Object.entries(v))c=c.replaceAll(k,val);return c

// Depois:
for(const[k,val]of Object.entries(v))c=c.replaceAll(k,val);return c.trimStart()
```

Isso garante que nenhum template retornado comece com whitespace/newline, independente do conteúdo no banco.

## Bump de versão
`const V="7.9.18"` → `const V="7.9.19"` para que hotspots detectem a mudança e o aviso de "scripts desatualizados" funcione.

## Arquivos
- `supabase/functions/gen7post/index.ts` — 2 alterações (trimStart + version bump)
- Deploy automático da edge function

