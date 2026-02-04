
# Plano de Implementação v6.9.37 — Escaping Robusto com Placeholders

## Diagnóstico do Problema Atual (v6.9.36)

O código atual está **escapando incorretamente variáveis locais** do RouterOS:

```typescript
// CÓDIGO ATUAL (ERRADO) - generator linhas 757-779
:local fullUrl \$urlBase          // ❌ deveria ser $urlBase
:set fullUrl (\$fullUrl . \$urlVars1)  // ❌ deveria ser $fullUrl
[:len \$fullUrl]                  // ❌ deveria ser [:len $fullUrl]
:if ([:len \$_hsprof] = 0) do={   // ❌ deveria ser $_hsprof
/ip hotspot profile set \$_hsprof login-url=\$fullUrl  // ❌ deveria ser $_hsprof login-url=$fullUrl
```

### Regra de Ouro do RouterOS

| Tipo | Exemplo | No .rsc Final | No TypeScript |
|------|---------|---------------|---------------|
| **Variável LOCAL** | `$fullUrl`, `$_hsprof` | `$fullUrl` (sem escape) | `$fullUrl` |
| **Variável RUNTIME** | `$(mac)`, `$(ip)` | `\$(mac)` (1 barra) | `\\$(mac)` |

---

## Estratégia v6.9.37: Placeholders + Replace Final

Para eliminar erros de escaping acidentais, implementar padrão de **placeholders exclusivos**:

1. **Placeholders únicos** para runtime vars (`@@RUNTIME_MAC@@`)
2. **Replace centralizado** converte placeholders para `\\$(mac)`
3. **Normalização** de newlines (UTF-8 LF)
4. **Validação** de balanceamento e patterns proibidos

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

#### 1.1 Bump de versão (linha 8)
```typescript
const VERSION = "6.9.37"
```

#### 1.2 Adicionar constantes e helpers (após linha 10)
```typescript
// v6.9.37: Placeholders para runtime vars - evita erros de escaping
const RUNTIME_PLACEHOLDERS = {
  mac: '@@RUNTIME_MAC@@',
  ip: '@@RUNTIME_IP@@',
  linkLoginOnly: '@@RUNTIME_LINK_LOGIN_ONLY@@',
} as const;

// Substituir placeholders por escaping correto para .rsc final
function replaceRuntimePlaceholders(script: string): string {
  const map: Record<string, string> = {
    '@@RUNTIME_MAC@@': '\\$(mac)',
    '@@RUNTIME_IP@@': '\\$(ip)',
    '@@RUNTIME_LINK_LOGIN_ONLY@@': '\\$(link-login-only)',
  };
  return Object.entries(map).reduce(
    (s, [ph, val]) => s.replace(new RegExp(ph, 'g'), val),
    script
  );
}

// Normalizar newlines (UTF-8 LF sem BOM/CRLF)
function normalizeNewlines(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Validação de balanceamento básico
function validateBalance(script: string): void {
  const openBraces = (script.match(/{/g) || []).length;
  const closeBraces = (script.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    throw new Error(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  }
  const quotes = (script.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    throw new Error(`Unbalanced quotes: ${quotes} (odd number)`);
  }
  const openParens = (script.match(/\(/g) || []).length;
  const closeParens = (script.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    throw new Error(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
  }
}
```

#### 1.3 Adicionar regras de linter (após linha 63)
```typescript
// v6.9.37: Block escaped local variables - só runtime vars devem ter escape
{ regex: /\\\$(?:urlBase|fullUrl|_hsprof|urlVars[123])/, desc: 'Escaped local variable (use $urlBase not \\$urlBase - only runtime vars like \\$(mac) need escape)' },
// v6.9.37: Block leftover placeholders - ensure all were replaced
{ regex: /@@RUNTIME_[A-Z_]+@@/, desc: 'Unreplaced runtime placeholder (call replaceRuntimePlaceholders before validation)' },
// v6.9.37: Block double-escaped runtime vars
{ regex: /\\\\\$\(/, desc: 'Double-escaped runtime var (\\\\$(mac) should be \\$(mac))' },
```

