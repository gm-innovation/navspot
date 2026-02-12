

# Fix v7.6.1: Corrigir MAX_ACTIONS no Template Sync

## Problema

O template `sync` no banco de dados contém `:local MAX_ACTIONS 200`. O underscore no nome da variavel causa `expected end of command (line 23 column 11)` no hAP ax2.

## Solucao

Uma unica alteracao cirurgica: renomear `MAX_ACTIONS` para `maxAct` e remover blank lines do template.

## Alteracoes

### 1. SQL Migration - Corrigir template sync

Substituir o template `sync` na tabela `script_templates`. As unicas diferencas vs o template atual:

1. `MAX_ACTIONS` renomeado para `maxAct` (3 ocorrencias)
2. Blank lines removidas (corresponder ao estilo do script testado)

### 2. Bump de versao para 7.6.1

- `supabase/functions/mt-scripts/index.ts`: VERSION "7.6.0" -> "7.6.1"
- `supabase/functions/mikrotik-script-generator/index.ts`: VERSION "7.6.0" -> "7.6.1"

### 3. Deploy e teste

1. Atualizar VERSION nos 2 edge functions
2. Executar SQL migration
3. Deploy mt-scripts e mikrotik-script-generator
4. No MikroTik: `/system script run navspot-guardian` ou `/import navspot-bootstrap-v7.6.1.rsc`
5. Verificar: `/system script run navspot-sync` -- sem parse error

## Template corrigido (diff minimo)

Apenas 3 linhas mudam no template atual:

```text
Antes:  :local MAX_ACTIONS 200
Depois: :local maxAct 200

Antes:  :while ([:find $a ";" $pos] >= 0 && ($cnt < $MAX_ACTIONS)) do={
Depois: :while ([:find $a ";" $pos] >= 0 && ($cnt < $maxAct)) do={

Antes:  :if ($cnt >= $MAX_ACTIONS) do={
        :log warning ("NAVSPOT-SYNC: action cap reached (" . $MAX_ACTIONS . "), ...")
Depois: :if ($cnt >= $maxAct) do={
        :log warning ("NAVSPOT-SYNC: action cap reached (" . $maxAct . "), ...")
```

Toda a logica permanece identica. Zero mudancas estruturais.

