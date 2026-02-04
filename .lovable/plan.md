

# Correção v6.9.41 — Escape `\$()` Inválido em Strings

## Problema Identificado

O erro **"expected end of command (line 123 column 39)"** ocorre porque:

```routeros
:local urlVars1 "&mac=\$(mac)"
```

O caractere **`\$`** dentro de aspas duplas **não é válido** no RouterOS 6.x durante `/import`. A coluna 39 aponta exatamente para o `(` após `\$`, indicando que o parser não reconhece esse escape.

### Por que funciona em alguns contextos mas não em `/import`?
- No terminal interativo, certos escapes funcionam
- Durante `/import` de arquivo `.rsc`, o parser é mais restritivo
- O `\$` não é um escape válido em strings; RouterOS espera `\n`, `\t`, `\r`, `\"`, etc.

---

## Solução: Construir a URL Sem Escape Inválido

### Abordagem A: Concatenação Pura (RECOMENDADA)

Em vez de colocar `\$(mac)` dentro de uma string, concatenamos as partes:

```routeros
# ANTES (quebra):
:local urlVars1 "&mac=\$(mac)"

# DEPOIS (funciona):
:local dSign "\$"
:local urlVars1 ("&mac=" . $dSign . "(mac)")
```

Assim, o `$` literal é armazenado em uma variável e concatenado, evitando qualquer problema de escape.

### Abordagem B: Usar `\24` (hex escape para $)

RouterOS aceita escapes hexadecimais `\XX`:
```routeros
:local urlVars1 "&mac=\24(mac)"
```

O `\24` é o código ASCII para `$` (36 decimal = 24 hexadecimal).

---

## Plano de Implementação v6.9.41

### Arquivo 1: `supabase/functions/mikrotik-script-generator/index.ts`

**Mudanças no template bootstrap (linhas 825-840):**

```routeros
# DE:
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"
:local urlVars2 "&ip=${RUNTIME_PLACEHOLDERS.ip}"
:local urlVars3 "&link-login-only=${RUNTIME_PLACEHOLDERS.linkLoginOnly}"

# PARA (usando placeholder para $):
:local dSign "\$"
:local urlVars1 ("&mac=" . $dSign . "(mac)")
:local urlVars2 ("&ip=" . $dSign . "(ip)")
:local urlVars3 ("&link-login-only=" . $dSign . "(link-login-only)")
```

**OU usando hex escape (mais limpo):**

```routeros
:local urlVars1 "&mac=\24(mac)"
:local urlVars2 "&ip=\24(ip)"
:local urlVars3 "&link-login-only=\24(link-login-only)"
```

**Mudança na função `replaceRuntimePlaceholders`:**
- Alterar para gerar `\24(...)` em vez de `\$(...)`

```typescript
// DE:
'@@RUNTIME_MAC@@': '\\$(mac)',

// PARA (hex escape):
'@@RUNTIME_MAC@@': '\\24(mac)',
```

**OU remover placeholders e usar a abordagem de concatenação diretamente no template:**

```typescript
// No template, usar:
:local dSign "\\$"
:local urlVars1 ("&mac=" . $dSign . "(mac)")
```

**Bump VERSION para 6.9.41**

### Arquivo 2: `supabase/functions/mikrotik-recovery-download/index.ts`

Mesmas mudanças:
- Linhas 761-763: atualizar urlVars
- Função `replaceRuntimePlaceholders`: usar `\24` ou remover
- VERSION para 6.9.41

### Arquivo 3: `src/components/modals/ScriptModal.tsx`

- scriptVersion para 6.9.41

### Arquivo 4: `test/useMikrotikSync.test.ts`

- Atualizar testes para refletir novo padrão de escape

---

## Código Final Corrigido (Abordagem Hex Escape)

