

# Fix v7.1.60b: Guard do segundo ponto de injecao (auto-repair v7.1.29)

## Problema

O primeiro ponto de reparo (linha 1104-1144, State Reconciliation) ja esta protegido com `telemetryIsReliable()`. Porem, o segundo ponto (linha 1467-1507, auto-repair v7.1.29) continua injetando `configure_hotspot_profile` a cada ciclo porque nao tem nenhuma verificacao de confiabilidade de telemetria. Os logs confirmam: `v7.1.29: Injected portal repair config with user actions` aparece em todo sync.

## Mudancas

### 1. VERSION bump (linha 9)

```
const VERSION = "7.1.60b"
```

### 2. Extrair `telemetryOk` como variavel reutilizavel (apos linha 1114)

A variavel `reliable` ja existe na linha 1114. Basta renomea-la ou criar um alias acessivel no escopo mais amplo. Como `reliable` e `const` declarada dentro do mesmo bloco de funcao, ela ja esta acessivel na linha 1474. Nenhuma mudanca estrutural necessaria.

### 3. Guard na linha 1474

```
// ANTES:
if (!hasPendingPortalConfig && hotspot.initial_config_sent && hasUserActions) {

// DEPOIS:
if (!hasPendingPortalConfig && hotspot.initial_config_sent && hasUserActions && reliable) {
```

Adicionar log de skip quando telemetria nao e confiavel:

```typescript
if (!hasPendingPortalConfig && hotspot.initial_config_sent && hasUserActions && reliable) {
  // ... codigo existente de injecao ...
} else if (!reliable && hasUserActions) {
  console.log(`[mikrotik-sync] v7.1.60b: Skipping auto-repair - telemetry unreliable (hotspot=${hotspot.nome}, pendingUserActions=${formattedActions.filter(a => a.type === 'create_user' || a.type === 'create_profile').length})`)
}
```

## Arquivos modificados

| Arquivo | Linha | Mudanca |
|---------|-------|--------|
| `supabase/functions/mikrotik-sync/index.ts` | 9 | VERSION -> "7.1.60b" |
| `supabase/functions/mikrotik-sync/index.ts` | 1474 | Adicionar `&& reliable` na condicao + log de skip |

## Redeploy

- `mikrotik-sync` apenas (mikrotik-scripts nao muda)

## Verificacao pos-deploy

1. `/system script run navspot-sync` no roteador
2. Logs backend: `v7.1.60b` + `Skipping auto-repair - telemetry unreliable` (em vez de `v7.1.29: Injected portal repair config`)
3. `configure_hotspot_profile` NAO aparece no pipe de acoes
4. `create_profile` e `create_user` fluem sem bloqueio
5. `/ip hotspot user print` deve mostrar `alexandre.silva`
6. Testar login do tripulante

## Resultado esperado

- Loop de reparo completamente quebrado (ambos os pontos protegidos)
- Perfis e usuarios criados no roteador
- Login funcional
- Apos reimportar bootstrap v7.1.59, telemetria granular restaura a reconciliacao completa

