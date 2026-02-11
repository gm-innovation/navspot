

# Bump de Versao: 7.2.0 -> 7.2.1

## Objetivo

Atualizar a constante `VERSION` de `"7.2.0"` para `"7.2.1"` no arquivo `supabase/functions/mikrotik-scripts/index.ts` (linha 38). Isso garante rastreabilidade da mudanca (adicao do handler `configure_hotspot_profile` ao Fallback AP) e permite regressao controlada caso necessario.

## Mudanca

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

- Linha 38: `const VERSION = "7.2.0"` -> `const VERSION = "7.2.1"`

## Impacto

Apos o deploy, todos os scripts gerados (bootstrap, sync, AP, guardian) passam a carregar `v7.2.1` nos logs e headers. O Guardian nos roteadores detectara a mudanca de versao e forcara o re-download automatico dos scripts atualizados.

## Verificacao

Apos re-importar o bootstrap:
- Logs mostrarao `NAVSPOT-SYNC v7.2.1`, `NAVSPOT-ACTION v7.2.1F`, etc.
- O arquivo de download sera nomeado `navspot-bootstrap-v7.2.1.rsc`

