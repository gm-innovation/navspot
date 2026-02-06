

# Plano v7.1.46: State Reconciliation - Confirmacao via Telemetria

## Resumo Executivo

Transicionar de "configuracao baseada em esperanca" para um modelo de reconciliacao de estado onde o backend so marca sucesso apos confirmar a telemetria do roteador.

---

## Problema Raiz Identificado

Nas linhas 1069-1073 do `mikrotik-sync/index.ts`:

```typescript
// PROBLEMA: Marca como aplicado ANTES do roteador executar
await supabase
  .from('hotspots')
  .update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
  .eq('id', hotspot.id)
```

Isso significa que mesmo que o action-processor falhe ou o bootstrap recrie o profile com CHAP, o backend considera "tudo ok" e nao reinjeta a correcao.

---

## Solucao em 4 Partes

### PARTE 1: Telemetria no navspot-sync (roteador envia estado atual)

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`
**Funcao:** `generateSyncSource()` (linha 730)

Adicionar coleta de `hotspot_login_by` e `hotspot_login_url` no payload JSON:

```text
Antes do :local b ("{"...), adicionar:
# Coletar estado do profile (v7.1.46 telemetria)
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:local hlb ""
:local hlu ""
:if ([:len $hp]>0) do={
:set hlb [/ip hotspot profile get $hp login-by]
:set hlu [/ip hotspot profile get $hp login-url]
}

E no JSON body, adicionar os campos:
,"hotspot_login_by":<$q>.$hlb.$q
,"hotspot_login_url":<$q>.$hlu.$q
```

Tamanho estimado: +200 bytes (sync continua abaixo de 3.2KB)

---

### PARTE 2: State Reconciliation no backend

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

#### 2.1 Adicionar interface para payload (linha ~77)

```typescript
interface SyncPayload {
  // ... campos existentes ...
  hotspot_login_by?: string    // v7.1.46: Telemetria
  hotspot_login_url?: string   // v7.1.46: Telemetria
}
```

#### 2.2 Reescrever logica de rollout (linhas 1050-1076)

```text
ANTES:
1. Se versao != REQUIRED → injeta acao
2. Atualiza versao imediatamente (sem verificar execucao)

DEPOIS:
1. Analisar telemetria do roteador (hotspot_login_by, hotspot_login_url)
2. needsPortalRepair = true se:
   - hotspot_login_by contem "http-chap" OU nao contem "http-pap"
   - hotspot_login_url esta vazia ou muito curta (<10 chars)
3. Se needsPortalRepair:
   - Injetar configure_hotspot_profile no topo (unshift)
   - NAO atualizar portal_profile_version (manter pendente)
   - Se estava com REQUIRED, resetar para NULL
4. Se NAO precisa reparo:
   - Atualizar portal_profile_version = REQUIRED_PORTAL_VERSION
```

**Codigo proposto (substituir linhas 1050-1076):**

```typescript
// v7.1.46: State Reconciliation - use telemetry to confirm configuration
const hotspotLoginBy = (payload as any).hotspot_login_by || ''
const hotspotLoginUrl = (payload as any).hotspot_login_url || ''

console.log(`[mikrotik-sync] v7.1.46: Telemetry - login_by="${hotspotLoginBy}", login_url="${hotspotLoginUrl.slice(0, 50)}..."`)

// Determine if portal needs repair based on actual state
const hasChap = hotspotLoginBy.includes('http-chap')
const hasPap = hotspotLoginBy.includes('http-pap')
const hasValidUrl = hotspotLoginUrl.length >= 10

// v7.1.46: Repair needed if CHAP present, PAP missing, or URL missing
const needsPortalRepair = hasChap || !hasPap || !hasValidUrl

if (needsPortalRepair) {
  console.log(`[mikrotik-sync] v7.1.46: Portal repair needed - hasChap=${hasChap}, hasPap=${hasPap}, hasValidUrl=${hasValidUrl}`)
  
  // Inject configure_hotspot_profile at TOP of actions
  const hotspotSlug = hotspot.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
  const dnsName = `${hotspotSlug}.navspot.local`
  
  formattedActions.unshift({
    id: 'rollout-config-profile',
    type: 'configure_hotspot_profile',
    payload: { login_url: loginUrl, dns_name: dnsName }
  })
  
  // v7.1.46: Do NOT update portal_profile_version - wait for confirmation
  // If it was already marked, reset to force recheck next sync
  const currentVersion = (hotspot as any).portal_profile_version
  if (currentVersion === REQUIRED_PORTAL_VERSION) {
    await supabase
      .from('hotspots')
      .update({ portal_profile_version: null })
      .eq('id', hotspot.id)
    console.log(`[mikrotik-sync] v7.1.46: Reset portal_profile_version to null (awaiting telemetry confirmation)`)
  }
  
  console.log(`[mikrotik-sync] v7.1.46: Injected configure_hotspot_profile for ${hotspot.nome}`)
} else {
  // v7.1.46: Configuration confirmed via telemetry - mark as complete
  const currentVersion = (hotspot as any).portal_profile_version
  if (currentVersion !== REQUIRED_PORTAL_VERSION) {
    await supabase
      .from('hotspots')
      .update({ portal_profile_version: REQUIRED_PORTAL_VERSION })
      .eq('id', hotspot.id)
    console.log(`[mikrotik-sync] v7.1.46: Portal configuration confirmed via telemetry - marked as ${REQUIRED_PORTAL_VERSION}`)
  }
}
```

---

### PARTE 3: Freio de Emergencia no Recovery

**Arquivo:** `supabase/functions/mikrotik-recovery-download/index.ts`

Adicionar correcao de login-by apos importar scripts (antes do sync):

```text
Apos a linha "# 3. EXECUTAR SYNC PARA RECEBER CONFIGURACAO", adicionar:

