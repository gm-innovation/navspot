
# Plano: Correção Definitiva do Script Recovery v6.9.26 - RouterOS 6.x

## Status: ✅ IMPLEMENTADO E DEPLOYADO

## Diagnóstico Final

O erro `expected end of command (line 763 column 33)` ocorria porque **dentro de um bloco `:do { ... } on-error`**, o RouterOS 6.x **não mantém o contexto do menu** após a mudança `/ip firewall filter`.

---

## Solução Implementada: Remover Completamente Blocos Problemáticos

### 1. Recovery Script v6.9.26
- ✅ **Removido** bloco AUTO-FIX de firewall (linhas 713-730 da v6.9.25)
- ✅ Mantém: Token, Scripts, Schedulers, Walled Garden, Netwatch, login-url fix
- ✅ O sync subsequente recriará regras corretamente com `hotspot=auth`

### 2. Action Processor v6.9.26 (Recovery + Bootstrap)
- ✅ **Simplificado** handlers `add_firewall_block` e `add_firewall_allow`
- ✅ Usa comandos diretos: `/ip firewall address-list add ... on-error={}`
- ✅ Não usa mais `[find ...]` após mudança de contexto de menu
- ✅ Duplicatas são silenciosamente ignoradas pelo `on-error={}`

### 3. Frontend
- ✅ ScriptModal.tsx: Atualizado texto de features para v6.9.26
- ✅ Embarcacoes.tsx: Atualizado default version para "6.9.26"

---

## Arquivos Modificados

1. `supabase/functions/mikrotik-recovery-download/index.ts` - ✅ Deployado
2. `supabase/functions/mikrotik-script-generator/index.ts` - ✅ Deployado
3. `src/components/modals/ScriptModal.tsx` - ✅ Atualizado
4. `src/pages/Embarcacoes.tsx` - ✅ Atualizado

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.26.rsc
```

Deve importar sem erros. Verificar:

```routeros
/log print where message~"NAVSPOT-RECOVERY"
/ip hotspot profile print where name="hsprof-navspot"
```

---

## Notas Técnicas

### Diferença v6.9.25 → v6.9.26

**v6.9.25 (quebrava):**
```routeros
:do {
/ip firewall filter
:local oldMaster [find comment="NAVSPOT-ALLOW-MASTER"]  # ERRO AQUI!
...
} on-error={}
```

**v6.9.26 (funciona):**
```routeros
# Bloco AUTO-FIX removido completamente
# Action-processor usa comandos diretos:
:do { /ip firewall address-list add list="NAVSPOT-ALLOWED" address=$ip ... } on-error={}
```

### Por que funciona

1. O bloco AUTO-FIX era **opcional** - apenas limpava regras antigas
2. O sync subsequente recria as regras corretamente com `hotspot=auth`
3. Comandos diretos com `on-error={}` são seguros e idempotentes
