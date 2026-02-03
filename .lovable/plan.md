
# Plano: Correção v6.9.32 — Fix do Bloco Hotspot Profile

## Problema Identificado

O erro `expected end of command (line 639 column 33)` acontece no bloco do Hotspot Profile:

```routeros
:if ([:len $hsprof] > 0) do={ /ip hotspot profile set $hsprof login-url="https://navspot.lovable.app/hotspot-login?h=27a1e1be-4ba7-4496-adb1-9227d3a80ad1&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" :log info "..." } else={ ... }
```

O problema tem **duas causas**:

1. **Bloco em linha única**: O `do={ ... }` inteiro está compactado numa linha, e o parser do RouterOS 6.x tem problemas com comandos complexos dentro de blocos inline
2. **Escape `\$` dentro de bloco inline**: O `\$(mac)` dentro de uma string, dentro de um comando, dentro de um bloco `do={}` numa única linha confunde o parser

---

## Solução: Comandos Diretos + URL Variável Local

### Estratégia

Em vez de usar `:if ([:len $hsprof] > 0) do={ ... }`, vamos:

1. Mover a URL para uma variável local antes do if
2. Usar o padrão **remove+add** idempotente (igual ao Walled Garden) com `on-error={}`
3. Evitar blocos `do={}` complexos

### Código Corrigido

```routeros
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with on-error - avoids complex do={} blocks
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" } on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url configurada"
```

**Vantagens:**
- Sem variável intermediária `$hsprof`
- Sem bloco `do={}` complexo com comandos dentro
- O `on-error={}` captura o caso onde o profile não existe
- Pattern consistente com o resto do script (remove+add / set+on-error)

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

**Linhas 688-698 — Bloco do Hotspot Profile:**

Substituir:
```typescript
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile login-url..."
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
/ip hotspot profile set $hsprof login-url="${loginUrl}"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} else={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
```

Por:
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
# Using direct set with find + on-error - avoids complex do={} blocks with inline variables
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="${loginUrl}" } on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

**Linha 34 — Versão:**
```typescript
const VERSION = "6.9.32"
```

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

Verificar se o bootstrap tem o mesmo problema (provavelmente não, pois no bootstrap o profile é criado e a URL já é definida inline).

Atualizar versão para 6.9.32.

### 3. `src/components/modals/ScriptModal.tsx`

Atualizar `scriptVersion` para 6.9.32.

---

## Linter — Adicionar Regra

Adicionar detecção de blocos `do={ ... }` com escape `\$` dentro:

```typescript
{ regex: /do=\{[^}]*\\$\(/, desc: 'do={...\\$(...} (escaped var inside do block breaks parser - use on-error pattern)' },
```

---

## Script .rsc Final Esperado (v6.9.32)

```routeros
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.32
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="https://navspot.lovable.app/hotspot-login?h=27a1e1be-4ba7-4496-adb1-9227d3a80ad1&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" } on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

**Nota:** O `\$(mac)` está dentro de uma string, dentro de um comando direto, envolvido apenas pelo `:do { } on-error={}`. Isso é diferente de ter dentro de um `do={}` de um `:if`.

---

## Alternativa Mais Segura (se ainda quebrar)

Se o pattern acima ainda causar erro, podemos usar uma abordagem ainda mais conservadora:

```routeros
# Remove e recria o profile (garantido idempotente)
:do { /ip hotspot profile remove [find name="hsprof-navspot"] } on-error={}
/ip hotspot profile add name="hsprof-navspot" login-url="https://..." html-directory=hotspot ...
```

Mas isso requer saber todos os parâmetros do profile. A opção `:do { set } on-error={}` é mais cirúrgica.

---

## Resumo de Mudanças

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-recovery-download/index.ts` | Linha 34: VERSION = "6.9.32", Linhas 688-698: Novo bloco hotspot profile, Linter: Nova regra |
| `mikrotik-script-generator/index.ts` | Linha 8: VERSION = "6.9.32" |
| `ScriptModal.tsx` | Linha 32: scriptVersion = "6.9.32" |

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.32.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT-RECOVERY"
# Deve mostrar: "login-url verificada"
```
