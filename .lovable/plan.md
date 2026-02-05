
# Plano v7.1.29: Correção Completa da Sincronização MikroTik

## Diagnóstico Confirmado

Baseado na análise do código atual e nos logs do usuário:

1. **Validação de escrita incompleta**: O check `[:find $pf "# NAME"]<0` não detecta todos os headers do `/file print` — alguns começam com `# feb/...` ou outros padrões
2. **`reconcileUsers()` aborta em roteador vazio**: Linhas 333-337 retornam imediatamente quando `registeredUsersCsv` é vazio, impedindo criação de usuários em instalação limpa
3. **`initial_config_sent=true` bloqueia reaplicação do portal**: Após reinstalar bootstrap no roteador, o backend não injeta `configure_hotspot_profile` novamente
4. **Handlers do walled-garden não estão no CORE**: Os handlers `create_whitelist_domain`/`add_whitelist_domain` estão apenas no AUX (não instalado automaticamente)
5. **`create_user` não é idempotente**: Se o usuário já existe, o handler não atualiza senha/perfil

---

## Mudanças v7.1.29

### A) `generateSyncSource()` - Validação mais robusta

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts` (linhas 641-716)

Mudanças na validação de escrita:
```routeros
# ANTES (v7.1.28):
:if (([:len $sv]>12)&&([:find $pf "# NAME"]<0)) do={:set wok true}

# DEPOIS (v7.1.29):
:local fc ""
:if ([:len $sv]>0) do={:set fc [:pick $sv 0 1]}
# Rejeitar se: primeiro char é "#" OU len < 12 OU não contém "|"
:if (([:len $sv]>=12)&&($fc!="#")&&([:find $sv "|"]>=0)) do={:set wok true}
```

Lógica:
- **Primeiro char = `#`**: Qualquer header de `/file print` começa com `#`
- **Len >= 12**: Conteúdo mínimo para uma action válida (ex: `create_user|`)
- **Contém `|`**: Toda action válida tem formato `cmd|params;`
- **Lock cleanup robusto**: Adicionar `:return` após log de erro para garantir saída limpa

### B) `generateActionProcessorCoreSource()` - Handlers idempotentes + walled-garden

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts` (linhas 727-822)

1. **`create_user` idempotente** (linhas 793-818):
```routeros
# ANTES: só cria se não existe
:if ([:len $ex]=0) do={...add...}

# DEPOIS: cria ou atualiza
:if ([:len $ex]>0) do={
  # usuário existe -> atualizar password e profile
  :if ([:len $pw]>0) do={:do {/ip hotspot user set $ex password=$pw} on-error={}}
  :if (([:len $pf]>0)&&($pf!="default")) do={:do {/ip hotspot user set $ex profile=$pf} on-error={}}
  :set cnt ($cnt+1)
} else={
  # usuário não existe -> criar
  :if ([:len $pw]>0) do={
    :do {/ip hotspot user add name=$un password=$pw profile=$pf comment="navspot"} on-error={}
    :set cnt ($cnt+1)
  }
}
```

2. **`create_profile` atualizável** (linhas 765-791):
```routeros
# ANTES: pula se existe
:if ([:len $ex]=0) do={...add...}

# DEPOIS: cria ou atualiza
:if ([:len $ex]>0) do={
  # profile existe -> atualizar rate-limit e shared-users
  :if ([:len $rt]>0) do={:do {/ip hotspot user profile set $ex rate-limit=$rt} on-error={}}
  :do {/ip hotspot user profile set $ex shared-users=$sh} on-error={}
  :set cnt ($cnt+1)
} else={
  # profile não existe -> criar
  ...add...
}
```

3. **Adicionar handler `add_whitelist_domain` no CORE** (novo handler):
```routeros
:if (($c="create_whitelist_domain")||($c="add_whitelist_domain")) do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local dh ("*".$dom."*")
:local wg [/ip hotspot walled-garden find dst-host~$dom]
:if ([:len $wg]=0) do={
:do {/ip hotspot walled-garden add dst-host=$dh action=allow comment="navspot"} on-error={}
:set cnt ($cnt+1)
}}} on-error={}
}
```

### C) `reconcileUsers()` - Não abortar em roteador vazio

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts` (linhas 325-337)

```typescript
// ANTES (v7.1.28):
if (!registeredUsersCsv || registeredUsersCsv.trim().length === 0) {
  console.warn(`[mikrotik-sync] v6.9.8: WARNING - MikroTik not sending...`)
  return  // <-- PROBLEMA: aborta em roteador limpo
}

// DEPOIS (v7.1.29):
// Diferenciar "campo ausente" (script antigo) vs "lista vazia" (roteador limpo)
if (registeredUsersCsv === undefined || registeredUsersCsv === null) {
  // Script antigo que não envia o campo - pular reconciliação
  console.warn(`[mikrotik-sync] v7.1.29: WARNING - MikroTik not sending registeredUsersCsv field`)
  return
}
// Se chegou aqui com string vazia, significa roteador limpo - CONTINUAR
console.log(`[mikrotik-sync] v7.1.29: MikroTik has ${registeredUsersCsv.trim().length === 0 ? '0' : 'some'} registered users`)
```

