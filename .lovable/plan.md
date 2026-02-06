
# Plano v7.1.49: Correção Cirúrgica do Lock Timeout (RouterOS 7.x)

## Problema

Linhas 737-738 causam erro de sintaxe:
```routeros
:local ct ([/system clock get time])
:local cs (([:pick $ct 0 2]*3600)+([:pick $ct 3 5]*60)+([:pick $ct 6 8]))
```

## Solução

Substituir por comando nativo do RouterOS 7.x:
```routeros
:local us [/system resource get uptime-as-secs]
```

Sem fallback. Sem parsing. Sem complexidade.

---

## Arquivo a Modificar

**supabase/functions/mikrotik-scripts/index.ts**

### Linhas 735-750 ANTES:

```routeros
:if ([:len $navspotSyncLockTime]=0) do={:set navspotSyncLockTime 0}
:local ct ([/system clock get time])
:local cs (([:pick $ct 0 2]*3600)+([:pick $ct 3 5]*60)+([:pick $ct 6 8]))
:if ($navspotSyncLock="1") do={
:local la ($cs - $navspotSyncLockTime)
:if ($la < 0) do={:set la ($la + 86400)}
:if ($la > 300) do={
:log warning "NAVSPOT-SYNC: lock expirado (age=".$la."s), resetando"
:set navspotSyncLock "0"
} else={
:log info "NAVSPOT-SYNC: locked"
:return
}}
:set navspotSyncLock "1"
:set navspotSyncLockTime $cs
```

### Linhas 735-746 DEPOIS:

```routeros
:if ([:len $navspotSyncLockTime]=0) do={:set navspotSyncLockTime 0}
:local us [/system resource get uptime-as-secs]
:if ($navspotSyncLock="1") do={
:local la ($us - $navspotSyncLockTime)
:if ($la > 300) do={
:log warning "NAVSPOT-SYNC: lock expirado (age=".$la."s), resetando"
:set navspotSyncLock "0"
} else={:log info "NAVSPOT-SYNC: locked";:return}}
:set navspotSyncLock "1"
:set navspotSyncLockTime $us
```

---

## Mudancas

| Antes | Depois |
|-------|--------|
| 2 linhas de parsing clock | 1 linha uptime-as-secs |
| Tratamento meia-noite | Removido (uptime cresce sempre) |
| 16 linhas | 10 linhas |
| Erro de sintaxe | Comando nativo |

---

## Versao

Atualizar para **7.1.49** nos arquivos:
- mikrotik-scripts/index.ts
- mikrotik-sync/index.ts  
- mikrotik-script-generator/index.ts
- mikrotik-recovery-download/index.ts

---

## Validacao

Apos deploy, no MikroTik:
```routeros
/log print where message~"NAVSPOT-SYNC"
# Esperado: "v7.1.49" sem erros

:put [/system resource get uptime-as-secs]
# Deve retornar numero de segundos
```
