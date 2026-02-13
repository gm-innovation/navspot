
# Correcao de Versao: v7.8.8 nao existe, a ultima e v7.8.6

## Problema

Os comentarios e logs inseridos nas ultimas correcoes referenciam "v7.8.8" que nao existe. A versao real do sistema e **v7.8.6** (constante VERSION no `mt-gen`). Isso causa confusao na rastreabilidade.

## Locais com referencia errada

| Arquivo | Linhas | Referencia |
|---------|--------|------------|
| `supabase/functions/mikrotik-sync/index.ts` | 1208, 1243, 1538, 1540, 1543 | Comentarios e logs com "v7.8.8" |
| `src/hooks/usePerfisVelocidade.ts` | 267 | Comentario com "v7.8.8" |

## Correcao

Substituir todas as referencias "v7.8.8" por "v7.8.6" nos comentarios e logs desses dois arquivos. Sao 6 ocorrencias no total:

### mikrotik-sync/index.ts

- Linha 1208: `// v7.8.8: Only force repair...` -> `// v7.8.6: Only force repair...`
- Linha 1243: `console.log(...v7.8.8: Skipping force repair...)` -> `v7.8.6`
- Linha 1538: `// v7.8.8: Revert to cache check...` -> `// v7.8.6: Revert to cache check...`
- Linha 1540: `console.log(...v7.8.8: Profile in cache...)` -> `v7.8.6`
- Linha 1543: `console.log(...v7.8.8: Profile not in cache...)` -> `v7.8.6`

### usePerfisVelocidade.ts

- Linha 267: `// v7.8.8: Force device reconnection...` -> `// v7.8.6: Force device reconnection...`

Nenhuma mudanca de logica -- apenas correcao de versionamento nos comentarios e strings de log.
