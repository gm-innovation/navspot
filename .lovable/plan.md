

# Correção v7.1.8: Usar `source="..."` em vez de `source={ }` para /import

## Diagnóstico do Problema

O erro "syntax error (line 4 column 11)" ocorre porque:

1. O RouterOS 6.x **não suporta `source={ }` em arquivos .rsc** importados via `/import`
2. O bloco `source={ }` só funciona no **terminal interativo**
3. Quando o parser encontra `source={` em arquivo .rsc, ele interpreta como início de bloco de código e falha

### Evidência
Os exemplos oficiais do MikroTik sempre usam:
```routeros
/system/script/add name="script" source="
linha1
linha2
"
```

E **não**:
```routeros
/system/script/add name="script" source={
linha1
linha2
}
```

## Solução: Usar `source="..."` com Escape Correto

### Mudanças Principais

O código precisa usar `source="..."` (com aspas) em vez de `source={...}` (com chaves), e aplicar escape correto:
- `"` → `\"`
- `$` → `\$` (apenas variáveis locais)
- `\` → `\\`

**Runtime vars** como `$(mac)` devem permanecer **sem escape**.

---

## Mudanças no Código

### A) `supabase/functions/mikrotik-scripts/index.ts`

#### 1) Corrigir `escapeForSourceBlock()` - Renomear para refletir o uso com aspas

```typescript
/**
 * Escape script source for embedding in source="..." block
 * RouterOS requires escaping " and $ inside source="" blocks
 * Runtime vars $(...) are preserved unescaped
 */
function escapeForSourceQuotes(script: string): string {
  // Preserve runtime vars $(...) BEFORE escaping
  const preserved = script.replace(/\$\(/g, '@@RUNTIME_VAR@@')
  
  const escaped = preserved
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')      // Escape double quotes
    .replace(/\$/g, '\\$')     // Escape dollar signs (local vars)
  
  // Restore runtime vars (unescaped)
  return escaped.replace(/@@RUNTIME_VAR@@/g, '$(')
}
```

#### 2) Alterar `generateSyncRSC()` - Usar aspas em vez de chaves

```typescript
function generateSyncRSC(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  return `# NAVSPOT Sync v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source="${escapedSource}"
:log info "NAVSPOT: Sync v${VERSION} instalado"
`
}
```

#### 3) Alterar `generateActionProcessorRSC()` - Usar aspas

```typescript
function generateActionProcessorRSC(): string {
  const source = generateActionProcessorSource()
  const escapedSource = escapeForSourceQuotes(source)
  return `# NAVSPOT Action Processor v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source="${escapedSource}"
:log info "NAVSPOT: Action-processor v${VERSION} instalado"
`
}
```

#### 4) Alterar `generateGuardianRSC()` - Usar aspas

```typescript
function generateGuardianRSC(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  const escapedSource = escapeForSourceQuotes(source)
  return `# NAVSPOT Guardian v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source="${escapedSource}"
:log info "NAVSPOT: Guardian v${VERSION} instalado"
`
}
```

#### 5) Também corrigir as funções legacy (generateSyncScript, etc.)

Aplicar a mesma correção às funções:
- `generateSyncScript()`
- `generateActionProcessorScript()`
- `generateGuardianScript()`

#### 6) Bump de versão para v7.1.8

- `VERSION = "7.1.8"`
- Atualizar docblock

---

### B) Outros Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION para "7.1.8" |
| `src/components/modals/ScriptModal.tsx` | Default scriptVersion="7.1.8" |
| `src/pages/Embarcacoes.tsx` | Fallback currentScriptVersion="7.1.8" |

---

## Consideração Importante: Newlines

Quando usamos `source="..."` com aspas, as quebras de linha precisam estar explícitas. O RouterOS aceita newlines literais dentro de strings, então o código vai funcionar.

Alternativa (se necessário): usar `\r\n` ou `\n` explícitos, mas isso aumenta a complexidade. Primeiro vamos testar com newlines literais.

---

## Validação Pós-Deploy

1. Gerar bootstrap v7.1.8
2. Importar no MikroTik: `/import navspot-bootstrap-v7.1.8.rsc`
3. Verificar que não há mais "syntax error"
4. Verificar `/system script print` → navspot-sync, navspot-action-processor com Source preenchido
5. Executar `/system script run navspot-sync`
6. Verificar logs `NAVSPOT-ACTION v7.1.8: Start`
7. Verificar `/ip hotspot user print where name="alexandre.silva"` → usuário criado

---

## Resumo da Mudança

| Antes (v7.1.7) | Depois (v7.1.8) |
|----------------|-----------------|
| `source={ código }` | `source="código_escapado"` |
| Parser falha no RouterOS 6.x | Compatível com /import |
| Chaves só funcionam no terminal | Aspas funcionam em .rsc |

