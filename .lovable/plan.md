
# Plano: Correção v6.9.33 — Padrão "Duas Etapas" para Hotspot Profile

## Problema Identificado

A linha 694 do recovery script gera:

```routeros
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="...&mac=\$(mac)&ip=\$(ip)..." } on-error={}
```

**Causa do erro:** O parser do RouterOS 6.x falha quando:
1. `[find ...]` está inline dentro de um comando
2. Variáveis runtime escapadas `\$(...)` estão na mesma linha/bloco

**Solução:** Separar em **duas etapas**:
1. Atribuir resultado de `[find ...]` a uma variável local
2. Usar essa variável no comando que contém `\$(...)` dentro de um `:do { } on-error={}`

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

#### Linha 34 — Bump de versão:
```typescript
const VERSION = "6.9.33"
```

#### Linhas 691-697 — Bloco do Hotspot Profile (padrão duas etapas):

**Antes:**
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with find + on-error - avoids :if do={} blocks with escaped vars
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="${loginUrl}" } on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

**Depois (padrão duas etapas):**
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.33
# Two-step pattern: assign [find] to local var, then set with escaped vars in separate :do block
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] > 0) do={ :set _hsprof_id $_hsprof }
:do {
:if ([:len $_hsprof_id] > 0) do={
/ip hotspot profile set $_hsprof_id login-url="${loginUrl}"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
}
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

#### Linha 57 — Nova regra de linter (detecta `[find ...]` + `\$(...)` no mesmo bloco):

```typescript
// v6.9.33: Block [find ...] + \$(...) inside same :do block - use two-step pattern
{ regex: /:do\s*\{\s*[^}]*\[find[^\]]*\][^}]*\\\$\([^\)]*\)[^}]*\}/, desc: '[find ...] + \\$(...) in same :do block (breaks RouterOS 6.x - use two-step pattern: assign find to local, then set)' },
```

#### Linha 701 — Atualizar changelog:
```typescript
:log info "FIX v6.9.33: Hotspot profile set uses two-step pattern (find -> local -> set)"
```

---

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

#### Linha 8 — Bump de versão:
```typescript
const VERSION = "6.9.33"
```

#### Linha 53 — Nova regra de linter (mesma que no recovery):
```typescript
// v6.9.33: Block [find ...] + \$(...) inside same :do block
{ regex: /:do\s*\{\s*[^}]*\[find[^\]]*\][^}]*\\\$\([^\)]*\)[^}]*\}/, desc: '[find ...] + \\$(...) in same :do block (breaks RouterOS 6.x - use two-step pattern)' },
```

---

### 3. `src/components/modals/ScriptModal.tsx`

#### Atualizar versão exibida:
```typescript
const scriptVersion = "6.9.33";
```

---

## Script .rsc Final Esperado (v6.9.33)

```routeros
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.33
# Two-step pattern: assign [find] to local var, then set with escaped vars in separate :do block
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] > 0) do={ :set _hsprof_id $_hsprof }
:do {
:if ([:len $_hsprof_id] > 0) do={
/ip hotspot profile set $_hsprof_id login-url="https://navspot.lovable.app/hotspot-login?h=27a1e1be-4ba7-4496-adb1-9227d3a80ad1&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
}
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

**Por que funciona:**
- `:local _hsprof [/ip hotspot profile find ...]` — executa o `find` fora de qualquer bloco condicional
- `:if ([:len $_hsprof] > 0) do={ :set _hsprof_id $_hsprof }` — verifica se encontrou, sem `\$(...)` dentro do `do={}`
- `:do { :if ... /ip hotspot profile set $_hsprof_id login-url="...\$(mac)..." } on-error={}` — o `\$(...)` está dentro do `:do { }` mas **sem `[find ...]` inline**

---

## Regras de Linter Atualizadas (v6.9.33)

```typescript
const forbiddenPatterns = [
  { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets in conditional)' },
  { regex: /comment~"/, desc: 'comment~ (must use comment= for exact match)' },
  { regex: /dst-host="\*\.apple\.com"/, desc: '*.apple.com (breaks RouterOS 6.x parser during /import)' },
  { regex: /dst-host="\*\.supabase\.(co|in)"/, desc: '*.supabase.* wildcard (breaks RouterOS 6.x parser - use explicit hostname)' },
  { regex: /login-url="\$[a-zA-Z]/, desc: 'login-url="$var... (MikroTik variable in string breaks /import - use escaped \\$)' },
  // v6.9.32: Block :if ... do={} with escaped vars
  { regex: /:if [^;]*do=\{[^}]*\\\$\(/, desc: ':if...do={...\\$(...} (escaped var inside if-do block breaks RouterOS 6.x)' },
  // v6.9.33: Block [find ...] + \$(...) inside same :do block
  { regex: /:do\s*\{\s*[^}]*\[find[^\]]*\][^}]*\\\$\([^\)]*\)[^}]*\}/, desc: '[find ...] + \\$(...) in same :do block (use two-step pattern)' },
]
```

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.33.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT-RECOVERY"
# Deve mostrar: "login-url configurada no hotspot profile"
```

---

## Resumo de Mudanças

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.33, bloco hotspot profile duas etapas, nova regra linter |
| `mikrotik-script-generator/index.ts` | VERSION 6.9.33, nova regra linter |
| `ScriptModal.tsx` | scriptVersion 6.9.33 |

---

## Detalhes Técnicos

### Padrão Problemático (EVITAR)
```routeros
:do { /ip hotspot profile set [find name="..."] login-url="...\$(mac)..." } on-error={}
```
Combina `[find ...]` inline + `\$(...)` no mesmo bloco → quebra parser.

### Padrão Seguro (USAR)
```routeros
:local _hsprof [/ip hotspot profile find name="..."]
:if ([:len $_hsprof] > 0) do={ :set _hsprof_id $_hsprof }
:do {
  :if ([:len $_hsprof_id] > 0) do={
    /ip hotspot profile set $_hsprof_id login-url="...\$(mac)..."
  }
} on-error={}
```
Separa `[find ...]` → variável local → comando com `\$(...)` em contexto diferente.
