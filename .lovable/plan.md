

# Correção v7.1.16: File-Based Script Creation (Solução Definitiva)

## Diagnóstico Confirmado

O erro **"expected end of command (line 61 column 9)"** ocorre porque a função `wrapSourceWithContinuation()` introduzida em v7.1.14/15 está cortando sequências de escape no meio:

1. A string escapada contém sequências como `\\r\\n` (4 chars)
2. O chunking de 120 chars corta no meio dessas sequências
3. Exemplo: `\\r\\n` vira `\\r` no final + `\\n` no início do próximo chunk
4. O RouterOS 6.x interpreta isso como sintaxe inválida

## Solução Definitiva: Script via Arquivo Temporário

**Estratégia aprovada**: Escrever o conteúdo do script em um arquivo temporário, depois criar o script lendo o conteúdo via `[/file get ... contents]`.

**Por que funciona**:
1. O `/import` apenas executa comandos simples (escrever arquivo, criar script)
2. O conteúdo do script não é parseado pelo `/import`
3. RouterOS atribui o conteúdo do arquivo diretamente ao `source`
4. Newlines literais são aceitos em `/file set contents="..."`
5. Não há limite de linha para o conteúdo do arquivo

## Implementação Técnica

### 1) Remover `wrapSourceWithContinuation()` completamente

Esta função é a causa raiz do problema.

### 2) Criar helper `escapeForFileContents()`

```typescript
/**
 * v7.1.16: Escape script source for /file set contents="..."
 * CRÍTICO: Ordem das substituições é importante para evitar double-escaping
 */
function escapeForFileContents(script: string): string {
  return script
    .replace(/\\/g, '\\\\')   // 1. Escapa backslashes PRIMEIRO
    .replace(/"/g, '\\"')      // 2. Escapa aspas DEPOIS
    .replace(/\$/g, '\\$')     // 3. Escapa $ para evitar expansão de variável
}
```

### 3) Criar helper `generateScriptViaFile()`

```typescript
function generateScriptViaFile(
  scriptName: string,
  sourceText: string,
  policy: string = "read,write,test"
): string {
  const tempFile = `${scriptName}.txt`
  const escapedContents = escapeForFileContents(sourceText)
  
  return `# Create ${scriptName} via file (v${VERSION})
:do { /file remove "${tempFile}" } on-error={}
/file print file=${tempFile} where name="__never__"
:delay 500ms
/file set [find where name="${tempFile}"] contents="${escapedContents}"
:delay 500ms
:do { /system script remove [find where name="${scriptName}"] } on-error={}
:delay 200ms
/system script add name="${scriptName}" policy=${policy} source=[/file get [find where name="${tempFile}"] contents]
:delay 200ms
:do { /file remove "${tempFile}" } on-error={}
:log info "NAVSPOT: ${scriptName} v${VERSION} instalado"
`
}
```

### 4) Atualizar todas as funções RSC

- `generateSyncRSC()` → usa `generateScriptViaFile("navspot-sync", source)`
- `generateActionProcessorRSC()` → usa `generateScriptViaFile("navspot-action-processor", source)`
- `generateGuardianRSC()` → usa `generateScriptViaFile("navspot-guardian", source)`
- `generateSyncScript()` → usa `generateScriptViaFile()` (legacy)
- `generateActionProcessorScript()` → usa `generateScriptViaFile()` (legacy)
- `generateGuardianScript()` → usa `generateScriptViaFile()` (legacy)

### 5) Version bump para 7.1.16

## Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | Remover `wrapSourceWithContinuation`, adicionar `escapeForFileContents` e `generateScriptViaFile`, atualizar todas as funções RSC, bump v7.1.16 |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION 7.1.16 |
| `src/components/modals/ScriptModal.tsx` | Bump scriptVersion 7.1.16 |
| `src/pages/Embarcacoes.tsx` | Bump currentScriptVersion 7.1.16 |

## Exemplo de RSC Gerado (v7.1.16)

```routeros
# Create navspot-action-processor via file (v7.1.16)
:do { /file remove "navspot-action-processor.txt" } on-error={}
/file print file=navspot-action-processor.txt where name="__never__"
:delay 500ms
/file set [find where name="navspot-action-processor.txt"] contents=":log info \"NAVSPOT-ACTION v7.1.16: Start\"
:global navspotLock
:if (\$navspotLock = \"1\") do={ :log info \"NAVSPOT-ACTION: lock ativo\"; :return }
... (MÚLTIPLAS LINHAS LITERAIS SÃO ACEITAS)"
:delay 500ms
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:delay 200ms
/system script add name="navspot-action-processor" policy=read,write,test source=[/file get [find where name="navspot-action-processor.txt"] contents]
:delay 200ms
:do { /file remove "navspot-action-processor.txt" } on-error={}
:log info "NAVSPOT: navspot-action-processor v7.1.16 instalado"
```

## Validação no MikroTik

```routeros
# 1. Importar bootstrap v7.1.16
/import navspot-bootstrap-v7.1.16.rsc

# 2. Verificar scripts válidos (SEM flag I)
/system script print where name~"navspot"

# 3. Rodar action-processor manualmente
/system script run navspot-action-processor

# 4. Verificar logs (deve mostrar "NAVSPOT-ACTION v7.1.16: Start")
/log print where message~"NAVSPOT-ACTION"

# 5. Rodar sync completo
/system script run navspot-sync
/log print where message~"NAVSPOT"
```

## Checklist de Testes

- [ ] Remover `wrapSourceWithContinuation()` completamente
- [ ] Implementar `escapeForFileContents()` com ordem correta de escapes
- [ ] Implementar `generateScriptViaFile()` com pattern file-based
- [ ] Atualizar todas as funções RSC e legacy
- [ ] Testar em RouterOS 6.49.x
- [ ] Confirmar scripts sem flag **I**
- [ ] Rodar sync e verificar logs sem erros de sintaxe
- [ ] Testar em dispositivo com flash lento (hAP lite)