# 2.5. CORRIGIR LOGIN-BY IMEDIATAMENTE (v7.1.46 freio de emergencia)
:log info "NAVSPOT-RECOVERY v${VERSION}: Aplicando login-by=cookie,http-pap..."
:local hp ""
:local hs [/ip hotspot find name="hs-navspot"]
:if ([:len $hs]>0) do={:set hp [/ip hotspot profile find name=[/ip hotspot get $hs profile]]}
:if ([:len $hp]=0) do={:set hp [/ip hotspot profile find name="hsprof-navspot"]}
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-by="cookie,http-pap"
:log info ("NAVSPOT-RECOVERY: login-by corrigido em ".[/ip hotspot profile get $hp name])
}
```

Bump VERSION para `7.1.46`.

---

### PARTE 4: Bootstrap "Nasce Certo"

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Adicionar login-by apos criar o profile (linha 449):

```text
Apos a linha /ip hotspot profile add..., adicionar:
/ip hotspot profile set [find name="hsprof-navspot"] login-by="cookie,http-pap"
:log info "NAVSPOT v${VERSION}: login-by=cookie,http-pap aplicado"
```

Bump VERSION para `7.1.46`.

---

## Arquivos Modificados (Resumo)

| Arquivo | Mudanca Principal |
|---------|-------------------|
| `mikrotik-scripts/index.ts` | Telemetria (hlb, hlu) no sync + VERSION 7.1.46 |
| `mikrotik-sync/index.ts` | State reconciliation + VERSION 7.1.46 |
| `mikrotik-recovery-download/index.ts` | Freio de emergencia login-by + VERSION 7.1.46 |
| `mikrotik-script-generator/index.ts` | Bootstrap com login-by + VERSION 7.1.46 |
| `src/pages/Embarcacoes.tsx` | VERSION 7.1.46 |
| Nova migration | Reset portal_profile_version |

---

## Migration Automatica

```sql
-- v7.1.46: Reset portal_profile_version to force telemetry check
UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;
```

---

## Fluxo Apos Deploy

```text
1. Migration reseta portal_profile_version = NULL

2. MikroTik faz sync:
   - Envia hotspot_login_by="cookie,http-chap" (problema atual)
   - Backend detecta: hasChap=true, hasPap=false
   - needsPortalRepair = true
   - Injeta configure_hotspot_profile
   - NAO marca versao (espera confirmacao)

3. Action-processor executa:
   - /ip hotspot profile set ... login-by="cookie,http-pap"
   - Log: "NAVSPOT: login-by=cookie,http-pap aplicado"

4. Proximo sync:
   - Envia hotspot_login_by="cookie,http-pap" (corrigido!)
   - Backend detecta: hasChap=false, hasPap=true, hasValidUrl=true
   - needsPortalRepair = false
   - Marca portal_profile_version = 7.1.46-http-pap

5. Syncs subsequentes:
   - Telemetria OK → nao reinjeta (estavel)
   - Se alguem reinstalar bootstrap → telemetria muda → reinjeta (auto-heal)
```

---

## Verificacao pos-Deploy

| Teste | Comando/Acao | Resultado Esperado |
|-------|--------------|-------------------|
| Telemetria | Verificar logs backend | `login_by="cookie,http-pap"` |
| State check | Query hotspots | `portal_profile_version = 7.1.46-http-pap` |
| Profile | `/ip hotspot profile print detail` | `login-by: cookie,http-pap` |
| Login | Conectar WiFi | Autenticacao OK |

---

## Por que esta solucao e definitiva?

1. **Telemetria real:** Backend ve o estado ATUAL do roteador, nao assume
2. **Reconciliacao automatica:** Qualquer drift (reinstall, reset) e detectado e corrigido
3. **Freios de emergencia:** Recovery e Bootstrap ja aplicam login-by correto
4. **Idempotente:** Multiplos syncs com mesmo estado nao geram acoes duplicadas

---

## Tamanho dos Scripts (Verificacao de Limite)

| Script | Atual | Novo | Limite |
|--------|-------|------|--------|
| sync-raw | ~2.8KB | ~3.0KB | 3.2KB |
| action-processor | ~2.9KB | ~2.9KB | 3.2KB |
| recovery | ~1.5KB | ~1.7KB | N/A |
| bootstrap | ~4.5KB | ~4.6KB | N/A |

Todos dentro dos limites seguros.

