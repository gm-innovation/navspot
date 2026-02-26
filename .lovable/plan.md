

# v7.9.17 — Remover `replaceSourceWithImport`, servir templates direto

## Mudanças em `supabase/functions/gen7post/index.ts`

### 1. Version bump (linha 2)
`"7.9.16"` → `"7.9.17"`

### 2. Remover `replaceSourceWithImport` (linhas 4-31)
Função inteira deletada. Não há mais transformação de templates.

### 3. Remover GET handler (linhas 43-62)
Os tipos `sync-rsc` e `guardian-rsc` via GET eram usados pelo `replaceSourceWithImport` (o MikroTik fazia fetch GET para baixar o .rsc). Com templates servidos direto, o GET não tem mais consumidor. Removido.

**Nota:** se no futuro precisar de GET para outro fim, re-adiciona. Por ora, simplifica.

### 4. Serve mode — templates direto (linhas 78-111)
- Remover `scriptsUrl` (não usado mais)
- `sync-standalone`, `sync-source`, `sync-rsc` → todos servem `tpl("sync-standalone", v)` direto
- `guardian-standalone`, `guardian-source`, `guardian-rsc` → todos servem `tpl("guardian-standalone", v)` direto
- `all` → concatena `tpl()` direto sem transformação
- `recovery` → idem

### 5. Generate mode — templates direto (linhas 121-124)
- Remover `scriptsUrl`
- `s1 = await tpl("sync-standalone", v)` direto (sem `replaceSourceWithImport`)
- `s2 = await tpl("guardian-standalone", v)` direto

### 6. `tpl()` mantém a lógica v7.9.16
CRLF normalize → trimStart seletivo (fora de `source="..."`) → replaceAll variáveis. Sem mudança.

### 7. `.lovable/plan.md` — atualizar

## Resultado
Código morto eliminado: `replaceSourceWithImport`, `extractSourceBody` (já não existia), GET handler, tipos intermediários. Templates servidos direto do banco com substituição de variáveis apenas.

