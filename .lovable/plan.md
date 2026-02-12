
# v7.8.1: Upload Direto para Storage (Sem Escaping)

## Problema Atual

O sistema atual usa um processo em 2 passos problemático:
1. Busca o template `sync` (codigo RouterOS puro com `$var`)
2. Escapa `$`, `"`, `\` e injeta dentro de `source="..."` do template `sync-standalone`

Esse processo de escaping e fragil e ja causou o flag `I - invalid` no router. O arquivo `.rsc` que o usuario validou no hardware funciona perfeitamente porque ja contem todos os escapes corretos nativamente.

## Solucao: Templates Completos Pre-Escapados

Substituir os templates `sync-standalone` e `guardian-standalone` no banco por arquivos `.rsc` completos e auto-contidos, com todos os escapes RouterOS ja embutidos. A Edge Function so precisa substituir `{{SYNC_TOKEN}}`, `{{SYNC_URL}}`, `{{RECOVERY_URL}}` e `{{VERSION}}` — sem nenhum escaping adicional.

## Plano de Execucao

### 1. Atualizar template `sync-standalone` no banco (SQL migration)

Substituir o conteudo atual (que usa `{{SYNC_SOURCE}}`) pelo arquivo `.rsc` completo baseado no arquivo validado pelo usuario, mas com placeholders:

- `{{SYNC_TOKEN}}` no lugar do token hardcoded
- `{{SYNC_URL}}` no lugar da URL do mikrotik-sync
- `{{VERSION}}` no lugar da versao
- `{{SYNC_INTERVAL}}` no lugar do intervalo

O arquivo ja contera todos os escapes RouterOS corretos (`\"`, `\$`, `\\\"`) nativamente.

### 2. Atualizar template `guardian-standalone` no banco (SQL migration)

Mesmo principio: criar o `.rsc` completo com o conteudo do guardian ja pre-escapado para `source="..."`, usando `{{SYNC_TOKEN}}`, `{{RECOVERY_URL}}` e `{{VERSION}}` como placeholders.

### 3. Simplificar a Edge Function `mikrotik-script-generator`

Remover a logica de `innerTemplateId` e todo o bloco de escaping (linhas 97-106). Para sync-standalone e guardian-standalone, a Edge Function agora apenas:

1. Busca o template do banco
2. Faz `replaceAll` dos placeholders
3. Faz upload direto para Storage

Sem `.replace(/\$/g, '\\$')`, sem `.replace(/"/g, '\\"')` — nada disso.

### 4. Preservar encoding

O upload para Storage usa `new TextEncoder().encode(content)` que ja garante UTF-8 sem BOM. A funcao `normalizeNewlines` ja garante LF.

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| SQL migration | UPDATE `sync-standalone` e `guardian-standalone` na tabela `script_templates` com conteudo .rsc completo |
| `supabase/functions/mikrotik-script-generator/index.ts` | Remover logica de `innerTemplateId`/escaping; simplificar `renderTemplate` |

## Detalhes Tecnicos

### Template sync-standalone (novo conteudo)

Sera o arquivo do usuario com 3 substituicoes:
- Linha do token: `\"{{SYNC_TOKEN}}\"` em vez do hash hardcoded
- Linha do URL: `\"{{SYNC_URL}}\"` em vez da URL hardcoded
- Versao: `{{VERSION}}` onde aparece
- Intervalo do scheduler: `{{SYNC_INTERVAL}}m`

O wrapper (remove antigo, add scheduler, netwatch, primeiro sync) sera mantido exatamente como esta no arquivo do usuario, porem adicionando as partes do standalone atual (scheduler, netwatch, primeiro sync).

### Template guardian-standalone (novo conteudo)

Mesma abordagem: o conteudo do guardian sera pre-escapado manualmente para funcionar dentro de `source="..."`, com placeholders `{{SYNC_TOKEN}}`, `{{RECOVERY_URL}}` e `{{VERSION}}`.

### Edge Function simplificada

A funcao `renderTemplate` perde os parametros `innerTemplateId` e `syncToken`. Fica apenas:

```typescript
async function renderTemplate(supabase, templateId, vars) {
  const { data: tpl, error } = await supabase
    .from('script_templates').select('content')
    .eq('id', templateId).single()
  if (error || !tpl) throw new Error(`Template '${templateId}' not found`)
  let script = applyPlaceholders(tpl.content, vars)
  return normalizeNewlines(script)
}
```

As chamadas mudam de:
```typescript
renderTemplate(supabaseService, 'sync-standalone', vars, 'sync')
```
Para:
```typescript
renderTemplate(supabaseService, 'sync-standalone', vars)
```

## Ordem de Execucao

1. SQL migration: atualizar os 2 templates no banco
2. Simplificar Edge Function (remover escaping)
3. Deploy da Edge Function
4. Testar: gerar scripts, baixar, importar no router, verificar que nao ha flag `I - invalid`

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Escaping manual incorreto no template guardian | Construir a partir do guardian atual, aplicando os mesmos padroes do sync validado |
| Templates antigos em uso pelo mode=serve legado | mode=serve tambem usa renderTemplate, que agora funciona igual — sem inner injection |
| Placeholders nao encontrados | `applyPlaceholders` ja lanca erro se sobrar `{{...}}` |
