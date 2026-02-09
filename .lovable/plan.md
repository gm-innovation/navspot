

# Fix v7.1.60c: Force-repair threshold para quebrar deadlock

## Problema

O v7.1.60b criou um deadlock circular:
- Router sem `login-url` -> telemetria falha (`tele-lu failed`)
- Telemetria nao confiavel -> backend pula reparo
- `login-url` nunca e configurada -> telemetria nunca melhora
- `telemetry_failures` ja chegou a **46** e continua subindo

## Mudancas

### 1. VERSION bump (linha 9)
```
const VERSION = "7.1.60c"
```

### 2. Force-repair no bloco de telemetria nao confiavel (linhas 1127-1129)

Substituir o bloco de warning-only por logica de force-repair quando failures >= 10:

```typescript
// ANTES (linhas 1127-1129):
if (newFailures >= 5) {
  console.warn(`[mikrotik-sync] v7.1.60: ALERT - hotspot ${hotspot.nome} has ${newFailures} consecutive telemetry failures. Router may need bootstrap reimport.`)
}

// DEPOIS:
if (newFailures >= 10) {
  console.warn(`[mikrotik-sync] v7.1.60c: FORCE REPAIR - ${newFailures} consecutive telemetry failures, injecting portal config to break deadlock (hotspot=${hotspot.nome})`)
  
  const hotspotSlug = hotspot.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  const forceLoginUrl = `https://navspot.lovable.app/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
  const forceDnsName = `${hotspotSlug}.navspot.local`
  
  formattedActions.unshift({
    id: 'force-repair-whitelist',
    type: 'create_whitelist_domain',
    payload: { domain: new URL(Deno.env.get('SUPABASE_URL')!).hostname }
  })
  formattedActions.unshift({
    id: 'force-repair-config-profile',
    type: 'configure_hotspot_profile',
    payload: { login_url: forceLoginUrl, dns_name: forceDnsName }
  })
  
  // Reset counter + portal_profile_version to wait for telemetry confirmation
  const { error: resetError } = await supabase
    .from('hotspots')
    .update({ telemetry_failures: 0, portal_profile_version: null })
    .eq('id', hotspot.id)
  
  if (resetError) {
    console.error(`[mikrotik-sync] v7.1.60c: Failed to reset telemetry_failures: ${resetError.message}`)
  } else {
    console.log(`[mikrotik-sync] v7.1.60c: Reset telemetry_failures to 0 and portal_profile_version to null after force repair`)
  }
} else if (newFailures >= 5) {
  console.warn(`[mikrotik-sync] v7.1.60c: ALERT - hotspot ${hotspot.nome} has ${newFailures} consecutive telemetry failures`)
}
```

## Comportamento esperado

```text
Ciclo com failures=46:  FORCE REPAIR dispara, counter reseta para 0
Ciclo seguinte:         Router processa configure_hotspot_profile, login-url e configurada
Proximo sync:           tele-lu sucede, telemetria confiavel, operacao normal
                        create_profile + create_user fluem normalmente
```

Se o reparo falhar, o counter sobe novamente e dispara outro force-repair apos 10 ciclos (~10 min), sem loop.

## Arquivos modificados

| Arquivo | Linha | Mudanca |
|---------|-------|--------|
| `supabase/functions/mikrotik-sync/index.ts` | 9 | VERSION -> "7.1.60c" |
| `supabase/functions/mikrotik-sync/index.ts` | 1127-1129 | Substituir warning por force-repair com threshold >= 10 |

## Redeploy

- `mikrotik-sync` apenas

## Verificacao pos-deploy

1. Logs backend: `v7.1.60c: FORCE REPAIR` (dispara imediatamente pois failures=46)
2. `/system script run navspot-sync` no roteador
3. `configure_hotspot_profile` aparece no pipe de acoes UMA vez
4. Proximo sync: `tele-lu` deve ter sucesso
5. `create_profile` e `create_user` fluem nos syncs subsequentes
6. `/ip hotspot user print` mostra `alexandre.silva`
7. Login do tripulante funciona