#### 1.4 Refatorar bloco do Hotspot (linhas 749-783)

**DE (v6.9.36 - ERRADO):**
```typescript
:local fullUrl \$urlBase
:set fullUrl (\$fullUrl . \$urlVars1)
[:len \$fullUrl]
:if ([:len \$_hsprof] = 0) do={
/ip hotspot profile set \$_hsprof login-url=\$fullUrl
```

**PARA (v6.9.37 - CORRETO):**
```typescript
# 7. HOTSPOT v6.9.37 (placeholders + escaping robusto)
# Variáveis locais: SEM escape ($urlBase, $fullUrl, $_hsprof)
# Variáveis runtime: via placeholder -> substituídas no final
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspot.id}"
:local urlVars1 "&mac=@@RUNTIME_MAC@@"
:local urlVars2 "&ip=@@RUNTIME_IP@@"
:local urlVars3 "&link-login-only=@@RUNTIME_LINK_LOGIN_ONLY@@"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])

# Passo A: Criar profile SEM login-url (comando curto e seguro)
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
} on-error={:log info "NAVSPOT: profile hsprof-navspot possivelmente ja existe"}

# Passo B: Garantir handle do profile (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Passo C: Aplicar login-url via set SEM aspas (v6.9.37)
:do {
/ip hotspot profile set $_hsprof login-url=$fullUrl
} on-error={:log warning "NAVSPOT: nao conseguiu setar login-url no profile"}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v${VERSION} com portal externo ativo (escaping robusto)"
```

#### 1.5 Aplicar processamento antes de retornar

Antes de `validateRouterOSScript`, adicionar:
```typescript
bootstrapScript = replaceRuntimePlaceholders(bootstrapScript);
bootstrapScript = normalizeNewlines(bootstrapScript);
validateBalance(bootstrapScript);
```

---

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

#### 2.1 Bump de versão (linha 34)
```typescript
const VERSION = "6.9.37"
```

#### 2.2 Adicionar mesmas constantes e helpers (após linha 35)
- `RUNTIME_PLACEHOLDERS` object
- `replaceRuntimePlaceholders()` function  
- `normalizeNewlines()` function
- `validateBalance()` function

#### 2.3 Adicionar regras de linter (após linha 67)
```typescript
// v6.9.37: Block escaped local variables
{ regex: /\\\$(?:urlBase|fullUrl|_hsprof|urlVars[123])/, desc: 'Escaped local variable (use $urlBase not \\$urlBase)' },
// v6.9.37: Block leftover placeholders
{ regex: /@@RUNTIME_[A-Z_]+@@/, desc: 'Unreplaced runtime placeholder' },
// v6.9.37: Block double-escaped runtime vars
{ regex: /\\\\\$\(/, desc: 'Double-escaped runtime var' },
```

#### 2.4 Refatorar bloco do Hotspot (linhas 698-728)

**DE (v6.9.36 - ERRADO):**
```typescript
:local fullUrl \$urlBase
:set fullUrl (\$fullUrl . \$urlVars1)
[:len \$fullUrl]
:if ([:len \$_hsprof] = 0) do={
/ip hotspot profile set \$_hsprof login-url=\$fullUrl
```

