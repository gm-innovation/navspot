
# Implementação v7.0 — Bootstrap Mínimo + Configuração via API

## Resumo Executivo

Esta implementação transforma o sistema MikroTik em um **"thin client"** que recebe sua configuração dinâmica via API de sincronização, eliminando 100% dos erros de parser do RouterOS 6.x.

## Arquitetura da Solução

```text
ANTES (v6.9.x - Problemático)
+--------------------------------------------+
| Bootstrap (~1000 linhas)                   |
| - Infra (bridge, DHCP, NAT)                |
| - Hotspot Profile com login-url complexa   | <- PARSER QUEBRA AQUI
| - Walled Garden com wildcards              | <- PARSER QUEBRA AQUI
| - Scripts embarcados                       |
| - Tudo de uma vez no /import               |
+--------------------------------------------+

DEPOIS (v7.0 - Robusto)
+--------------------------------------------+
| Bootstrap MINIMO (~250 linhas)             |
| - Infra (bridge, DHCP, NAT)                |
| - Hotspot Profile VAZIO (sem login-url)    |
| - Scripts (sync, action-processor)         |
| - Token + Schedulers                       |
+---------------+----------------------------+
                | /import OK (100% limpo)
                v
+--------------------------------------------+
| Primeiro Sync (45s apos import)            |
| - API detecta: initial_config_sent=false   |
| - Injeta: configure_hotspot_profile        |
| - Injeta: add_walled_garden (essenciais)   |
| - Injeta: create_profile (todos perfis)    |
| - Injeta: create_user (todos tripulantes)  |
+---------------+----------------------------+
                | Pipe via resposta JSON
                v
+--------------------------------------------+
| navspot-action-processor (RUNTIME)         |
| - Executa comandos SEM restricoes parser   |
| - /ip hotspot profile set login-url=$url   | <- FUNCIONA!
+--------------------------------------------+
```

## Mudancas Tecnicas

### 1. Migracao SQL (Fase 1)

Adicionar coluna `initial_config_sent` na tabela `hotspots`:

```sql
-- v7.0: Flag para detectar primeiro sync
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS initial_config_sent BOOLEAN DEFAULT false;

COMMENT ON COLUMN hotspots.initial_config_sent IS 
  'v7.0: Flag que indica se a configuracao inicial foi enviada via sync. 
   Quando false, mikrotik-sync injeta configure_hotspot_profile + walled-garden essencial.';
```

### 2. Modificar mikrotik-sync (Fase 2)

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Mudancas:**
- Adicionar leitura da nova coluna `initial_config_sent` na query do hotspot
- Implementar logica de first-sync detection apos validar hotspot
- Injetar acoes iniciais: `configure_hotspot_profile` e walled-garden essencial
- Adicionar novo case `configure_hotspot_profile` no pipe formatter
- Marcar `initial_config_sent = true` apos injetar config

**Logica do first-sync:**
```typescript
// v7.0: Check if this is the first sync (needs initial config)
if (!hotspot.initial_config_sent) {
  console.log('[mikrotik-sync] v7.0: First sync - injecting initial configuration')
  
  // 1. Configure hotspot profile (login-url + dns-name)
  const hotspotSlug = hotspot.nome.toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
  const dnsName = `${hotspotSlug}.navspot.local`
  
  // Inject as FIRST action (use unshift for highest priority)
  formattedActions.unshift({
    id: 'initial-config-profile',
    type: 'configure_hotspot_profile',
    payload: { login_url: loginUrl, dns_name: dnsName }
  })
  
  // 2. Inject essential walled garden domains (explicit, NO wildcards)
  const essentialDomains = [
    'navspot.lovable.app', backendHost, 'connectivitycheck.gstatic.com',
    'clients3.google.com', 'captive.apple.com', 'www.apple.com',
    'msftconnecttest.com', 'www.msftconnecttest.com'
  ]
  
  for (const domain of essentialDomains) {
    formattedActions.push({ id: `initial-wg-${...}`, type: 'add_whitelist_domain', payload: {...} })
  }
  
  // 3. Mark as configured
  await supabase.from('hotspots').update({ initial_config_sent: true }).eq('id', hotspot.id)
}
```

**Novo case no pipe formatter:**
```typescript
case 'configure_hotspot_profile':
  // Format: configure_hotspot_profile|login_url|dns_name
  return `configure_hotspot_profile|${sanitizeForPipe(p.login_url)}|${p.dns_name}`
```

### 3. Adicionar Handler no Action Processor (Fase 3)

**Arquivos:** 
- `supabase/functions/mikrotik-script-generator/index.ts`
- `supabase/functions/mikrotik-recovery-download/index.ts`

Adicionar novo handler no `actionProcessorSource`:

```routeros
# v7.0: configure_hotspot_profile - Configura profile via sync (runtime)
:if ($cmd = "configure_hotspot_profile") do={
  :local p2 [:find $rest "|"]
  :local loginUrl [:pick $rest 0 $p2]
  :local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
  
  :local hsprof [/ip hotspot profile find name="hsprof-navspot"]
  :if ([:len $hsprof] > 0) do={
    :do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
    :do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={}
    :do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
    :do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
    :do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
    :do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
    :log info ("NAVSPOT v7.0: Hotspot profile configurado via sync - " . $dnsName)
  } else={
    :log error "NAVSPOT: Hotspot profile hsprof-navspot NAO ENCONTRADO"
  }
}
```

