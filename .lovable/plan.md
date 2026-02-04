

# Correção v7.1.9: Converter Newlines para `\r\n` em source="..."

## Diagnóstico Confirmado

Os logs mostram:
```
NAVSPOT-SYNC: Arquivo salvo (size=151), acionando action-processor...
NAVSPOT-SYNC: action-processor FALHOU na execucao
```

O script `navspot-action-processor` foi **instalado**, mas **falha ao executar**. Isso indica um erro de **sintaxe no conteúdo do script**, não na instalação.

### Causa Raiz

O código gerado pelo endpoint `action-source` tem este formato:

```routeros
/system script add name="navspot-action-processor" source=":log info \"NAVSPOT-ACTION v7.1.8: Start\"
:global navspotLock
:if (\$navspotLock = \"1\") do={...}
..."
```

**O problema**: RouterOS 6.x não aceita newlines literais dentro de `source="..."` em arquivos `.rsc` importados via `/import`. O parser interpreta cada linha como um comando separado, quebrando a sintaxe.

### Evidência da Documentação MikroTik

O formato correto para strings multi-linha em `.rsc` é usar `\r\n` escapado:

```routeros
script="linha1\r\nlinha2\r\nlinha3"
```

Ou usar chaves `{...}`, mas estas só funcionam no terminal interativo.

## Solução: Substituir Newlines por `\r\n` Escapado

O código precisa converter todas as quebras de linha (`\n`) em `\\r\\n` (escape duplo, pois está dentro de uma string JavaScript que será interpretada pelo RouterOS).

### Mudanças Técnicas

---

### A) `supabase/functions/mikrotik-scripts/index.ts`

#### 1) Modificar `escapeForSourceQuotes()` para incluir conversão de newlines

```typescript
/**
 * Escape script source for embedding in source="..." block
 * RouterOS requires:
 * - Escaping " and $ inside source="" quoted strings
 * - Converting newlines to \r\n for multiline content in .rsc files
 * 
 * v7.1.9: Convert newlines to \r\n for RouterOS 6.x /import compatibility
 */
function escapeForSourceQuotes(script: string): string {
  // Preserve runtime vars $(...) BEFORE escaping
  const preserved = script.replace(/\$\(/g, '@@RUNTIME_VAR@@')
  
  const escaped = preserved
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')      // Escape double quotes
    .replace(/\$/g, '\\$')     // Escape dollar signs (local vars)
    .replace(/\r\n/g, '\\r\\n') // Convert CRLF to escaped \r\n
    .replace(/\n/g, '\\r\\n')   // Convert LF to escaped \r\n
  
  // Restore runtime vars (unescaped)
  return escaped.replace(/@@RUNTIME_VAR@@/g, '$(')
}
```

Essa mudança:
- Converte `\r\n` (CRLF) em `\\r\\n` literal
- Converte `\n` (LF) em `\\r\\n` literal
- O RouterOS interpretará `\r\n` como quebra de linha real quando o script for carregado

#### 2) Bump de versão para v7.1.9

- Alterar `VERSION = "7.1.9"`
- Atualizar docblock

---

### B) Outros Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION para "7.1.9" |
| `src/components/modals/ScriptModal.tsx` | Default scriptVersion="7.1.9" |
| `src/pages/Embarcacoes.tsx` | Fallback currentScriptVersion="7.1.9" |

---

## Exemplo do Resultado Esperado

Antes (v7.1.8 - quebra):
```routeros
source=":log info \"Start\"
:global navspotLock
:if..."
```

Depois (v7.1.9 - funciona):
```routeros
source=":log info \"Start\"\r\n:global navspotLock\r\n:if..."
```

O RouterOS processará `\r\n` como quebras de linha internas ao script.

---

## Validação Pós-Deploy

1. Gerar bootstrap v7.1.9
2. Importar no MikroTik: `/import navspot-bootstrap-v7.1.9.rsc`
3. Verificar instalação sem erros
4. Executar `/system script run navspot-action-processor` manualmente
5. Se funcionar sem erros, executar `/system script run navspot-sync`
6. Verificar logs `NAVSPOT-ACTION v7.1.9: Start` e `NAVSPOT-ACTION v7.1.9: OK`
7. Verificar `/ip hotspot user print where name="alexandre.silva"` → usuário criado

---

## Resumo Técnico

| Antes (v7.1.8) | Depois (v7.1.9) |
|----------------|-----------------|
| Newlines literais em `source="..."` | `\r\n` escapado em `source="..."` |
| Parser RouterOS 6.x falha | Parser processa corretamente |
| Scripts instalados mas não executam | Scripts instalados E executam |

