

# Fix v7.1.60: Quebrar o Loop de Reparo + Telemetria Confiavel

## Problema

O backend injeta `configure_hotspot_profile` a cada ciclo de sync porque a telemetria do roteador (v7.1.58) falha silenciosamente, enviando `login_by=""` e `login_url=""`. A logica atual (linha 1106) interpreta isso como "config quebrada" e reinjeta o reparo infinitamente, bloqueando outras acoes (create_profile, create_user).

## Solucao em 3 partes

### 1. Funcao `telemetryIsReliable` (nova, no topo do arquivo)

```typescript
function telemetryIsReliable(loginBy: string | null, loginUrl: string | null): boolean {
  if (!loginBy || loginBy.trim() === '') return false
  if (!loginUrl || loginUrl.trim() === '') return false
  const lb = loginBy.trim().toLowerCase()
  if (lb === 'cookie') return false
  if (lb.includes('http-pap') || lb.includes('http-chap') || lb.includes(',')) return true
  return false
}
```

### 2. Migracao: adicionar coluna `telemetry_failures` na tabela `hotspots`

```sql
ALTER TABLE public.hotspots 
  ADD COLUMN IF NOT EXISTS telemetry_failures integer NOT NULL DEFAULT 0;
```

Coluna simples. Sem flag booleana separada -- o contador serve como flag (>= 3 = unreliable).

### 3. Logica de reparo com contador + threshold (linhas 1094-1147)

Substituir o bloco atual por:

```typescript
// v7.1.60: State Reconciliation with telemetry reliability check
const hotspotLoginBy = (payload as any).hotspot_login_by || ''
const hotspotLoginUrl = (payload as any).hotspot_login_url || ''

console.log(`[mikrotik-sync] v7.1.60: Telemetry - login_by="${hotspotLoginBy}", login_url="${hotspotLoginUrl.slice(0, 50)}..."`)

const hasChap = hotspotLoginBy.includes('http-chap')
const hasPap = hotspotLoginBy.includes('http-pap')
const hasValidUrl = hotspotLoginUrl.length >= 10

const reliable = telemetryIsReliable(hotspotLoginBy, hotspotLoginUrl)

if (!reliable) {
  // Increment failure counter
  const currentFailures = (hotspot as any).telemetry_failures || 0
  const newFailures = currentFailures + 1
  await supabaseAdmin
    .from('hotspots')
    .update({ telemetry_failures: newFailures })
    .eq('id', hotspot.id)

  console.log(`[mikrotik-sync] v7.1.60: Skipping portal repair - telemetry unreliable (login_by="${hotspotLoginBy}", failures=${newFailures})`)

  if (newFailures >= 5) {
    console.warn(`[mikrotik-sync] v7.1.60: ALERT - hotspot ${hotspot.nome} has ${newFailures} consecutive telemetry failures. Router may need bootstrap reimport.`)
  }
  // needsPortalRepair = false -- skip repair entirely
} else {
  // Telemetry reliable -- reset counter if needed
  if ((hotspot as any).telemetry_failures > 0) {
    await supabaseAdmin
      .from('hotspots')
      .update({ telemetry_failures: 0 })
      .eq('id', hotspot.id)
    console.log(`[mikrotik-sync] v7.1.60: Telemetry restored for ${hotspot.nome} - reset failure counter`)
  }
}

const needsPortalRepair = reliable
  ? (hasChap || !hasPap || !hasValidUrl)
  : false
```

O restante do bloco (linhas 1108-1147: inject configure_hotspot_profile / mark portal_profile_version) permanece inalterado.

### 4. VERSION bump

```typescript
const VERSION = "7.1.60"
```

### 5. Incluir `telemetry_failures` no SELECT do hotspot

Localizar o SELECT que busca o hotspot (provavelmente algo como `.select('id, nome, ...')`) e adicionar `telemetry_failures` para que o valor esteja disponivel no objeto.

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Adicionar `telemetryIsReliable()`, substituir logica de reparo, bump VERSION |
| Migracao SQL | `ALTER TABLE hotspots ADD COLUMN telemetry_failures integer DEFAULT 0` |

## Redeploy

- `mikrotik-sync`
- `mikrotik-scripts` (garantir cache invalidado)

## Teste pos-deploy

1. Forcar sync no roteador: `/system script run navspot-sync`
2. Verificar logs backend: deve mostrar `Skipping portal repair - telemetry unreliable`
3. Confirmar que `configure_hotspot_profile` NAO e reinjetado
4. Verificar que `create_profile` e `create_user` sao processados
5. No roteador: `/ip hotspot user print` deve mostrar `alexandre.silva`
6. Testar login do tripulante
7. Apos reimportar bootstrap v7.1.59, verificar telemetria granular e counter resetado

## Resultado esperado

- Loop de reparo quebrado imediatamente
- Perfis e usuarios criados no roteador
- Login funcional
- Contador de falhas visivel para diagnostico operacional
- Quando roteador receber scripts v7.1.59 (via bootstrap), telemetria volta a funcionar e o sistema de reconciliacao retoma normalmente

