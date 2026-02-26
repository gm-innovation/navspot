
# v7.9.17 — Templates servidos direto (sem replaceSourceWithImport)

## Resumo
- `replaceSourceWithImport` removida — file I/O instável no RouterOS 7
- GET handler removido — sem consumidor
- Serve mode: todos os tipos (`sync-standalone`, `sync-source`, `sync-rsc`, `guardian-*`) servem `tpl()` direto
- Generate mode: `s1`/`s2` = `tpl()` direto, sem transformação
- `tpl()` inalterada: CRLF normalize → trimStart seletivo → replaceAll variáveis

## Status: ✅ Implementado
