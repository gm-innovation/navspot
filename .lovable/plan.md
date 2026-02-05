

# Correção v7.1.17: Fix Escape de Sequências RouterOS

## Problema Identificado

### Localização Exata
**Linha 430** de `mikrotik-scripts/index.ts`:
```typescript
:local q "\\22"
```

### Fluxo do Problema
1. No TypeScript, `"\\22"` representa a string literal `\22`
2. `escapeForFileContents()` atual faz: `\22` → `\\22`
3. O RSC gerado contém: `contents="...:local q \"\\\\22\"..."`
4. RouterOS interpreta `\\22` como backslash literal + "22" (errado!)
5. Deveria ser `\22` (código ASCII para aspas duplas)

## Solução em Duas Partes

### Parte 1: Corrigir uso de `\\22` em generateSyncSource

**Antes (linha 430)**:
```typescript
:local q "\\22"
```

**Depois**:
```typescript
:local q "\""
```

O `escapeForFileContents()` vai converter `"` para `\"`, e o RouterOS interpreta corretamente como a variável `q` contendo uma aspas duplas.

### Parte 2: Implementar escapeForFileContents() Robusto

Substituir a função atual (linhas 53-58) por versão que preserva sequências RouterOS:

```typescript
/**
 * v7.1.17: Escape script source for /file set contents="..."
 * 
 * CRITICAL: Preserve RouterOS escape sequences like \22 (quote), \5C (backslash), \n, \r, \t
 * Pattern: preserve → escape → restore
 */
function escapeForFileContents(script: string): string {
  // Map placeholder -> original
  const preserved = new Map<string, string>()
  let counter = 0
  
  // Helper to create unique placeholder
  const makePlaceholder = () => `__PRESERVED_${Date.now().toString(36)}_${counter++}__`
  
  // 1) Preserve hex escapes like \22, \5C and common escapes \n \r \t
  let result = script.replace(/\\([0-9A-Fa-f]{2}|[nrt])/g, (m) => {
    const ph = makePlaceholder()
    preserved.set(ph, m)
    return ph
  })
  
  // 2) Now escape remaining backslashes, quotes and $ safely
  result = result.replace(/\\/g, '\\\\')   // Escape backslashes first
  result = result.replace(/"/g, '\\"')      // Then quotes
  result = result.replace(/\$/g, '\\$')     // Then $ for variable expansion
  
  // 3) Restore preserved sequences (they contain backslash+char that should remain as-is)
  preserved.forEach((orig, ph) => {
    result = result.replace(ph, orig)
  })
  
  return result
}
```

## Mudanças Técnicas

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

| Linhas | Mudança |
|--------|---------|
| 34 | Bump VERSION para "7.1.17" |
| 43-58 | Atualizar docstring e implementar `escapeForFileContents()` robusto com pattern preserve→escape→restore |
| 430 | Trocar `:local q "\\22"` para `:local q "\""` (literal quote) |

### Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`

| Mudança |
|---------|
| Bump VERSION para "7.1.17" |

### Arquivo: `src/components/modals/ScriptModal.tsx`

| Mudança |
|---------|
| Bump scriptVersion para "7.1.17" |

### Arquivo: `src/pages/Embarcacoes.tsx`

| Mudança |
|---------|
| Bump currentScriptVersion para "7.1.17" |

## Exemplo de Transformação

### Antes (v7.1.16)
```
Input TypeScript: :local q "\\22"
Após escapeForFileContents: :local q \"\\\\22\"
RouterOS interpreta: q = backslash + "22" (ERRADO!)
```

### Depois (v7.1.17)
```
Input TypeScript: :local q "\""
Após escapeForFileContents: :local q \"\\\"\"
RouterOS interpreta: q = " (CORRETO!)
```

## Validação no MikroTik

```routeros
# 1. Importar bootstrap v7.1.17
/import navspot-bootstrap-v7.1.17.rsc

# 2. Verificar scripts válidos (SEM flag I)
/system script print where name~"navspot"

# 3. Inspecionar primeiros 200 chars do source (debug)
:local src [/system script get navspot-sync source]
:put [:pick $src 0 200]

# 4. Rodar sync manualmente
/system script run navspot-sync

# 5. Verificar logs
/log print where message~"NAVSPOT-SYNC"
# Esperado: "NAVSPOT-SYNC v7.1.17: OK" sem erros de sintaxe

# 6. Aguardar scheduler (2-5 min) e verificar status Online no frontend
```

## Checklist de Testes

- [ ] Bump VERSION para 7.1.17 em todos os arquivos
- [ ] Substituir `\\22` por `"` em generateSyncSource (linha 430)
- [ ] Implementar `escapeForFileContents()` robusto com preservação de sequências
- [ ] Deploy edge functions
- [ ] Testar /import no RouterOS 6.49.x
- [ ] Confirmar scripts sem flag **I**
- [ ] Rodar sync e verificar logs sem erros de sintaxe
- [ ] Verificar hotspot aparece Online no frontend

