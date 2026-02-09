
# Bump versão do Script Generator para v7.1.59

## Problema

O `mikrotik-script-generator` ainda define `VERSION = "7.1.58"` (linha 8). Como o frontend extrai a versão da resposta da API (`data.version`), o modal exibe "v7.1.58" e o conteúdo do bootstrap também mostra v7.1.58.

## Mudança

| Arquivo | Linha | De | Para |
|---------|-------|----|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 8 | `const VERSION = "7.1.58"` | `const VERSION = "7.1.59"` |

## Resultado

- O titulo do modal passara a exibir "Script MikroTik v7.1.59"
- O header do bootstrap gerado mostrara "NAVSPOT Bootstrap Script v7.1.59"
- O arquivo baixado sera nomeado `navspot-bootstrap-v7.1.59.rsc`
- Consistencia de versao com o recovery (ja em v7.1.59) e o sync (ja com fix v7.1.59)

## Redeploy

- `mikrotik-script-generator`
