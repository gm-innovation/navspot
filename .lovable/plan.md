

# Bump de Versao para v7.4.0

## Problema

O script foi reescrito (sync ultra-minimal com `as-value output=user`), mas a constante `VERSION` permanece em `"7.3.0"`. O guardian no roteador compara a versao do script instalado com a versao servida pela API -- se sao iguais, nao forca re-download. Resultado: o roteador continua rodando o sync antigo.

## Solucao

Incrementar a constante `VERSION` de `"7.3.0"` para `"7.4.0"` no arquivo `supabase/functions/mikrotik-scripts/index.ts`.

## Detalhes tecnicos

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

1. Alterar a linha `const VERSION = "7.3.0"` para `const VERSION = "7.4.0"`

Isso afeta automaticamente:
- O header do installer (`NAVSPOT Scripts Installer v7.4.0`)
- Os logs do sync (`NAVSPOT-SYNC v7.4.0`)
- Os logs do guardian (`NAVSPOT-GUARDIAN v7.4.0`)
- A deteccao de versao pelo guardian (forca re-download)

### Apos o bump

1. Deletar a edge function `mikrotik-scripts` do servidor (resolver o 404 persistente)
2. Redeployar a funcao
3. Testar com curl que o endpoint responde e retorna v7.4.0
4. No roteador, o guardian detectara a mudanca de versao e forcara o re-download automatico (ou reimportar o bootstrap manualmente)

### Sincronizacao com `mikrotik-script-generator`

Conforme a politica de versionamento, o `mikrotik-script-generator` tambem deve ter sua versao sincronizada. Verificar se esse arquivo tambem precisa de bump.

