

# Correcao do mt-scripts: esm.sh + Storage Hibrido

## Descoberta Critica

Durante a investigacao, ficou claro que o problema do `mt-scripts` NAO e o tamanho do arquivo (99 linhas) nem os templates (ja estao no banco). O padrao observado:

| Funcao | Import | Status | Linhas |
|--------|--------|--------|--------|
| mikrotik-sync | esm.sh | OK | 1819 |
| mikrotik-recovery-download | npm: | OK | 190 |
| mikrotik-script-generator | npm: | OK | 595 |
| mt-scripts | npm: | 404 | 99 |
| mt-scripts (stub sem import) | nenhum | OK | 1 |

O stub sem nenhum import funciona. As demais funcoes com `npm:` tambem funcionam. Isso sugere um problema de **estado fantasma no gateway** especifico para `mt-scripts` com o import `npm:`. A correcao mais segura e trocar para `esm.sh` (padrao de todas as funcoes estaveis).

## Plano em 2 Partes

### Parte 1: Fix Imediato - Trocar npm: para esm.sh

Apenas 1 linha precisa mudar no `mt-scripts/index.ts`:

```text
ANTES:  import { createClient } from 'npm:@supabase/supabase-js@2'
DEPOIS: import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
```

Depois: delete + redeploy + testar health endpoint.

O codigo atual (99 linhas, templates no banco) ja esta correto. So precisa do import certo.

### Parte 2 (Opcional): Storage Hibrido

Se a Parte 1 funcionar, a arquitetura atual (tabela `script_templates` + edge function leve) ja e suficiente. Porem, se quiser adicionar Storage como camada extra, a abordagem hibrida seria:

**Tabela `script_templates`** (ja existe): metadados + versao + conteudo
**Storage bucket `script-templates`**: arquivos .rsc como backup/CDN

```text
Fluxo normal:
  MikroTik --> mt-scripts --> DB (script_templates) --> replace --> .rsc

Fluxo com storage (futuro/fallback):
  MikroTik --> mt-scripts --> tenta DB --> se falhar --> fetch do Storage --> replace --> .rsc
```

Vantagens do hibrido:
- Storage serve como CDN (cacheable, rapido)
- Fallback se o banco estiver lento
- Templates podem ser atualizados via upload de arquivo OU via SQL

Desvantagens:
- Complexidade extra de manter 2 fontes sincronizadas
- Storage publico expoem os templates (sem dados sensiveis, mas visivel)

**Recomendacao**: Implementar apenas a Parte 1 agora. A abordagem de tabela no banco ja resolve o problema dos templates. O Storage hibrido pode ser adicionado futuramente como otimizacao se houver necessidade de performance.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/mt-scripts/index.ts`

Unica mudanca: linha 1, trocar import.

### Deploy

1. Delete `mt-scripts`
2. Redeploy `mt-scripts`
3. Testar: `GET /mt-scripts?type=health`
4. Se 200: testar `GET /mt-scripts?type=sync-raw&token=TOKEN`
5. Se ainda 404: tentar nome completamente novo (ex: `navspot-rsc`)

### Correcao adicional: reverter mikrotik-recovery-download

Na mensagem anterior, o import de `mikrotik-recovery-download` foi trocado de `esm.sh` para `npm:`. Como funciona com ambos, mas `esm.sh` e o padrao estavel, vale reverter para manter consistencia.

