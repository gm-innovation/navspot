

# Plano: Correção v6.9.30 — Fix Final do Escape de Variáveis

## Diagnóstico Confirmado

O problema está claro agora. A regra é:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ REGRA DE ESCAPE PARA ROUTEROS 6.x /import                               │
├───────────────────────┬──────────────────┬──────────────────────────────┤
│ Tipo                  │ No TypeScript    │ No .rsc Final                │
├───────────────────────┼──────────────────┼──────────────────────────────┤
│ Variável LOCAL        │ $hsprof          │ $hsprof                      │
│ (lógica do script)    │ (sem escape)     │ (parser reconhece)           │
├───────────────────────┼──────────────────┼──────────────────────────────┤
│ Variável RUNTIME      │ \\$(mac)         │ \$(mac)                      │
│ (expansão do hotspot) │ (escape duplo)   │ (literal para MikroTik)      │
└───────────────────────┴──────────────────┴──────────────────────────────┘
```

---

## Problema Atual (v6.9.29)

### Código TypeScript (linhas 688-689)
```typescript
:if ([:len \\$hsprof] > 0) do={
/ip hotspot profile set \\$hsprof login-url="${loginUrl}"
```

### Arquivo .rsc Gerado (ERRADO)
```routeros
:if ([:len \$hsprof] > 0) do={
/ip hotspot profile set \$hsprof login-url="...&mac=\$(mac)..."
```

O `\$hsprof` quebra o parser do `/import` porque ele não reconhece como variável válida.

### Linter Problemático (linha 49)
```typescript
{ regex: /set \$[a-zA-Z]+ login-url/, desc: '...unescaped variable breaks /import...' }
```

Este linter está **forçando** o padrão errado! Ele bloqueia `set $hsprof` que é o correto.

---

## Correções a Implementar

### 1. Arquivo `mikrotik-recovery-download/index.ts`

**Linha 32 — Versão:**
```typescript
const VERSION = "6.9.30"
```

**Linhas 48-49 — Linter (REMOVER regra incorreta):**
```typescript
// REMOVER ESTA LINHA:
{ regex: /set \$[a-zA-Z]+ login-url/, desc: 'set $var login-url (unescaped variable breaks /import - use \\$var)' },

// MANTER ESTA LINHA (detecta variável DENTRO de string):
{ regex: /login-url="\$/, desc: 'login-url="$... (MikroTik variable in string breaks /import - use escaped \\$)' },
```

**Linhas 683-693 — Bloco do Hotspot Profile:**
```typescript
# 6. HOTSPOT PROFILE - Verificar/corrigir login-url para portal externo v6.9.30
# NOTE: $hsprof is a LOCAL script variable - NO escape needed
# Runtime vars like $(mac) ARE escaped in loginUrl as \\$(mac) -> \$(mac)
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile login-url..."
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
/ip hotspot profile set $hsprof login-url="${loginUrl}"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} else={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
```

**Linha 697 — Atualizar mensagem de fix:**
```typescript
:log info "FIX v6.9.30: Local vars unescaped, runtime vars escaped"
```

### 2. Arquivo `mikrotik-script-generator/index.ts`

Mesmas correções:
- Atualizar versão para 6.9.30
- Remover regra incorreta do linter (linha 49)
- Verificar se há o mesmo padrão no bootstrap (provavelmente não tem, pois usa URL inline)

### 3. Arquivo `ScriptModal.tsx`

Atualizar versão padrão para 6.9.30.

---

## Resultado Esperado no .rsc (v6.9.30)

```routeros
# 6. HOTSPOT PROFILE - Verificar/corrigir login-url para portal externo v6.9.30
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile login-url..."
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
/ip hotspot profile set $hsprof login-url="https://navspot.lovable.app/hotspot-login?h=XXXX&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} else={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
```

Observe:
- `$hsprof` — **sem** escape (variável local do script)
- `\$(mac)` — **com** escape (variável de runtime do hotspot)

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/mikrotik-recovery-download/index.ts` | VERSION, linter, bloco hotspot profile |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION, linter |
| `src/components/modals/ScriptModal.tsx` | Versão padrão |
| `.lovable/plan.md` | Documentar correção |

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.30.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT-RECOVERY"
# Deve mostrar "login-url configurada no hotspot profile"
```