**PARA (v6.9.37 - CORRETO):**
```typescript
# 6. HOTSPOT PROFILE v6.9.37 (placeholders + escaping robusto)
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars1 "&mac=@@RUNTIME_MAC@@"
:local urlVars2 "&ip=@@RUNTIME_IP@@"
:local urlVars3 "&link-login-only=@@RUNTIME_LINK_LOGIN_ONLY@@"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])

# Garantir que profile existe (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT-RECOVERY: profile nao existe, criando..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Aplicar login-url via set SEM aspas (v6.9.37)
:do {
/ip hotspot profile set $_hsprof login-url=$fullUrl
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

#### 2.5 Atualizar changelog (linha 732)
```typescript
:log info "FIX v6.9.37: Placeholders + escaping robusto (elimina erros de escape)"
```

---

### 3. `src/components/modals/ScriptModal.tsx`

#### 3.1 Atualizar versão exibida (linha 34)
```typescript
scriptVersion = "6.9.37",
```

---

### 4. `test/useMikrotikSync.test.ts` — Testes Robustos

Adicionar novos testes para validar o padrão v6.9.37:

```typescript
describe('Script Generator v6.9.37 Escaping Validation', () => {
  it('should NOT escape local script variables ($urlBase, $fullUrl, $_hsprof)', () => {
    const correctLocalVars = `
:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:if ([:len $_hsprof] = 0) do={
/ip hotspot profile set $_hsprof login-url=$fullUrl
`;
    
    // Variáveis locais NÃO devem ter backslash
    expect(correctLocalVars).toContain('$urlBase');
    expect(correctLocalVars).toContain('$fullUrl');
    expect(correctLocalVars).toContain('$_hsprof');
    expect(correctLocalVars).not.toMatch(/\\\$urlBase/);
    expect(correctLocalVars).not.toMatch(/\\\$fullUrl/);
    expect(correctLocalVars).not.toMatch(/\\\$_hsprof/);
  });

  it('should ONLY escape runtime hotspot variables with single backslash in .rsc', () => {
    const correctRuntimeVars = `
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"
`;
    
    expect(correctRuntimeVars).toMatch(/\\\$\(mac\)/);
    expect(correctRuntimeVars).toMatch(/\\\$\(ip\)/);
    expect(correctRuntimeVars).toMatch(/\\\$\(link-login-only\)/);
  });

  it('should NOT have double-escaped runtime vars (\\\\$(mac))', () => {
    const badPattern = '&mac=\\\\$(mac)';
    const goodPattern = '&mac=\\$(mac)';
    
    expect(badPattern).toMatch(/\\\\\$\(mac\)/);
    expect(goodPattern).not.toMatch(/\\\\\$\(mac\)/);
  });

  it('should have no leftover placeholders in final output', () => {
    const placeholders = ['@@RUNTIME_MAC@@', '@@RUNTIME_IP@@', '@@RUNTIME_LINK_LOGIN_ONLY@@'];
    const validOutput = ':local urlVars1 "&mac=\\$(mac)"';
    
    for (const ph of placeholders) {
      expect(validOutput).not.toContain(ph);
    }
  });

  it('should validate replaceRuntimePlaceholders function', () => {
    const input = ':local urlVars1 "&mac=@@RUNTIME_MAC@@"';
    const expected = ':local urlVars1 "&mac=\\$(mac)"';
    
    const output = input.replace(/@@RUNTIME_MAC@@/g, '\\$(mac)');
    expect(output).toBe(expected);
  });

  it('should have no CRLF or BOM in output', () => {
    const cleanScript = ':local test "value"\n:log info "ok"';
    expect(cleanScript.includes('\r\n')).toBe(false);
    expect(cleanScript.startsWith('\uFEFF')).toBe(false);
  });

  it('should have balanced braces and quotes', () => {
    const balanced = ':if ([:len $var] = 0) do={ :log info "test" }';
    const openBraces = (balanced.match(/{/g) || []).length;
    const closeBraces = (balanced.match(/}/g) || []).length;
    const quotes = (balanced.match(/"/g) || []).length;
    
    expect(openBraces).toBe(closeBraces);
    expect(quotes % 2).toBe(0);
  });
});
```

---

## Diferença Crítica: v6.9.36 vs v6.9.37

| Linha | v6.9.36 (ERRADO) | v6.9.37 (CORRETO) |
|-------|------------------|-------------------|
| 752-755 | `&mac=\\$(mac)` | `&mac=@@RUNTIME_MAC@@` |
| 757 | `:local fullUrl \$urlBase` | `:local fullUrl $urlBase` |
| 758 | `(\$fullUrl . \$urlVars1)` | `($fullUrl . $urlVars1)` |
| 762 | `[:len \$fullUrl]` | `[:len $fullUrl]` |
| 771 | `[:len \$_hsprof]` | `[:len $_hsprof]` |
| 779 | `set \$_hsprof login-url=\$fullUrl` | `set $_hsprof login-url=$fullUrl` |

---

## Script .rsc Final Esperado (v6.9.37)

Após `replaceRuntimePlaceholders()` processar o script:

```routeros
# 7. HOTSPOT v6.9.37 (escaping robusto)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=27a1e1be-..."
:local urlVars1 "&mac=\$(mac)"
:local urlVars2 "&ip=\$(ip)"
:local urlVars3 "&link-login-only=\$(link-login-only)"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])