### D) Autorreparo do portal - Independente de `initial_config_sent`

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts` (após linha 980)

Adicionar lógica para reaplicar portal quando detectar que não está configurado:

```typescript
// v7.1.29: Auto-repair portal config
// Inject configure_hotspot_profile if not in first-sync AND no pending config action
const hasPendingPortalConfig = formattedActions.some(a => a.type === 'configure_hotspot_profile')

if (!hasPendingPortalConfig && hotspot.initial_config_sent) {
  // Check if there are any pending users without portal - they can't login
  // Always reinject portal config to ensure it's applied after router reset
  const hasUserActions = formattedActions.some(a => 
    a.type === 'create_user' || a.type === 'add_user_profile'
  )
  
  if (hasUserActions) {
    const portalHost = 'navspot.lovable.app'
    const hotspotSlug = hotspot.nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    const loginUrl = escapeRouterOSPlaceholders(
      `https://${portalHost}/hotspot-login?hotspot_id=${hotspot.id}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
    )
    const dnsName = `${hotspotSlug}.navspot.local`
    
    // Inject at the beginning (before profiles and users)
    formattedActions.unshift({
      id: 'repair-config-profile',
      type: 'configure_hotspot_profile',
      payload: { login_url: loginUrl, dns_name: dnsName }
    })
    
    // Also ensure essential walled garden
    formattedActions.unshift({
      id: 'repair-wg-portal',
      type: 'add_whitelist_domain',
      payload: { domain: portalHost }
    })
    
    console.log(`[mikrotik-sync] v7.1.29: Injected portal repair config with user actions`)
  }
}
```

### E) Version bump + Guardrail de tamanho

**Arquivos a atualizar:**
1. `supabase/functions/mikrotik-scripts/index.ts` - `VERSION = "7.1.29"`
2. `supabase/functions/mikrotik-sync/index.ts` - `VERSION = "7.1.29"`
3. `supabase/functions/mikrotik-script-generator/index.ts` - `VERSION = "7.1.29"`
4. `src/components/modals/ScriptModal.tsx` - `scriptVersion = "7.1.29"`
5. `src/pages/Embarcacoes.tsx` - `currentScriptVersion = "7.1.29"`

**Guardrail no gerador** (após gerar sync-raw):
```typescript
const syncSource = generateSyncSource(syncUrl, syncToken)
if (syncSource.length > 3200) {
  console.error(`[mikrotik-scripts] CRITICAL: sync-raw exceeds 3200 bytes: ${syncSource.length}`)
  // Log but don't fail - admin needs to compact
}
```

---

## Tamanho Estimado

| Script | v7.1.28 | v7.1.29 | Limite |
|--------|---------|---------|--------|
| sync-raw | ~2.0 KB | ~2.1 KB | < 3.2 KB |
| action-raw | ~2.5 KB | ~2.8 KB | < 3.2 KB |

O aumento no action-raw é devido ao handler de walled-garden e à lógica idempotente.

---

## Verificação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.29.rsc

# 1. Verificar logs do sync - NÃO deve ter "write try=X" nem "write failed"
/log print where message~"NAVSPOT-SYNC" last=50
# Esperado: "AP OK"

# 2. Verificar portal configurado
/ip hotspot profile print where name="hsprof-navspot"
# Esperado: login-url contendo navspot.lovable.app

# 3. Verificar walled-garden essencial
/ip hotspot walled-garden print where comment~"navspot"
# Esperado: entradas para navspot.lovable.app, backend, captive checks

# 4. Verificar perfis criados
/ip hotspot user profile print
# Esperado: perfis da empresa (ex: tripulacao-padrao)

# 5. Verificar usuários criados
/ip hotspot user print where comment="navspot"
# Esperado: usuários dos tripulantes

# 6. Teste E2E
# Conectar dispositivo -> abrir site -> deve redirecionar para portal navspot -> login funciona
```

---

## Checklist de Implementação

- [ ] Atualizar validação de escrita em `generateSyncSource()` (primeiro char != `#`, len >= 12, contém `|`)
- [ ] Adicionar `:return` após log de erro de escrita para garantir saída limpa
- [ ] Tornar `create_user` idempotente no action-processor CORE
- [ ] Tornar `create_profile` atualizável no action-processor CORE
- [ ] Adicionar handler `add_whitelist_domain` no CORE (mover do AUX)
- [ ] Corrigir `reconcileUsers()` para diferenciar "campo ausente" vs "lista vazia"
- [ ] Adicionar lógica de autorreparo do portal quando houver user actions
- [ ] Bump VERSION para 7.1.29 em todos os arquivos
- [ ] Adicionar log de guardrail se sync-raw > 3200 bytes
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x

---

## Riscos Mitigados

| Proteção | Status v7.1.29 |
|----------|----------------|
| Header detection (qualquer `#`) | ✓ Corrigido |
| Pipe check (`\|` obrigatório) | ✓ Adicionado |
| Lock cleanup em todos os paths | ✓ Garantido |
| Roteador vazio suportado | ✓ Corrigido |
| Portal reaplicado após reset | ✓ Implementado |
| Walled-garden no CORE | ✓ Movido |
| Tamanho < 3.2KB | ✓ Monitorado |