```routeros
# 7. HOTSPOT v6.9.41 (hex escape para $ runtime vars)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotIdSafe}"
:local urlVars1 "&mac=\24(mac)"
:local urlVars2 "&ip=\24(ip)"
:local urlVars3 "&link-login-only=\24(link-login-only)"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl])

# Profile add + sets...
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do { /ip hotspot profile set $hsprof login-url=$fullUrl } on-error={}
```

---

## Função replaceRuntimePlaceholders Atualizada

```typescript
function replaceRuntimePlaceholders(script: string): string {
  const map: Record<string, string> = {
    // v6.9.41: Use hex escape \24 for $ (RouterOS compatible in /import)
    '@@RUNTIME_MAC@@': '\\24(mac)',
    '@@RUNTIME_IP@@': '\\24(ip)',
    '@@RUNTIME_LINK_LOGIN_ONLY@@': '\\24(link-login-only)',
  };
  return Object.entries(map).reduce(
    (s, [ph, val]) => s.replace(new RegExp(ph, 'g'), val),
    script
  );
}
```

---

## Atualização do Linter

Adicionar regra para bloquear `\$(` que não funciona:

```typescript
// v6.9.41: Block \$( which doesn't work in /import - use \24( instead
{ regex: /\\\$\(/, desc: '\\$( is invalid in RouterOS /import (use \\24( hex escape for $)' },
```

E atualizar a regra existente:
```typescript
// DE:
{ regex: /\\\$(?:urlBase|fullUrl|hsprof|urlVars[123])/, desc: 'Escaped local variable...' },

// PARA (mais específico):
{ regex: /\\\$(?:urlBase|fullUrl|hsprof|urlVars[123]|dSign)/, desc: 'Escaped local variable (use $urlBase not \\$urlBase)' },
```

---

## Testes Atualizados

```typescript
it('should use hex escape \\24 for runtime vars (v6.9.41)', () => {
  const hexPattern = ':local urlVars1 "&mac=\\24(mac)"';
  
  // Deve conter \24( e não \$(
  expect(hexPattern).toContain('\\24(mac)');
  expect(hexPattern).not.toContain('\\$(mac)');
});

it('should NOT have \\$( in output (v6.9.41)', () => {
  const badPattern = ':local urlVars1 "&mac=\\$(mac)"';
  const goodPattern = ':local urlVars1 "&mac=\\24(mac)"';
  
  // Bad: \$( doesn't work in /import
  expect(badPattern).toMatch(/\\\$\(/);
  
  // Good: \24( works
  expect(goodPattern).not.toMatch(/\\\$\(/);
  expect(goodPattern).toMatch(/\\24\(/);
});
```

---

## Checklist de Validação

| # | Verificação | Status |
|---|-------------|--------|
| 1 | Aspas balanceadas | ✅ Será validado |
| 2 | Chaves balanceadas | ✅ Será validado |
| 3 | Parênteses balanceados | ✅ Será validado |
| 4 | Linhas ≤160 chars | ✅ Linter existe |
| 5 | **Sem `\$(` inválido** | ⚠️ **CORRIGIR** |
| 6 | Usar `\24(` para $ | ⚠️ **IMPLEMENTAR** |
| 7 | Sem placeholders residuais | ✅ Linter bloqueia |
| 8 | Sem BOM/CRLF | ✅ normalizeNewlines |
| 9 | Variáveis sem underscore | ✅ Corrigido v6.9.40 |

---

## Resultado Esperado

```routeros
/import navspot-bootstrap-v6.9.41.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# Deve mostrar login-url com $(mac), $(ip), $(link-login-only)

# O \24 no script é convertido para $ pelo RouterOS ao executar
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.41, replaceRuntimePlaceholders usa `\24`, linter bloqueia `\$(` |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.41, mesmas mudanças |
| `ScriptModal.tsx` | scriptVersion 6.9.41 |
| `test/useMikrotikSync.test.ts` | Testes para `\24(` pattern |
| `.lovable/plan.md` | Documentar correção v6.9.41 |

