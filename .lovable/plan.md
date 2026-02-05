

# Plano v7.1.27: Sync Thin + Proteções Conservadoras

## Diagnóstico Confirmado

O sync script v7.1.26 tem **4597 bytes** (limite seguro: ~3.2KB). A causa é o fallback inline (linhas 707-748) que adiciona ~1.5KB desnecessariamente.

O **installer já tem smoke test completo** (linhas 456-499) que:
- Valida o action-processor source
- Executa smoke test com captura de `[:tostr $error]`
- Aplica fallback inline se falhar
- Limpa o perfil de teste

**Conclusão:** O fallback no sync é redundante e viola o princípio "Thin Client".

---

## Estratégia v7.1.27

### 1. Remover Fallback Inline do Sync (OBRIGATÓRIO)
- Elimina ~1.5KB, trazendo sync para ~2.0KB
- O installer já garante que action-processor funciona

### 2. Manter Write/Read-Back Leve (2 tentativas + prefix check)
Adiciona ~200 bytes mas previne regressões:
```routeros
:local wrote false
:local tries 0
:while (($tries<2)&&($wrote=false)) do={
  :set tries ($tries+1)
  :do {/file set [find name=$tmpName] contents=$a} on-error={}
  :delay 300ms
  :local saved ""
  :do {:set saved [/file get [find name=$tmpName] contents]} on-error={}
  :local pf [:pick $saved 0 50]
  :if (([:len $saved]=[:len $a])&&([:find $pf "# NAME"]<0)) do={:set wrote true} else={
    :log warning ("SYNC: write err try=".$tries." len=".[:len $saved])
  }
}
```

### 3. Manter Execução com Captura de Erro
```routeros
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
  :log error "NAVSPOT-SYNC: action-processor NAO ENCONTRADO!"
} else={
  :local aerr ""
  :do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
  :if ([:len $aerr]>0) do={:log error ("NAVSPOT-SYNC: AP ERRO=".$aerr)} else={:log info "NAVSPOT-SYNC: AP OK"}
}
```

### 4. Garantir Lock Limpo em Todos os on-error
```routeros
:global navspotSyncLock
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ($navspotSyncLock="1") do={:log info "NAVSPOT-SYNC: locked";:return}
:set navspotSyncLock "1"
# ... lógica ...
# Em TODOS os on-error paths: adicionar :set navspotSyncLock "0"
:set navspotSyncLock "0"
```

---

## Código Atualizado - generateSyncSource (~2.1KB)

```typescript
function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ($navspotSyncLock="1") do={:log info "NAVSPOT-SYNC: locked";:return}
:set navspotSyncLock "1"
:local tk ""
:do {:set tk [/file get "navspot-token.txt" contents]} on-error={}
:if ([:len $tk]<10) do={:set tk "${syncToken}"}
:local u ""
:local r ""
:local p ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:set u ($u.[get $a user].",".[get $a mac-address].",".[get $a bytes-in].",".[get $a bytes-out].";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={:set r ($r.[get $i name].",")}
/ip hotspot user profile
:foreach x in=[find] do={:set p ($p.[get $x name].",")}
:local b ("{".$q."sync_token".$q.":".$q.$tk.$q.",".$q."active_users_csv".$q.":".$q.$u.$q.",".$q."registered_users_csv".$q.":".$q.$r.$q.",".$q."registered_profiles_csv".$q.":".$q.$p.$q."}")
:local ok false
:do {
/tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-resp.txt"
:set ok true
} on-error={:set navspotSyncLock "0"}
:if ($ok) do={
:delay 500ms
:local resp ""
:do {:set resp [/file get "navspot-resp.txt" contents]} on-error={}
:do {/file remove "navspot-resp.txt"} on-error={}
:local s [:find $resp "[["]
:local e [:find $resp "]]"]
:if (($s>=0)&&($e>$s)) do={
:local raw [:pick $resp ($s+2) $e]
:local i 0
:local j ([:len $raw]-1)
:while (($i<=$j)&&([:pick $raw $i ($i+1)]=" ")) do={:set i ($i+1)}
:while (($j>=$i)&&([:pick $raw $j ($j+1)]=" ")) do={:set j ($j-1)}
:local a ""
:if ($j>=$i) do={:set a [:pick $raw $i ($j+1)]}
:if ([:len $a]>0) do={
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local tmpName ("navspot-actions-".$tsStr.".txt")
/file print file=$tmpName where name="__x__"
:delay 250ms
:local wrote false
:local tries 0
:while (($tries<2)&&($wrote=false)) do={
:set tries ($tries+1)
:do {/file set [find name=$tmpName] contents=$a} on-error={}
:delay 300ms
:local saved ""
:do {:set saved [/file get [find name=$tmpName] contents]} on-error={}
:local pf [:pick $saved 0 50]
:if (([:len $saved]=[:len $a])&&([:find $pf "# NAME"]<0)) do={:set wrote true} else={
:log warning ("NAVSPOT-SYNC: write err try=".$tries." len=".[:len $saved])
}}
:if ($wrote) do={
:do {/file remove "navspot-actions.txt"} on-error={}
:do {/file rename $tmpName navspot-actions.txt} on-error={}
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
:log error "NAVSPOT-SYNC: action-processor NAO ENCONTRADO!"
} else={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
:if ([:len $aerr]>0) do={:log error ("NAVSPOT-SYNC: AP ERRO=".$aerr)} else={:log info "NAVSPOT-SYNC: AP OK"}
}
} else={
:log error "NAVSPOT-SYNC: write failed - abortando"
:do {/file remove $tmpName} on-error={}
}
}
}
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}
```

