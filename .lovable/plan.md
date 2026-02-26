

# Atualizar template `sync-standalone` no banco

## Problema
O template `sync-standalone` contém o body antigo (grande, com todos os handlers). O body novo e limpo existe no template `sync` mas não é usado pelo `gen7post`.

## Implementação
1. Executar UPDATE na tabela `script_templates` onde `id = 'sync-standalone'`, substituindo o `content` inteiro pelo novo installer com body limpo (handlers: `block_quota`, `unblock_quota`, `force_reg`, `create_user`)
2. Atualizar `version` do template

O SQL fornecido pelo usuário será executado via insert tool.

