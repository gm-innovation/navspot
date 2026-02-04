# Correção v6.9.41 — Hex Escape `\24` para Variáveis de Runtime

## Problema Identificado (v6.9.40)

O erro **"expected end of command (line 123 column 39)"** ocorria porque:

```routeros
:local urlVars1 "&mac=\$(mac)"
```

O caractere **`\$`** dentro de aspas duplas **não é válido** no RouterOS 6.x durante `/import`.

## Solução Implementada (v6.9.41)

Substituído `\$` por **`\24`** (hex escape para `$`, ASCII 36 = 0x24):

```routeros
# v6.9.41: Hex escape funciona no /import
:local urlVars1 "&mac=\24(mac)"
:local urlVars2 "&ip=\24(ip)"
:local urlVars3 "&link-login-only=\24(link-login-only)"
```

## Mudanças Implementadas

### 1. `replaceRuntimePlaceholders` Atualizada
```typescript
function replaceRuntimePlaceholders(script: string): string {
  const map: Record<string, string> = {
    '@@RUNTIME_MAC@@': '\\24(mac)',       // v6.9.41: hex escape
    '@@RUNTIME_IP@@': '\\24(ip)',
    '@@RUNTIME_LINK_LOGIN_ONLY@@': '\\24(link-login-only)',
  };
  // ...
}
```

### 2. Linter Atualizado
- **Adicionada regra**: Bloqueia `\$(` que não funciona no `/import`
- **Atualizada**: Regras de double-escape e variáveis locais escapadas para padrão `\24`

### 3. Arquivos Modificados
| Arquivo | Mudanças |
|---------|----------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.41, hex escape `\24`, linter bloqueia `\$(` |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.41, mesmas mudanças |
| `ScriptModal.tsx` | scriptVersion 6.9.41 |
| `test/useMikrotikSync.test.ts` | Testes atualizados para padrão `\24` |

## Checklist Final v6.9.41

| # | Verificação | Status |
|---|-------------|--------|
| 1 | Aspas balanceadas | ✅ |
| 2 | Chaves balanceadas | ✅ |
| 3 | Parênteses balanceados | ✅ |
| 4 | Linhas ≤160 chars | ✅ |
| 5 | **Sem `\$(` inválido** | ✅ Linter bloqueia |
| 6 | **Usar `\24(` para $** | ✅ Implementado |
| 7 | Sem placeholders residuais | ✅ |
| 8 | Sem BOM/CRLF | ✅ |
| 9 | Variáveis sem underscore | ✅ |

## Teste Esperado

```routeros
/import navspot-bootstrap-v6.9.41.rsc
# Deve completar SEM erros

/ip hotspot profile print where name="hsprof-navspot"
# Deve mostrar login-url com $(mac), $(ip), $(link-login-only)

# O \24 no script é convertido para $ pelo RouterOS ao executar
```
