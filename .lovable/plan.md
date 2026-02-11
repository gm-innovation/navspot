

# Fix v7.3.0: Sync Ultra-Minimal com `as-value output=user`

## Problema

O sync atual (linhas 363-565) tem ~5KB, usa fetch baseado em arquivo (`dst-path`, `delay 2s`, `/file get contents`, `/file remove`), contem `:tostr` (crash ROS7), e atinge nesting L7-L9 nos handlers complexos. O parser do hAP ax2 rejeita o script.

## Solucao

Reescrever `generateSyncSource()` com:
1. **Fetch via `as-value output=user`** - resposta direto na RAM, zero arquivos
2. **Lock de 3 linhas** - sem age check complexo
3. **Sem `:tostr`** - lookup direto por nome fixo `hsprof-navspot`
4. **Telemetria minima** - apenas token, identity, version, active count
5. **Handlers idempotentes simplificados** - remove+add em vez de check-exists
6. **Nesting maximo: L5**

## Detalhes tecnicos

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

#### 1. Reescrever `generateSyncSource()` (linhas 363-565)

Substituir inteiramente por ~70 linhas. Estrutura:

```text
L0: :log info "NAVSPOT-SYNC v7.3.0"
L0: :global navspotSyncLock
L0: :if ($navspotSyncLock="1") do={:return}
L0: :set navspotSyncLock "1"
L0: :local a ""
L0: :local q "\22"
L0: :local lby "cookie,http-pap,http-chap"
L0: # telemetria basica (sem :tostr)
L0: :local id [/system identity get name]
L0: :local ver [/system resource get version]
L0: :local ac 0
L0: :do {:set ac [:len [/ip hotspot active find]]} on-error={}
L0: :local b (JSON com $q)
L0: # fetch direto na memoria
L0: :do {
L1:   :local res [/tool fetch url=... as-value output=user]
L1:   :local body ($res->"data")
L1:   :local s [:find $body "[["]
L1:   :local e [:find $body "]]"]
L1:   :if (($s>=0)&&($e>$s)) do={
L2:     :set a [:pick $body ($s+2) $e]
L1:   }
L0: } on-error={:log error "NAVSPOT-SYNC: fetch failed"}
L0: # processar acoes no nivel 0
L0: :if ([:len $a]>0) do={
L1:   :local pos 0; :local cnt 0
L1:   :while ([:find $a ";" $pos]>=0) do={
L2:     :local ep [:find $a ";" $pos]
L2:     :local ln [:pick $a $pos $ep]
L2:     :set pos ($ep+1)
L2:     :local p1 [:find $ln "|"]
L2:     :if ($p1>=0) do={
L3:       :local c [:pick $ln 0 $p1]
L3:       :local r [:pick $ln ($p1+1) [:len $ln]]
L3:       :if ($c="configure_hotspot_profile") do={
L4:         :local p2 [:find $r "|"]
L4:         :if ($p2>=0) do={
L5:           /ip hotspot profile set [find name="hsprof-navspot"] login-url=[:pick $r 0 $p2] dns-name=[:pick $r ($p2+1) [:len $r]] login-by=$lby
L5:           :set cnt ($cnt+1)
L4:         }
L3:       }
L3:       :if ($c="create_user") do={
L4:         :local p2 [:find $r "|"]
L4:         :if ($p2>=0) do={
L5:           :do {/ip hotspot user remove [find name=[:pick $r 0 $p2]]} on-error={}
L5:           :do {/ip hotspot user add name=[:pick $r 0 $p2] password=[:pick $r ($p2+1) [:len $r]] profile="default" comment="navspot"} on-error={}
L5:           :set cnt ($cnt+1)
L4:         }
L3:       }
L3:       :if ($c="create_profile") do={
L4:         :local p2 [:find $r "|"]
L4:         :if ($p2>=0) do={
L5:           :do {/ip hotspot user profile remove [find name=[:pick $r 0 $p2]]} on-error={}
L5:           :do {/ip hotspot user profile add name=[:pick $r 0 $p2] rate-limit=[:pick $r ($p2+1) [:len $r]] shared-users=1} on-error={}
L5:           :set cnt ($cnt+1)
L4:         }
L3:       }
L3:       :if ($c="remove_user") do={
L4:         :do {/ip hotspot user remove [find name=$r]} on-error={}
L4:         :set cnt ($cnt+1)
L3:       }
L3:       :if ($c="disable_user") do={
L4:         :do {/ip hotspot user set [find name=$r] disabled=yes} on-error={}
L4:         :set cnt ($cnt+1)
L3:       }
L3:       :if ($c="enable_user") do={
L4:         :do {/ip hotspot user set [find name=$r] disabled=no} on-error={}
L4:         :set cnt ($cnt+1)
L3:       }
L2:     }
L1:   }
L1:   :log info ("NAVSPOT-SYNC: processed " . $cnt . " actions")
L1:   :set a ""
L0: }
L0: :set navspotSyncLock "0"
L0: :log info "NAVSPOT-SYNC v7.3.0: OK"
```

#### 2. Delay do primeiro sync no installer (linha 350)

Mudar de `:delay 2s` para `:delay 5s` para garantir escrita na flash.

#### 3. Handlers removidos temporariamente

Para manter o script minimo nesta versao:
- `create_whitelist_domain` / `add_whitelist_domain`
- `add_firewall_block` / `add_firewall_allow`
- `kick_session`

Serao re-adicionados apos confirmar que o basico funciona.

## Resultado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Tamanho | ~5KB | ~2.5KB |
| Fetch | Arquivo + delay 2s | `as-value output=user` (RAM) |
| Lock | 13 linhas com age check | 3 linhas |
| `:tostr` | Sim (crash ROS7) | Removido |
| Nesting max | L7-L9 | L5 |
| Handlers | 12 (com firewall) | 6 (core) |

