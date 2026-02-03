
# Plano: Correção v6.9.32b — Fix do Falso Positivo no Linter

## Problema Identificado

O linter está bloqueando o script com um **falso positivo** porque o comentário na linha 693 contém o padrão problemático como documentação:

```routeros
# The problem was: :if ([:len $x] > 0) do={ set ... login-url="...\\$(mac)..." } breaks RouterOS 6.x parser
```

A regex do linter:
```javascript
/:if [^;]*do=\{[^}]*\\\$\(/
```

Está dando match nesse **comentário**, não em código real!

O código real (linhas 695-697) está correto usando `:do { } on-error={}`:
```routeros
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="${loginUrl}" } on-error={
```

---

## Solução: Duas Correções

### 1. Remover o comentário problemático

O comentário que documenta o bug está causando o falso positivo. Vamos simplificá-lo para não incluir o padrão:

**Antes:**
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with find + on-error - avoids complex :if do={} blocks with inline escaped vars
# The problem was: :if ([:len $x] > 0) do={ set ... login-url="...\\$(mac)..." } breaks RouterOS 6.x parser
```

**Depois:**
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with find + on-error - avoids :if do={} blocks with escaped vars
```

### 2. Tornar a regex do linter mais precisa (opcional)

Adicionar uma verificação para ignorar linhas que começam com `#` (comentários). Mas a solução 1 já resolve o problema imediato.

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

**Linhas 691-693 — Remover comentário problemático:**

```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with find + on-error - avoids :if do={} blocks with escaped vars
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
```

---

## Validação

Após a correção, o script deve:

1. **Passar no linter** sem erros
2. **Gerar .rsc válido** com o bloco hotspot profile usando `:do { } on-error={}`
3. **Importar no RouterOS 6.x** sem "expected end of command"

---

## Teste

```routeros
/import navspot-recovery-v6.9.32.rsc
# Deve completar SEM erros

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...
```
