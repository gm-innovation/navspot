

# Fix: Sync parado - Erro de sintaxe no template sync-standalone

## Causa Raiz

O template `sync-standalone` na tabela `script_templates` tem um erro de sintaxe RouterOS na linha 184:

```text
Errado:  } else {
Correto: } else={
```

No RouterOS 7.x, a construcao `if/else` usa a sintaxe `:if (cond) do={ } else={ }`. O uso de `} else {` (sem `=`) causa um erro de parse que impede a execucao do script inteiro. Isso explica:

1. Primeiro sync falhou (log 993: "Primeiro sync falhou (nao-fatal)")
2. Zero syncs nos ultimos 15+ minutos (scheduler roda mas script crashe a cada tentativa)
3. Acao `add_user_profile` pendente desde 18:26 nunca processada

## Correcao

### Parte 1: SQL - Corrigir template

Atualizar o template `sync-standalone` substituindo `} else {` por `} else={`:

```sql
UPDATE script_templates 
SET content = REPLACE(content, '} else {', '} else={'),
    version = '7.8.6'
WHERE id = 'sync-standalone';
```

Nota: a version tambem sera corrigida de '7.8.8' para '7.8.6'.

### Parte 2: Reinstalar script no roteador

Apos corrigir o template no banco, o usuario precisa **regenerar o script RSC** e reimportar no roteador:

1. Na pagina de Hotspots, clicar "Gerar Script" para o hotspot afetado
2. Baixar o arquivo `.rsc` gerado
3. No roteador: `/import sync.rsc`

OU executar manualmente via Winbox: editar o script `navspot-sync` e corrigir `} else {` para `} else={`.

### Parte 3: Verificar que a acao pendente sera processada

A acao `add_user_profile` (id: af2f8d2c) ja esta pendente. Apos corrigir o script no roteador, o proximo sync (em ~1 min) vai buscar essa acao e criar o perfil `tripulacao-googlemarine` no hardware.

## Resultado esperado

1. Script parseia corretamente no RouterOS
2. Sync volta a funcionar a cada 1 minuto
3. Perfil `tripulacao-googlemarine` criado no roteador
4. Login do `alexandre.silva` funciona

## Arquivos modificados

| Tipo | Mudanca |
|------|---------|
| SQL (script_templates) | Corrigir `} else {` para `} else={` e version para 7.8.6 |

Nenhum arquivo de codigo do projeto sera modificado.