**Tamanho estimado:** ~2.1KB (bem abaixo do limite de 3.2KB)

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Mudanças em `generateSyncSource()` (linhas 641-766):**
- Bump VERSION para "7.1.27"
- **REMOVER** todo o fallback inline (linhas 707-748)
- **MANTER** write/read-back leve (2 tentativas + prefix check)
- **MANTER** execução com captura de erro `[:tostr $error]`
- **MANTER** locks limpos em todos os caminhos

**Mudanças na linha 41:**
- Bump VERSION para "7.1.27"

### 2. Version bumps (4 arquivos)

- `supabase/functions/mikrotik-sync/index.ts` - VERSION para 7.1.27
- `supabase/functions/mikrotik-script-generator/index.ts` - VERSION para 7.1.27
- `src/components/modals/ScriptModal.tsx` - scriptVersion para "7.1.27"
- `src/pages/Embarcacoes.tsx` - currentScriptVersion para "7.1.27"

---

## Tamanhos Esperados

| Script | v7.1.26 | v7.1.27 | Limite | Status |
|--------|---------|---------|--------|--------|
| sync-raw | **4597 bytes** | ~2.1 KB | < 3.2 KB | **CORRIGIDO** |
| action-raw | 2709 bytes | 2709 bytes | < 3.2 KB | OK |
| guardian-raw | 1993 bytes | 1993 bytes | < 3.2 KB | OK |

---

## Verificação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.27.rsc

# 1. Verificar tamanho do sync
/log print where message~"NAVSPOT-INSTALL" last=50
# Esperado: "sync baixado (21XX bytes)" - NÃO 4597!
# Esperado: "sync content valido"
# Esperado: "smoke test PASSOU"

# 2. Verificar se action-processor é chamado
/log print where message~"NAVSPOT-SYNC" last=20
# Esperado: "AP OK" ou "AP ERRO=..." (diagnóstico real)

# 3. Verificar login-url configurado
/ip hotspot profile print where name="hsprof-navspot"
# login-url DEVE mostrar https://navspot.lovable.app/hotspot-login?...

# 4. Verificar tamanhos dos scripts
:put ("sync: " . [:len [/system script get navspot-sync source]] . " bytes")
:put ("action: " . [:len [/system script get navspot-action-processor source]] . " bytes")
```

---

## Checklist de Implementação

- [ ] Remover fallback inline do sync (linhas 707-748)
- [ ] Manter write/read-back leve (2 tentativas + prefix check)
- [ ] Manter execução com captura de erro `[:tostr $error]`
- [ ] Garantir lock reset em on-error do fetch
- [ ] Verificar tamanho final sync < 3.2KB (~2.1KB esperado)
- [ ] Bump VERSION para 7.1.27 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x
- [ ] Verificar logs de diagnóstico
- [ ] Verificar login-url configurado
- [ ] Verificar usuários criados

---

## Riscos Mitigados vs Preservados

| Proteção | v7.1.26 | v7.1.27 | Status |
|----------|---------|---------|--------|
| Write/read-back | 3 tries | 2 tries + prefix | ✓ Preservado |
| Prefix check (# NAME) | Sim | Sim | ✓ Preservado |
| Erro do AP `[:tostr $error]` | Sim | Sim | ✓ Preservado |
| Lock reset on-error | Parcial | Completo | ✓ Melhorado |
| Fallback inline no sync | Sim (1.5KB) | **Removido** | ✓ Eliminado |
| Smoke test no installer | Sim | Sim | ✓ Preservado |
| Tamanho < 3.2KB | **Violado** | ~2.1KB | ✓ Corrigido |

