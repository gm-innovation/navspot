# Plano v7.1.48: Auto-Timeout de Lock ✅ IMPLEMENTADO

## Resumo da Implementação

O auto-timeout de 5 minutos foi implementado no `generateSyncSource()` em `mikrotik-scripts/index.ts`.

### Arquivos Modificados

| Arquivo | Versão | Status |
|---------|--------|--------|
| `mikrotik-scripts/index.ts` | 7.1.48 | ✅ Lock timeout implementado |
| `mikrotik-sync/index.ts` | 7.1.48 | ✅ Atualizado |
| `mikrotik-script-generator/index.ts` | 7.1.48 | ✅ Atualizado |
| `mikrotik-recovery-download/index.ts` | 7.1.48 | ✅ Atualizado |

### Lógica do Timeout

```routeros
:global navspotSyncLockTime
:local ct ([/system clock get time])
:local cs (([:pick $ct 0 2]*3600)+([:pick $ct 3 5]*60)+([:pick $ct 6 8]))
:if ($navspotSyncLock="1") do={
  :local la ($cs - $navspotSyncLockTime)
  :if ($la < 0) do={:set la ($la + 86400)}  # Trata meia-noite
  :if ($la > 300) do={
    :log warning "NAVSPOT-SYNC: lock expirado (age=".$la."s), resetando"
    :set navspotSyncLock "0"
  } else={:return}
}
:set navspotSyncLock "1"
:set navspotSyncLockTime $cs
```

---

## Validação Pós-Deploy

### No MikroTik (aguardar ~1-5 minutos):

```routeros
# Ver logs de recuperação
/log print where message~"NAVSPOT-SYNC"
# Esperado: "lock expirado (age=XXXXs), resetando"

# Verificar lock resetado
:put $navspotSyncLock
# Esperado: "0"

# Verificar usuário recriado
/ip hotspot user print where name="alexandre.silva"
```

### No Painel:

- Status do hotspot deve voltar para **ONLINE** (verde)
- Última sincronização < 2 minutos

---

## Reset Manual (Opcional)

Se não quiser esperar o timeout:

```routeros
:global navspotSyncLock "0"
/system script run navspot-sync
```
