
# Plano: Correção v6.9.33 — Padrão "Duas Etapas" para Hotspot Profile

## ✅ IMPLEMENTADO

### Problema Identificado

A linha 694 do recovery script gerava:

```routeros
:do { /ip hotspot profile set [find name="hsprof-navspot"] login-url="...&mac=\$(mac)&ip=\$(ip)..." } on-error={}
```

**Causa do erro:** O parser do RouterOS 6.x falha quando:
1. `[find ...]` está inline dentro de um comando
2. Variáveis runtime escapadas `\$(...)` estão na mesma linha/bloco

**Solução aplicada:** Separar em **duas etapas**:
1. Atribuir resultado de `[find ...]` a uma variável local
2. Usar essa variável no comando que contém `\$(...)` dentro de um `:do { } on-error={}`

---

## Arquivos Modificados

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`
- ✅ VERSION atualizada para "6.9.33"
- ✅ Nova regra de linter para bloquear `[find ...]` + `\$(...)` no mesmo `:do` block
- ✅ Bloco hotspot profile refatorado para padrão duas etapas

### 2. `supabase/functions/mikrotik-script-generator/index.ts`
- ✅ VERSION atualizada para "6.9.33"
- ✅ Nova regra de linter para bloquear `[find ...]` + `\$(...)` no mesmo `:do` block

### 3. `src/components/modals/ScriptModal.tsx`
- ✅ scriptVersion atualizada para "6.9.33"

---

## Script .rsc Final (v6.9.33)

```routeros
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.33
# Two-step pattern: assign [find] to local var, then set with escaped vars in separate :do block
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] > 0) do={ :global _hsprof_id $_hsprof }
:do {
:if ([:len $_hsprof_id] > 0) do={
/ip hotspot profile set $_hsprof_id login-url="https://navspot.lovable.app/hotspot-login?h=...&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
}
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
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
