

# Fix: Escapar `$` em scripts standalone para RouterOS

## Problema Raiz

Quando o `sync` template e injetado dentro do `sync-standalone` como `source="..."`, os caracteres `$` das variaveis RouterOS (`$navspotSyncLock`, `$tk`, `$ac`, `$post`, `$res`, `$body`) nao sao escapados. O RouterOS expande variaveis dentro de strings com aspas duplas no momento do `add`, resultando em variaveis vazias e o script fica invalido (flag `I - invalid`).

Exemplo do que acontece:

```text
Esperado:  :if ([:len $navspotSyncLock] = 0) do={...}
Gerado:    :if ([:len ] = 0) do={...}
```

## Solucao

Adicionar `.replace(/\$/g, '\\$')` na cadeia de escaping da funcao `renderTemplate`, na linha que processa o `innerContent` (conteudo injetado dentro de `source="..."`).

## Arquivo Alterado

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar escape de `$` na linha 105 |

## Mudanca Exata

Linha 105 atual:
```javascript
innerContent = ic.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\r\\n')
```

Linha 105 corrigida:
```javascript
innerContent = ic.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/"/g, '\\"').replace(/\n/g, '\\r\\n')
```

A ordem importa: escapar `\` primeiro, depois `$`, depois `"`, depois newlines.

## Resultado Esperado

Apos a correcao, o script gerado tera:

```text
:if ([:len \$navspotSyncLock] = 0) do={ :set navspotSyncLock "0" }
:if (\$navspotSyncLock = "1") do={ :log info "NAVSPOT-SYNC: locked"; :return }
:local tk "bba989..."
:local post ("{\"sync_token\":\"" . \$tk . "\"...")
```

E o RouterOS vai armazenar corretamente como:

```text
:if ([:len $navspotSyncLock] = 0) do={ :set navspotSyncLock "0" }
```

## Impacto

- Corrige o mesmo problema no `guardian-standalone` (que tambem injeta conteudo via `source="..."`)
- Nenhuma mudanca de banco necessaria — os templates estao corretos, o problema e apenas no escaping
- Apos deploy, basta regenerar os scripts e reimportar no router

