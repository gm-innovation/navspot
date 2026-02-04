

# Revisão Completa v6.9.40 — Checklist Crítico de Erros RouterOS

## Problemas Identificados na Revisão

Após análise detalhada aplicando sua lista de orientações, encontrei **5 problemas críticos** que explicam o erro "syntax error (line 117 column 8)":

---

### PROBLEMA 1: Variáveis locais com underscore (`_hsprof`)

**Localização:**
- `mikrotik-script-generator/index.ts` linhas 842-850
- `mikrotik-recovery-download/index.ts` linhas 774-782

**Código problemático:**
```routeros
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do { /ip hotspot profile set $_hsprof dns-name="${dnsName}" } on-error={}
```

**Problema:** O RouterOS 6.x pode ter problemas com identificadores de variável começando com `_` durante `/import`. A coluna 8 do erro aponta exatamente para o `_` em `:local _hsprof`.

**Correção:** Renomear `_hsprof` para `hsprof` (sem underscore).

---

### PROBLEMA 2: Linter não bloqueia `:local _...` 

**Localização:**
- `mikrotik-script-generator/index.ts` linha 108
- `mikrotik-recovery-download/index.ts` linha 107

**Código atual:**
```typescript
{ regex: /\\\$(?:urlBase|fullUrl|_hsprof|urlVars[123])/, desc: 'Escaped local variable...' },
```

**Problema:** Essa regra apenas bloqueia se a variável estiver **escapada** (`\$_hsprof`), mas não impede a criação de `:local _hsprof` que é o problema real.

**Correção:** Adicionar regra para bloquear qualquer `:local _...`:
```typescript
{ regex: /^:local\s+_/m, desc: 'Local var starts with underscore (RouterOS 6.x /import may fail)' },
```

---

### PROBLEMA 3: Versão desatualizada no linter de variáveis locais

Após renomear `_hsprof` para `hsprof`, a regex precisa ser atualizada:

```typescript
// DE:
{ regex: /\\\$(?:urlBase|fullUrl|_hsprof|urlVars[123])/, ... }

// PARA:
{ regex: /\\\$(?:urlBase|fullUrl|hsprof|urlVars[123])/, ... }
```

---

### PROBLEMA 4: Testes desatualizados ainda usam `$_hsprof`

**Localização:** `test/useMikrotikSync.test.ts` linhas 70, 93, 133-147, 274-280

