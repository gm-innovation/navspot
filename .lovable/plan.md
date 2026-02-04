
# Correção v7.1.7: Parser Error em source={...} no RouterOS 6.x

## Problema Identificado

O erro "expected end of command (line 6 column 68)" ocorre durante o `/import ns-sync.rsc` (ou ns-action.rsc). 

**Causa raiz**: O código gerado pelas funções `generate*RSC()` insere o script "puro" dentro de `source={...}`, mas **não aplica escape** nos caracteres especiais:
- `"` precisa virar `\"`
- `$` precisa virar `\$`
- `\` precisa virar `\\`

A função `escapeForSourceBlock()` existe no código (linha 40-46), mas **não está sendo chamada**.

## Exemplo do Problema

O script gerado atualmente:
```routeros
/system script add name="navspot-sync" source={
:log info "NAVSPOT-SYNC v7.1.6: Iniciando..."
:local token ""
...
}
```

Deveria ser:
```routeros
/system script add name="navspot-sync" source={
:log info \"NAVSPOT-SYNC v7.1.6: Iniciando...\"
:local token \"\"
...
}
```

## Solução

Aplicar `escapeForSourceBlock()` nas três funções que geram RSC com `source={...}`:

1. **`generateSyncRSC()`** (linha 352-360)
2. **`generateActionProcessorRSC()`** (linha 367-375)  
3. **`generateGuardianRSC()`** (linha 381-389)

## Mudanças no Código

### `supabase/functions/mikrotik-scripts/index.ts`

#### 1) `generateSyncRSC()` - Aplicar escape
```typescript
function generateSyncRSC(syncUrl: string, syncToken: string): string {
  const source = generateSyncSource(syncUrl, syncToken)
  const escapedSource = escapeForSourceBlock(source)  // ADICIONAR
  return `# NAVSPOT Sync v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-sync"] } on-error={}
/system script add name="navspot-sync" policy=read,write,test source={
${escapedSource}
}
:log info "NAVSPOT: Sync v${VERSION} instalado"
`
}
```

#### 2) `generateActionProcessorRSC()` - Aplicar escape
```typescript
function generateActionProcessorRSC(): string {
  const source = generateActionProcessorSource()
  const escapedSource = escapeForSourceBlock(source)  // ADICIONAR
  return `# NAVSPOT Action Processor v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source={
${escapedSource}
}
:log info "NAVSPOT: Action-processor v${VERSION} instalado"
`
}
```

#### 3) `generateGuardianRSC()` - Aplicar escape
```typescript
function generateGuardianRSC(recoveryUrl: string, syncToken: string): string {
  const source = generateGuardianSource(recoveryUrl, syncToken)
  const escapedSource = escapeForSourceBlock(source)  // ADICIONAR
  return `# NAVSPOT Guardian v${VERSION} - RSC for /import
:do { /system script remove [find name="navspot-guardian"] } on-error={}
/system script add name="navspot-guardian" policy=read,write,test source={
${escapedSource}
}
:log info "NAVSPOT: Guardian v${VERSION} instalado"
`
}
```

#### 4) Bump de versão para v7.1.7
- `VERSION = "7.1.7"`
- Atualizar docblock

### Outros Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION para "7.1.7" |
| `src/components/modals/ScriptModal.tsx` | Default scriptVersion="7.1.7" |
| `src/pages/Embarcacoes.tsx` | Fallback currentScriptVersion="7.1.7" |

## Verificação Extra: escapeForSourceBlock()

A função atual parece correta, mas vou validar a ordem das substituições:

```typescript
function escapeForSourceBlock(script: string): string {
  return script
    .replace(/\\/g, '\\\\')  // 1. Escape backslashes first
    .replace(/"/g, '\\"')     // 2. Escape double quotes  
    .replace(/\$/g, '\\$')    // 3. Escape dollar signs
    .replace(/\\\$\(/g, '$(') // 4. Restore runtime $(...) 
}
```

**PROBLEMA**: O passo 4 tenta restaurar `$(` mas após o passo 3, `$` já virou `\$`, então o padrão real seria `\\\$\(` (com os backslashes). A regex está correta, mas precisa considerar que já escapamos `\` também.

Após passo 1: `\` → `\\`
Após passo 2: `"` → `\"`
Após passo 3: `$` → `\$`
Agora `$(mac)` virou `\$(mac)` ✓

Mas um `\$` original já virou `\\$` no passo 1, depois `\\\$` no passo 3... A lógica está complexa.

**SOLUÇÃO MAIS SEGURA**: Usar placeholder antes de escapar:

```typescript
function escapeForSourceBlock(script: string): string {
  // Preservar runtime vars ANTES de escapar
  const preserved = script.replace(/\$\(/g, '@@RUNTIME_VAR@@')
  
  const escaped = preserved
    .replace(/\\/g, '\\\\')   // Escape backslashes
    .replace(/"/g, '\\"')      // Escape quotes
    .replace(/\$/g, '\\$')     // Escape dollar signs (local vars)
  
  // Restaurar runtime vars
  return escaped.replace(/@@RUNTIME_VAR@@/g, '$(')
}
```

## Validação Pós-Deploy

1. Gerar bootstrap v7.1.7
2. Importar no MikroTik
3. Verificar que não há mais "expected end of command"
4. Verificar `/system script print` → navspot-sync, navspot-action-processor com Source preenchido
5. Executar `/system script run navspot-sync`
6. Verificar logs `NAVSPOT-ACTION v7.1.7: Start`
7. Verificar `/ip hotspot user print where name="alexandre.silva"` → usuário criado
