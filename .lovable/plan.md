

# Plano de Implementação v7.1.23: Compactação Agressiva + Safeguards

## Problema Identificado

Os logs do v7.1.22 confirmam que os scripts estão acima do limite de ~4KB do RouterOS 6.x:

| Script | Tamanho v7.1.22 | Status |
|--------|-----------------|--------|
| sync-raw | 4371 bytes | **INVALIDO** (prefix=) |
| action-raw | 4754 bytes | **INVALIDO** (prefix=) |
| guardian-raw | 2674 bytes | OK |

## Estratégia de Correção

### 1. Compactação Agressiva dos Scripts

#### A. `generateSyncSource()` - Reduzir de ~4.3KB para ~2.8KB

**Técnicas de compactação:**
- Remover comentários inline
- Minificar nomes de variáveis (`processedCount` → `cnt`, `rawData` → `d`)
- Remover logs verbosos (manter apenas Start/OK/Error)
- Simplificar retry logic (delay fixo ao invés de exponencial)
- Remover validações redundantes de escrita

**Estrutura compactada:**
```routeros
:log info "NAVSPOT-SYNC v7.1.23"
:global navspotSyncLock
:if ($navspotSyncLock="1") do={:return}
:set navspotSyncLock "1"
# Token, coleta de dados, fetch, parse - tudo minificado
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v7.1.23: OK"
```

#### B. `generateActionProcessorCoreSource()` - Reduzir de ~4.7KB para ~3.1KB

**Técnicas de compactação:**
- Minificar nomes de variáveis (`pName` → `n`, `uPass` → `pw`)
- Remover logs de warning intermediários
- Manter apenas 3 handlers: `configure_hotspot_profile`, `create_profile`, `create_user`
- Mover `remove_user` para script AUX

### 2. Nomes de Arquivos Temporários Únicos

**Atual (v7.1.22):**
```routeros
:local tsStr [:pick $ts 0 2]
:set tsStr ($tsStr . [:pick $ts 3 5])
```

**v7.1.23 - Adicionar randomness:**
```routeros
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local rnd [:rndnum from=0 to=9999]
:local tempFile ("ns-action-" . $tsStr . "-" . $rnd . ".src")
```

### 3. Validação com Detecção de Header

**Atual:** Verifica apenas `[:find $prefix ":log info"]`

**v7.1.23 - Adicionar detecção de header inválido:**
```routeros
:local prefix ""
:do { :set prefix [:pick [/file get $tempFile contents] 0 200] } on-error={}
# Detectar padrões inválidos: header de /file output OU ausência de :log info
:if (([:find $prefix "# NAME"] >= 0) || ([:find $prefix ":log info"] < 0)) do={
  :log error ("NAVSPOT-INSTALL: content INVALIDO - header detectado ou sem :log")
  :local fullPrefix ""
  :do { :set fullPrefix [:pick [/file get $tempFile contents] 0 200] } on-error={}
  :log error ("NAVSPOT-INSTALL: Primeiros 200 chars: " . $fullPrefix)
  # Trigger fallback...
}
```

### 4. Smoke Test com Captura de $error

**v7.1.23 - Capturar e logar mensagem de erro específica:**
```routeros
:log info "NAVSPOT-INSTALL: Executando smoke test..."
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 500ms
/file set [find name="navspot-actions.txt"] contents="create_profile|navspot-smoke|1M|1;"
:delay 500ms
:local smokeErr ""
:do {
  /system script run navspot-action-processor
} on-error={
  :set smokeErr [:tostr $error]
  :log error ("NAVSPOT-INSTALL: smoke test ERRO=" . $smokeErr)
}
:if ([:len $smokeErr] > 0) do={
  :log error "NAVSPOT-INSTALL: smoke test falhou - aplicando FALLBACK INLINE"
  # Aplicar fallback...
} else={
  :log info "NAVSPOT-INSTALL: smoke test PASSOU - action-processor OK"
}
# Cleanup do profile de teste
:do { /ip hotspot user profile remove [find name="navspot-smoke"] } on-error={}
```

### 5. Sanitização Não-Destrutiva Melhorada

**Atualizar `sanitizePipeForFileContents` em mikrotik-sync:**
```typescript
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // Remove control chars
    .replace(/\r/g, '')             // Strip CR
    .replace(/;{2,}/g, ';')         // Collapse double semicolons
    .replace(/(^;|;$)/g, '')        // Trim leading/trailing semicolons
    .replace(/"/g, "'")             // Safer quotes
    // CRITICAL: Não substituir backslash - preserva \$(mac)
}
```

## Tamanhos Alvo (Margem Conservadora)

| Script | v7.1.22 | v7.1.23 Target | Margem Segurança |
|--------|---------|----------------|------------------|
| sync-raw | 4371 bytes | **< 3200 bytes** | ~800 bytes |
| action-raw | 4754 bytes | **< 3200 bytes** | ~800 bytes |
| guardian-raw | 2674 bytes | ~2500 bytes | OK |

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Mudanças:**
- Linha 35: Bump VERSION para "7.1.23"
- Linhas 553-703: Reescrever `generateSyncSource()` compactado (~2.8KB)
- Linhas 714-869: Reescrever `generateActionProcessorCoreSource()` compactado (~3.1KB)
- Linhas 293-560: Atualizar `generateAllScripts()`:
  - Adicionar [:rndnum] aos nomes de arquivos temporários
  - Adicionar detecção de header `# NAME`
  - Melhorar smoke test com captura de $error
  - Adicionar cleanup do profile navspot-smoke