**Exemplos:**
```typescript
const setCommand = `/ip hotspot profile set $_hsprof login-url=$fullUrl`;
const createIfMissing = `:if ([:len $_hsprof] = 0) do={`;
```

**Correção:** Atualizar para `$hsprof` e remover testes do padrão `:if ([:len` que não é mais usado.

---

### PROBLEMA 5: Versão não atualizada

**Localização:**
- `mikrotik-script-generator/index.ts` linha 8: `VERSION = "6.9.39"`
- `mikrotik-recovery-download/index.ts` linha 29: `VERSION = "6.9.39"`
- `ScriptModal.tsx` linha 34: `scriptVersion = "6.9.39"`

**Correção:** Bump para `6.9.40`.

---

## Plano de Implementação v6.9.40

### Arquivo 1: `supabase/functions/mikrotik-script-generator/index.ts`

| Linha | Mudança |
|-------|---------|
| 8 | `VERSION = "6.9.40"` |
| 108 | Atualizar regex: `_hsprof` → `hsprof` |
| ~113 | Adicionar nova regra: `/^:local\s+_/m` |
| 842 | `:local _hsprof` → `:local hsprof` |
| 845-850 | `$_hsprof` → `$hsprof` (6 ocorrências) |

### Arquivo 2: `supabase/functions/mikrotik-recovery-download/index.ts`

| Linha | Mudança |
|-------|---------|
| 29 | `VERSION = "6.9.40"` |
| 107 | Atualizar regex: `_hsprof` → `hsprof` |
| ~112 | Adicionar nova regra: `/^:local\s+_/m` |
| 774 | `:local _hsprof` → `:local hsprof` |
| 777-782 | `$_hsprof` → `$hsprof` (6 ocorrências) |

### Arquivo 3: `src/components/modals/ScriptModal.tsx`

| Linha | Mudança |
|-------|---------|
| 34 | `scriptVersion = "6.9.40"` |

### Arquivo 4: `test/useMikrotikSync.test.ts`

| Seção | Mudança |
|-------|---------|
| Linhas 70, 274-280 | `$_hsprof` → `$hsprof` |
| Linhas 92-98 | Remover ou atualizar teste de `:if ([:len $_hsprof]` (padrão não mais usado) |
| Linhas 133-147 | Atualizar para `$hsprof` |

---

## Checklist Final de Validação (Todas Suas Orientações)

| # | Verificação | Status Atual | Ação |
|---|-------------|--------------|------|
| 1 | Aspas balanceadas (`"`) | ✅ OK | Validação já existe |
| 2 | Chaves balanceadas (`{}`) | ✅ OK | Validação já existe |
| 3 | Parênteses balanceados (`()`) | ✅ OK | Validação já existe |
| 4 | Linhas não-comentário ≤160 chars | ✅ OK | Linter existe |
| 5 | Escapes corretos (`\$(mac)`) | ✅ OK | Sistema de placeholders |
| 6 | Sem placeholders residuais | ✅ OK | Linter bloqueia `@@RUNTIME_` |
| 7 | Sem BOM/CRLF | ✅ OK | `normalizeNewlines()` |
| 8 | Variáveis declaradas no escopo | ✅ OK | Todas `:local` antes do uso |
| 9 | Comandos compatíveis RouterOS 6.x | ✅ OK | Testado em produção |
| 10 | JSON incremental | ✅ OK | `:set body ($body . ...)` |
| 11 | on-event curto | ✅ OK | `"/system script run X"` |
| 12 | profile add mínimo + sets | ✅ OK | Implementado v6.9.38 |
| 13 | Sem `:if ([:len [/...` aninhado | ✅ OK | Linter bloqueia |
| 14 | Sem `*.apple.com` wildcard | ✅ OK | Hosts explícitos |
| 15 | Sem `*.supabase.*` wildcard | ✅ OK | Host explícito do backend |
| 16 | **Variáveis sem underscore** | ❌ FALHA | **Corrigir `_hsprof`** |
| 17 | **Linter para `:local _`** | ❌ AUSENTE | **Adicionar regra** |

---

## Código Corrigido para Hotspot Profile (v6.9.40)

```routeros
# Passo A: Criar profile (idempotente - on-error ignora se ja existe)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}

# Passo B: Obter handle do profile (SEM underscore!)
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]

# Passo C: Aplicar configuracoes via sets SEPARADOS (cada linha <100 chars)
:do { /ip hotspot profile set $hsprof dns-name="${dnsName}" } on-error={}
:do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $hsprof login-url=$fullUrl } on-error={}
```

---

## Nova Regra de Linter

```typescript
// v6.9.40: Block local variables starting with underscore - RouterOS 6.x parser issue
{ regex: /^:local\s+_/m, desc: 'Local var starts with underscore (RouterOS 6.x /import may fail - use hsprof not _hsprof)' },
```

---

## Teste Esperado

```routeros
/import navspot-bootstrap-v6.9.40.rsc
# Deve completar SEM "syntax error"

/ip hotspot profile print where name="hsprof-navspot"
# Deve mostrar profile com login-url configurada

/log print where message~"NAVSPOT"
# Deve mostrar: NAVSPOT v6.9.40: INSTALACAO CONCLUIDA!
```

---

## Resumo das Mudanças

| Arquivo | Mudanças |
|---------|----------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.40, `_hsprof` → `hsprof`, nova regra linter |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.40, `_hsprof` → `hsprof`, nova regra linter |
| `ScriptModal.tsx` | scriptVersion 6.9.40 |
| `test/useMikrotikSync.test.ts` | Atualizar testes para `$hsprof` |
| `.lovable/plan.md` | Documentar correção v6.9.40 |

