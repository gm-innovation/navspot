

# Diagnóstico e Correção: Versão do Script Não Atualizou

## Problema Identificado

Existem **dois arquivos** que precisam estar atualizados para a versão 7.1.2:

1. **`mikrotik-scripts/index.ts`** - Versão 7.1.2 ✅ (código atualizado)
   - **Problema**: A função está retornando 404 (não deployou corretamente)
   
2. **`mikrotik-script-generator/index.ts`** - Versão 7.1.1 ❌
   - Este é o arquivo que gera o **bootstrap** baixado pelo usuário
   - Ainda está na versão 7.1.1

## Por Que o Script Mostra v7.1.1

Quando você baixa o script do MikroTik, ele vem do `mikrotik-script-generator`, que ainda está na versão **7.1.1**. Por isso você vê `NAVSPOT v7.1.1` no output.

## Solução em Duas Partes

### Parte 1: Atualizar mikrotik-script-generator para v7.1.2

O arquivo `mikrotik-script-generator/index.ts` precisa ser atualizado para:
- Bump de VERSION para 7.1.2
- Atualizar referências no código

### Parte 2: Investigar o Deploy da mikrotik-scripts

A função `mikrotik-scripts` está retornando 404 apesar do deploy reportar sucesso. Possíveis causas:

1. Cache do CDN ainda servindo versão antiga
2. Erro de compilação silencioso
3. Delay na propagação do deploy

## Plano de Ação

### Mudanças no Arquivo `supabase/functions/mikrotik-script-generator/index.ts`

| Linha | Antes | Depois |
|-------|-------|--------|
| 8 | `VERSION = "7.1.1"` | `VERSION = "7.1.2"` |
| 12 | `mikrotik-script-generator v7.1.0` | `mikrotik-script-generator v7.1.2` |

### Re-deploy das Funções

Após atualizar o código, fazer deploy das duas funções:
- `mikrotik-script-generator`
- `mikrotik-scripts`

### Verificação

1. Testar endpoint `mikrotik-script-generator` via POST
2. Verificar se retorna script com versão 7.1.2
3. Testar endpoint `mikrotik-scripts` via GET (atualmente 404)

## Nota Importante

O problema do 404 na função `mikrotik-scripts` pode ser temporário (propagação de deploy) ou permanente (erro de build). Se persistir após as correções, pode ser necessário investigar mais profundamente ou recriar a função.

