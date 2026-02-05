

# Plano v7.1.28: Correção com Header Detection Preservado

## Diagnóstico

Os logs de v7.1.27 mostram:
- `try=1 len=0` - arquivo recém-criado vazio
- `try=2 len=151` - arquivo contém header MikroTik (~151 bytes)
- `write failed - abortando` - lógica de retry não corrigiu

**Problema raiz identificado:** O comando `/file print file=xxx where name="__x__"` cria um header de ~151 bytes. O `/file set contents` **não está sobrescrevendo** no RouterOS 6.x.

**Correção crítica que você apontou:** Manter `# NAME` header detection no check, pois `[:len $sv]>10` aceitaria header de 151 bytes como válido.

---

## Mudanças v7.1.28

### 1. Usar `where name="__never__"` (padrão mais confiável)
```diff
- /file print file=$tmpName where name="__x__"
+ /file print file=navspot-actions.txt where name="__never__"
```

### 2. Aumentar delays para sistema de arquivos
```diff
- :delay 250ms (após criar arquivo)
- :delay 300ms (entre retries)
+ :delay 700ms (após criar arquivo)
+ :delay 500ms (entre retries)
```

### 3. Aumentar tentativas para 3
```diff
- :while (($tries<2)&&($wrote=false)) do={
+ :while (($wt<3)&&($wok=false)) do={
```

### 4. MANTER Header Detection com prefix de 200 chars
```routeros
:local pf [:pick $sv 0 200]
:if (([:len $sv]>12)&&([:find $pf "# NAME"]<0)) do={:set wok true} else={
  :log warning ("NAVSPOT-SYNC: write try=".$wt." len=".[:len $sv]." pf=[".[:pick $pf 0 80]."]")
}
```

### 5. Simplificar removendo temp-file/rename (lock protege)
Dado que `navspotSyncLock` é inicializado e resetado em todos os caminhos, não há concorrência - podemos escrever direto em `navspot-actions.txt`.

### 6. Garantir lock reset em TODOS os paths
```routeros
# Já temos na linha 667:
} on-error={:set navspotSyncLock "0"}
# Adicionamos no final da função (já existe linha 719):
:set navspotSyncLock "0"
```

---

## Código Atualizado - generateSyncSource (~2.0KB)

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
:do {/file remove "navspot-actions.txt"} on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 700ms
:local wok false
:local wt 0
:while (($wt<3)&&($wok=false)) do={
:set wt ($wt+1)
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
:delay 500ms
:local sv ""
:do {:set sv [/file get "navspot-actions.txt" contents]} on-error={}
:local pf [:pick $sv 0 200]
:if (([:len $sv]>12)&&([:find $pf "# NAME"]<0)) do={:set wok true} else={
:log warning ("NAVSPOT-SYNC: write try=".$wt." len=".[:len $sv]." pf=[".[:pick $pf 0 80]."]")
}}
:if ($wok) do={
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP=0) do={
:log error "NAVSPOT-SYNC: action-processor NAO ENCONTRADO!"
} else={
:local aerr ""
:do {/system script run navspot-action-processor} on-error={:set aerr [:tostr $error]}
:if ([:len $aerr]>0) do={:log error ("NAVSPOT-SYNC: AP ERRO=".$aerr)} else={:log info "NAVSPOT-SYNC: AP OK"}
}
} else={
:log error "NAVSPOT-SYNC: write failed after 3 tries"
}
}
}
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}
```

**Tamanho estimado:** ~2.0KB (bem abaixo do limite de 3.2KB)

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Linha 41:** Bump VERSION para "7.1.28"

**Linhas 641-720 (generateSyncSource):**
- Usar `where name="__never__"` (linha 687)
- Aumentar delay após criar arquivo: 700ms
- Aumentar tentativas: 3
- Aumentar delay entre retries: 500ms
- **MANTER** header detection: `[:find $pf "# NAME"]<0`
- Prefix de 200 chars para verificação
- Log diagnóstico com primeiros 80 chars do prefix
- Remover lógica de temp-file/rename (simplificar)

### 2. Version bumps (4 arquivos)

- `supabase/functions/mikrotik-sync/index.ts` - VERSION para 7.1.28
- `supabase/functions/mikrotik-script-generator/index.ts` - VERSION para 7.1.28
- `src/components/modals/ScriptModal.tsx` - scriptVersion para "7.1.28"
- `src/pages/Embarcacoes.tsx` - currentScriptVersion para "7.1.28"

---

## Comparação de Verificação

| Aspecto | v7.1.27 (falhou) | v7.1.28 (proposto) |
|---------|------------------|-------------------|
| Arquivo temp | `navspot-actions-HHMMSS.txt` | `navspot-actions.txt` direto |
| Criação | `where name="__x__"` | `where name="__never__"` |
| Delay criação | 250ms | **700ms** |
| Delay retry | 300ms | **500ms** |
| Tentativas | 2 | **3** |
| Header check | `[:find $pf "# NAME"]<0` | **PRESERVADO** |
| Prefix size | 50 chars | **200 chars** |
| Log diagnóstico | `len=` apenas | `len=` + `pf=[80 chars]` |

---

## Tamanho Esperado

| Script | v7.1.27 | v7.1.28 | Limite |
|--------|---------|---------|--------|
| sync-raw | ~2.1 KB | ~2.0 KB | < 3.2 KB |

---

## Verificação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.28.rsc

# 1. Verificar logs de escrita - NÃO deve ter write try=X mais
/log print where message~"NAVSPOT-SYNC" last=30
# Esperado: "AP OK" (sem write warnings)

# 2. Verificar login-url configurado
/ip hotspot profile print where name="hsprof-navspot"
# login-url DEVE mostrar https://navspot.lovable.app/hotspot-login?...

# 3. Verificar usuários criados
/ip hotspot user print where comment~"navspot"

# 4. Testar login de dispositivo
# Dispositivo conecta -> redireciona para portal -> login funciona
```

---

## Checklist de Implementação (Conservador)

- [ ] Usar `where name="__never__"` para criar arquivo
- [ ] Delay após criação: 700ms
- [ ] 3 tentativas de write com delay 500ms
- [ ] **PRESERVAR** header detection `[:find $pf "# NAME"]<0`
- [ ] Prefix de 200 chars para verificação
- [ ] Log diagnóstico com primeiros 80 chars do prefix
- [ ] Remover temp-file/rename (simplificar com lock)
- [ ] Garantir lock reset em todos os on-error paths
- [ ] Captura de erro do AP com `[:tostr $error]`
- [ ] Bump VERSION para 7.1.28 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x
- [ ] Verificar que escrita funciona (sem write warnings)
- [ ] Verificar que AP executa (AP OK)
- [ ] Verificar login-url configurado
- [ ] Verificar login de usuário funciona

---

## Riscos Mitigados

| Proteção | Status v7.1.28 |
|----------|----------------|
| Header detection (`# NAME`) | ✓ PRESERVADO |
| Delay sistema de arquivos | ✓ Aumentado (700ms + 500ms) |
| Múltiplas tentativas | ✓ 3 tentativas |
| Captura erro AP | ✓ Preservado |
| Lock cleanup | ✓ Em todos os paths |
| Tamanho < 3.2KB | ✓ ~2.0KB |
| Fallback no installer | ✓ Mantido (não no sync) |