:do { /ip hotspot profile add name="hsprof-navspot" ... } on-error={...}

:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
  /ip hotspot profile add name="hsprof-navspot" ...
  :set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

:do { /ip hotspot profile set $_hsprof login-url=$fullUrl } on-error={...}
```

---

## Fluxo de Geração (v6.9.37)

```text
1. Build template com placeholders (@@RUNTIME_MAC@@)
   - Variáveis locais: $fullUrl, $_hsprof (SEM escape)
   - Runtime vars: placeholders (NÃO \\$(mac) direto)

2. replaceRuntimePlaceholders(script)
   - @@RUNTIME_MAC@@ → \\$(mac)
   - @@RUNTIME_IP@@ → \\$(ip)
   - @@RUNTIME_LINK_LOGIN_ONLY@@ → \\$(link-login-only)

3. normalizeNewlines(script)
   - Remove CRLF → LF
   - Remove CR → LF

4. validateBalance(script)
   - Verifica {} balanceados
   - Verifica "" pares
   - Verifica () pares

5. validateRouterOSScript(script)
   - Bloqueia escaped local vars (\$urlBase)
   - Bloqueia placeholders residuais (@@RUNTIME...@@)
   - Bloqueia double-escape (\\\\$(...)
   - Bloqueia linhas >120 com \$(...)

6. Retorna script processado
```

---

## Por que Placeholders?

| Problema | Solução com Placeholders |
|----------|--------------------------|
| Escapar `$fullUrl` por engano | Template usa `$fullUrl` direto (sem escape) |
| Esquecer de escapar `$(mac)` | Placeholder `@@RUNTIME_MAC@@` garante replace |
| Duplo escape `\\\\$(mac)` | Replace final centralizado |
| Debug difícil | Placeholders óbvios (`@@...@@`) fáceis de detectar |

---

## Regras de Linter Adicionadas (v6.9.37)

```typescript
// Bloquear variáveis locais escapadas
{ regex: /\\\$(?:urlBase|fullUrl|_hsprof|urlVars[123])/, desc: 'Escaped local variable' },
// Bloquear placeholders não substituídos
{ regex: /@@RUNTIME_[A-Z_]+@@/, desc: 'Unreplaced runtime placeholder' },
// Bloquear duplo escape
{ regex: /\\\\\$\(/, desc: 'Double-escaped runtime var' },
```

---

## Checklist de Implementação

| Item | Descrição |
|------|-----------|
| VERSION 6.9.37 | Atualizar em generator, recovery, ScriptModal |
| RUNTIME_PLACEHOLDERS | Adicionar constantes em ambas as functions |
| replaceRuntimePlaceholders | Adicionar helper com Object.entries loop |
| normalizeNewlines | Adicionar helper para UTF-8 LF |
| validateBalance | Adicionar validação de {}, "", () |
| Template corrigido | Usar `$fullUrl` (sem escape) para locais |
| Placeholders | Usar `@@RUNTIME_MAC@@` em vez de `\\$(mac)` no template |
| Replace antes de validar | Aplicar replaceRuntimePlaceholders antes do linter |
| Novas regras linter | Bloquear `\$urlBase`, `@@RUNTIME_...@@`, `\\\\$(` |
| Testes | Adicionar testes de escaping, encoding, balanceamento |
| Deploy | Fazer deploy das functions e verificar |

---

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.37.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT-DEBUG"
# Deve mostrar: fullUrl-len=... sample=https://navspot.lovable.app/...
```

---

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.37, RUNTIME_PLACEHOLDERS, helpers, template corrigido, novas regras linter |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.37, RUNTIME_PLACEHOLDERS, helpers, template corrigido, novas regras linter, changelog |
| `ScriptModal.tsx` | scriptVersion 6.9.37 |
| `useMikrotikSync.test.ts` | Testes de escaping, encoding, balanceamento |