### 2. `supabase/functions/mikrotik-sync/index.ts`

**Mudanças:**
- Linha 9: Bump VERSION para "7.1.23"
- Linhas 15-22: Melhorar `sanitizePipeForFileContents()`:
  - Adicionar `.replace(/\r/g, '')`
  - Adicionar `.replace(/(^;|;$)/g, '')`

### 3. `supabase/functions/mikrotik-script-generator/index.ts`

**Mudanças:**
- Bump VERSION para "7.1.23"

### 4. Frontend

**`src/components/modals/ScriptModal.tsx`:**
- Bump scriptVersion para "7.1.23"

**`src/pages/Embarcacoes.tsx`:**
- Bump currentScriptVersion para "7.1.23"

## Código Compactado - Sync Source (~2.8KB)

```typescript
function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:if ($navspotSyncLock="1") do={:return}
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
} on-error={}
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
/file print file=navspot-actions.txt where name="__x__"
:delay 700ms
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
:delay 300ms
:do {/system script run navspot-action-processor} on-error={}
}
}
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"`
}
```

## Código Compactado - Action Processor (~3.1KB)

```typescript
function generateActionProcessorCoreSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}"
:global navspotLock
:if ($navspotLock="1") do={:return}
:set navspotLock "1"
:local f [/file find name="navspot-actions.txt"]
:if ([:len $f]=0) do={:set navspotLock "0";:return}
:local d ""
:do {:set d [/file get $f contents]} on-error={:set navspotLock "0";:return}
:do {/file remove $f} on-error={}
:if ([:len $d]=0) do={:set navspotLock "0";:return}
:local pos 0
:local cnt 0
:while ([:find $d ";" $pos]>=0) do={
:local ep [:find $d ";" $pos]
:local ln [:pick $d $pos $ep]
:set pos ($ep+1)
:if ([:len $ln]>0) do={
:local p1 [:find $ln "|"]
:if ($p1>=0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c="configure_hotspot_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:if (([:len $lu]>0)&&([:len $dn]>0)) do={
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hp]>0) do={
:do {/ip hotspot profile set $hp login-url=$lu} on-error={}
:do {/ip hotspot profile set $hp dns-name=$dn} on-error={}
:do {/ip hotspot profile set $hp login-by=http-pap,http-chap} on-error={}
:set cnt ($cnt+1)
}}}
} on-error={}
}
:if ($c="create_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:if ([:len $n]>0) do={
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={
:set rt [:pick $sub 0 $p3]
:local s2 [:pick $sub ($p3+1) [:len $sub]]
:local p4 [:find $s2 "|"]
:if ($p4>=0) do={:set sh [:pick $s2 0 $p4]} else={:set sh $s2}
} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]=0) do={
:if ([:len $rt]>0) do={
:do {/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} on-error={}
} else={
:do {/ip hotspot user profile add name=$n shared-users=$sh} on-error={}
}
:set cnt ($cnt+1)
}
}}
} on-error={}
}
:if ($c="create_user") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:if ([:len $un]>0) do={
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3>=0) do={
:set pw [:pick $sub 0 $p3]
:set pf [:pick $sub ($p3+1) [:len $sub]]
} else={:set pw $sub}
:if ([:len $pf]=0) do={:set pf "default"}
:local pe [/ip hotspot user profile find name=$pf]
:if ([:len $pe]=0) do={:do {/ip hotspot user profile add name=$pf} on-error={}}
:local ex [/ip hotspot user find name=$un]
:if ([:len $ex]=0) do={
:if ([:len $pw]>0) do={
:do {/ip hotspot user add name=$un password=$pw profile=$pf comment="navspot"} on-error={}
:set cnt ($cnt+1)
}}
}}
} on-error={}
}
}}}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - ".$cnt)`
}
```

## Verificação no MikroTik

```routeros
/import navspot-bootstrap-v7.1.23.rsc

# 1. Verificar tamanhos dos downloads (devem ser < 3500)
/log print where message~"baixado" last=10
# Esperado: sync (~2800), action (~3100), guardian (~2500)

# 2. Verificar se validação passou
/log print where message~"content" last=10
# Esperado: "content valido" para TODOS (não "INVALIDO")

# 3. Verificar smoke test
/log print where message~"smoke" last=5
# Esperado: "smoke test PASSOU" (não "ERRO")

# 4. Confirmar scripts instalados
/system script print
# Esperado: navspot-sync, navspot-action-processor, navspot-guardian

# 5. Verificar tamanhos no dispositivo
:put ("sync: " . [:len [/system script get navspot-sync source]] . " bytes")
:put ("action: " . [:len [/system script get navspot-action-processor source]] . " bytes")
```

## Checklist de Implementação

- [ ] Compactar `generateSyncSource()` para < 3200 bytes
- [ ] Compactar `generateActionProcessorCoreSource()` para < 3200 bytes
- [ ] Mover `remove_user` handler para `generateActionAuxSource()`
- [ ] Adicionar [:rndnum] aos nomes de arquivos temporários
- [ ] Adicionar detecção de header (`# NAME`) na validação
- [ ] Adicionar captura de `$error` no smoke test
- [ ] Adicionar cleanup do profile navspot-smoke
- [ ] Melhorar `sanitizePipeForFileContents()` (trim semicolons)
- [ ] Bump VERSION para 7.1.23 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar em RouterOS 6.49.x
- [ ] Verificar todos os scripts < 3500 bytes após download
- [ ] Verificar "content valido" nos logs
- [ ] Verificar "smoke test PASSOU" nos logs