### 4. Reescrever Bootstrap para Versao Minima (Fase 4)

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

O bootstrap passa a ter **~250 linhas** (vs ~700 atual) com:
- Cleanup inicial mais agressivo (remove instalacoes anteriores)
- Infraestrutura basica (bridge, IPs, DHCP, NAT)
- Hotspot profile **SEM login-url** (apenas nome + gateway)
- Scripts (sync, action-processor, guardian v7.0)
- Token + Schedulers + Netwatch
- Sem RUNTIME_PLACEHOLDERS - nao precisa mais

**Mudanca critica no HOTSPOT:**
```routeros
# v7.0: Hotspot profile MINIMO (sem login-url - sera configurada via sync)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT v7.0: Hotspot criado (aguardando config via sync)"
```

**Guardian v7.0 (verifica login-url):**
```routeros
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local loginUrl ""
:if ([:len $hsprof] > 0) do={
  :set loginUrl [/ip hotspot profile get $hsprof login-url]
}
:if ([:len $loginUrl] < 10) do={
  :log warning "NAVSPOT-GUARDIAN v7.0: Profile incompleto. Forcando sync..."
  /system script run navspot-sync
}
```

### 5. Simplificar Recovery Script (Fase 5)

**Arquivo:** `supabase/functions/mikrotik-recovery-download/index.ts`

- Mesmo padrao minimo do bootstrap
- Recrear scripts (sync, action-processor, guardian)
- Recrear schedulers/netwatch
- **CRITICO:** Setar `initial_config_sent = false` no banco para forcar re-configuracao
- Sem login-url no recovery - sync vai injetar novamente

### 6. Atualizar Frontend (Fase 6)

**Arquivo:** `src/components/modals/ScriptModal.tsx`
- Atualizar `scriptVersion` para 7.0.0

### 7. Atualizar Testes (Fase 7)

**Arquivo:** `test/useMikrotikSync.test.ts`
- Remover testes de `\24(` e `\$(`  - nao sao mais necessarios
- Adicionar testes para:
  - Bootstrap nao contem `login-url=` com `$(mac)`
  - Bootstrap contem profile VAZIO (apenas add com nome)
  - Action processor contem handler `configure_hotspot_profile`

### 8. Atualizar Documentacao (Fase 8)

**Arquivo:** `.lovable/plan.md`
- Documentar arquitetura v7.0

---

## Arquivos a Modificar

| Arquivo | Mudancas |
|---------|----------|
| `supabase/functions/mikrotik-sync/index.ts` | First-sync detection, inject config, novo case no pipe |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.0.0, bootstrap minimo, action-processor com handler |
| `supabase/functions/mikrotik-recovery-download/index.ts` | VERSION 7.0.0, recovery simplificado, reset initial_config_sent |
| `src/components/modals/ScriptModal.tsx` | scriptVersion 7.0.0 |
| `test/useMikrotikSync.test.ts` | Testes para v7.0 |
| `.lovable/plan.md` | Documentar arquitetura v7.0 |
| Migration SQL | Adicionar `initial_config_sent` |

---

## Checklist de Seguranca

| # | Verificacao | Como Garantir |
|---|-------------|---------------|
| 1 | Bootstrap sem `$(` literal | Hotspot profile criado VAZIO |
| 2 | Bootstrap sem wildcards | Walled-garden removido do bootstrap |
| 3 | Bootstrap < 300 linhas | Apenas infra basica |
| 4 | Pipe sem pipe na URL | Funcao `sanitizeForPipe()` |
| 5 | Guardian verifica login-url | Novo guardian v7.0 |
| 6 | DNS antes do sync | Order corrigida no bootstrap |
| 7 | Cleanup inicial | Remove instalacoes anteriores |
| 8 | First-sync injeta config | Flag `initial_config_sent` |
| 9 | Recovery reseta flag | Permite re-configuracao |

---

## Resultado Esperado

```routeros
# v7.0: Import SEMPRE funciona (script limpo e curto)
/import navspot-bootstrap-v7.0.0.rsc
# Completa SEM ERROS

# Apos 45 segundos (primeiro sync)...
/log print where message~"NAVSPOT"
# NAVSPOT v7.0.0: BOOTSTRAP MINIMO CONCLUIDO
# NAVSPOT v7.0.0: Primeiro sync executado!
# NAVSPOT v7.0: Hotspot profile configurado via sync - minha-embarcacao.navspot.local

/ip hotspot profile print where name="hsprof-navspot"
# Mostra login-url com $(mac), $(ip), $(link-login-only)
```

---

## Por que isso e definitivo?

1. **Bootstrap nao tem strings complexas** - Sem `$(`, sem escapes, sem wildcards, sem URLs longas
2. **Configuracao via runtime** - Action-processor nao tem restricoes de parser
3. **Thin client pattern** - MikroTik apenas executa, nao interpreta
4. **Regra de ouro seguida** - Strings dinamicas e longas vem pelo sync
5. **Defesas multiplas** - Guardian detecta profile incompleto e forca re-sync
6. **Recovery robusto** - Reseta flag para forcar re-configuracao completa
