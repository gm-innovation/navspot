
# Correção v7.1.14: Quebra de Linha para `source="..."` no RouterOS 6.x

## Diagnóstico Confirmado

O script `navspot-action-processor` está marcado como **Invalid (I)** porque o arquivo RSC gerado contém uma única linha gigantesca:

```routeros
/system script add name="navspot-action-processor" policy=read,write,test source="<3000+ chars escapados em uma linha>"
```

O RouterOS 6.x tem limitações no parser de `/import`:
- Limite de ~4096 bytes por linha/comando
- Truncamento silencioso de strings muito longas em source="..."
- O script é salvo incompleto → braces/comandos cortados → **Invalid**

## Solução: Quebra de Linha com Continuação `\`

O RouterOS aceita continuação de linha com `\` no final (dentro das aspas), exatamente como faz o comando `/export`:

```routeros
/system script add name="test" source="linha1\
linha2\
linha3"
```

Isso mantém o valor final do `source` idêntico, mas evita limites do `/import`.

## Implementação Técnica

### 1) Criar helper `wrapSourceWithContinuation()`

Adicionar função em `supabase/functions/mikrotik-scripts/index.ts`:

```typescript
/**
 * Wrap a RouterOS source string with line continuation for long content
 * RouterOS supports \ at end of line (inside quotes) for multi-line strings
 * Max chunk ~120 chars to stay safely under 160 char line limit
 */
function wrapSourceWithContinuation(escapedSource: string, maxChunk = 120): string {
  if (escapedSource.length <= maxChunk) {
    return `"${escapedSource}"`
  }
  
  const chunks: string[] = []
  let remaining = escapedSource
  
  while (remaining.length > 0) {
    let chunkSize = Math.min(maxChunk, remaining.length)
    
    // Don't break on a backslash (would create \\\ at line end)
    while (chunkSize > 1 && remaining[chunkSize - 1] === '\\') {
      chunkSize--
    }
    
    const chunk = remaining.substring(0, chunkSize)
    remaining = remaining.substring(chunkSize)
    chunks.push(chunk)
  }
  
  // Join with \ continuation: "chunk1\
  // chunk2\
  // chunk3"
  if (chunks.length === 1) {
    return `"${chunks[0]}"`
  }
  
  return '"' + chunks.join('\\\n') + '"'
}
```

### 2) Atualizar funções RSC para usar o helper

Modificar `generateSyncRSC()`, `generateActionProcessorRSC()`, e `generateGuardianRSC()`:

```typescript
function generateActionProcessorRSC(): string {
  const source = generateActionProcessorSource()
  const escapedSource = escapeForSourceQuotes(source)
  const wrappedSource = wrapSourceWithContinuation(escapedSource)
  
  return `# NAVSPOT Action Processor v${VERSION} - RSC for /import
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source=${wrappedSource}
:log info "NAVSPOT: Action-processor v${VERSION} instalado"
`
}
```

### 3) Melhorar log de resposta inválida no `navspot-sync`

Atualizar `generateSyncSource()` para incluir diagnóstico:

```routeros
# Antes (linha ~506):
:log warning "NAVSPOT-SYNC: Resposta invalida (sem marcadores [[]])"

# Depois:
:local respPrefix ""
:if ([:len $resp] > 80) do={
  :set respPrefix [:pick $resp 0 80]
} else={
  :set respPrefix $resp
}
:log warning ("NAVSPOT-SYNC: Resposta invalida (prefix=" . $respPrefix . ")")
```

### 4) Padronizar `find where` (baixo risco)

Atualizar comandos críticos para usar `find where name=` em vez de `find name=`:

```routeros
# Antes:
:local fid [/file find name="navspot-actions.txt"]

# Depois:
:local fid [/file find where name="navspot-actions.txt"]
```

### 5) Validação automática no backend

Adicionar verificação após gerar o RSC:

```typescript
function validateRSCLineLength(rsc: string, maxLength = 160): void {
  const lines = rsc.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > maxLength && !lines[i].trim().startsWith('#')) {
      console.warn(`[mikrotik-scripts] Line ${i+1} exceeds ${maxLength} chars: ${lines[i].length}`)
    }
  }
}
```

### 6) Version bump para 7.1.14

Atualizar em todos os arquivos:
- `supabase/functions/mikrotik-scripts/index.ts`: `VERSION = "7.1.14"`
- `supabase/functions/mikrotik-script-generator/index.ts`: `VERSION = "7.1.14"`
- `src/components/modals/ScriptModal.tsx`: `scriptVersion="7.1.14"`
- `src/pages/Embarcacoes.tsx`: `currentScriptVersion="7.1.14"`

## Exemplo de RSC Gerado (v7.1.14)

```routeros
# NAVSPOT Action Processor v7.1.14 - RSC for /import
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
/system script add name="navspot-action-processor" policy=read,write,test source=":log info \"NAVSPOT-ACTION v7.1.14: Start\"\
\\r\\n:global navspotLock\
\\r\\n:if (\$navspotLock = \"1\") do={ :log info \"NAVSPOT-ACTION: lock ativo\"; :return }\
\\r\\n:set navspotLock \"1\"\
... (continua em múltiplas linhas de ~120 chars cada)"
:log info "NAVSPOT: Action-processor v7.1.14 instalado"
```

## Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | + helper `wrapSourceWithContinuation()`, atualizar RSC generators, melhorar log sync, padronizar `find where`, bump 7.1.14 |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION 7.1.14 |
| `src/components/modals/ScriptModal.tsx` | Bump scriptVersion 7.1.14 |
| `src/pages/Embarcacoes.tsx` | Bump currentScriptVersion 7.1.14 |

## Checklist de Testes

1. **Testar helper com strings variadas**:
   - String curta (<120 chars) → sem quebra
   - String longa (3000+ chars) → múltiplas linhas de ~120
   - String com `\` no meio → não quebrar em cima de `\`

2. **Validar RSC antes do deploy**:
   - Nenhuma linha não-comentário >160 chars
   - Estrutura de continuação `\` correta

3. **Testar /import no RouterOS 6.49.x**:
   - `/import navspot-bootstrap-v7.1.14.rsc`
   - `/system script print where name="navspot-action-processor"` → sem flag **I**

4. **Monitorar logs**:
   - `/log print where message~"NAVSPOT-ACTION"`
   - Esperado: `NAVSPOT-ACTION v7.1.14: Start` e `OK`

5. **Testar resposta inválida (diagnóstico)**:
   - Simular erro de rede e verificar se log mostra prefixo da resposta

## Validação no MikroTik

```routeros
# 1. Importar bootstrap
/import navspot-bootstrap-v7.1.14.rsc

# 2. Verificar script válido (sem flag I)
/system script print where name="navspot-action-processor"

# 3. Rodar manualmente
/system script run navspot-action-processor

# 4. Verificar logs
/log print where message~"NAVSPOT-ACTION"
# Esperado: "NAVSPOT-ACTION v7.1.14: Start" + "OK" ou "Nenhuma acao pendente"

# 5. Testar sync completo
/system script run navspot-sync
/log print where message~"NAVSPOT"
```
