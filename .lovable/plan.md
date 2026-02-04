

# Correção v7.1.10: Sintaxe RouterOS 6.x Completa + Robustez

## Diagnóstico Confirmado

Os logs mostram scripts instalados com sucesso, mas o `navspot-action-processor` falha na execução. A causa raiz são **erros de sintaxe no conteúdo do script RouterOS**:

### Problemas Identificados no `generateActionProcessorSource()`:

1. **Comandos "colados" sem separador** (linhas 518-526):
```routeros
// ATUAL (ERRADO)
:if ($navspotLock = "1") do={:log info "NAVSPOT-ACTION: lock ativo":return}
:if ([:len $fid] = 0) do={:set navspotLock "0":log warning "...":return}
:do {:set rawData [/file get $fid contents]} on-error={:log error "...":set navspotLock "0":return}
```

2. **Falta de `;` entre comandos dentro de `do={}`**

3. **Comandos sem `:` inicial** (`log` em vez de `:log`, `set` em vez de `:set`)

4. **Linha 590** - comando colado após `/ip hotspot user remove`:
```routeros
/ip hotspot user remove $existing:log info ("NAVSPOT: Usuario removido - " . $rest)
```

### Problemas no `generateSyncSource()`:

1. **Log genérico "Fetch FALHOU"** (linha 495) - não distingue se falhou fetch, parse ou action-processor

2. **Falta `check-certificate=no`** no `/tool fetch` (linha 465)

3. **Delay curto** de 500ms após criação de arquivo (linha 482) - pode falhar em Flash lenta

4. **Parâmetros vazios no pipe** não são tratados (ex: `add_user|user1||profile1`)

---

## Mudanças Técnicas v7.1.10

### A) `supabase/functions/mikrotik-scripts/index.ts`

#### 1) Corrigir `generateActionProcessorSource()` - Sintaxe RouterOS 6.x

**Todas as mudanças aplicam:**
- Separador `;` entre comandos dentro de `{ }`
- Espaços após `do={` e antes de `}`
- `:` inicial em todos os comandos (`:log`, `:set`, `:return`)
- Tratamento de parâmetros vazios no pipe

```typescript
function generateActionProcessorSource(): string {
  return `:log info "NAVSPOT-ACTION v${VERSION}: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :log info "NAVSPOT-ACTION: lock ativo"; :return }
:set navspotLock "1"
:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ :set navspotLock "0"; :log warning "NAVSPOT-ACTION: Arquivo nao encontrado"; :return }
:local rawData ""
:do { :set rawData [/file get $fid contents] } on-error={ :log error "NAVSPOT-ACTION: Erro leitura"; :set navspotLock "0"; :return }
:log info ("NAVSPOT-ACTION: len=" . [:len $rawData])
:do { /file remove $fid } on-error={}
:if ([:len $rawData] = 0) do={ :set navspotLock "0"; :log info "NAVSPOT-ACTION: Nenhuma acao pendente"; :return }
:local pos 0
:local processedCount 0
:do {
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:if ([:len $line] > 0) do={
:local p1 [:find $line "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $line 0 $p1]
:local rest [:pick $line ($p1 + 1) [:len $line]]
:if ($cmd = "configure_hotspot_profile") do={
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local loginUrl [:pick $rest 0 $p2]
:local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
:if (([:len $loginUrl] > 0) && ([:len $dnsName] > 0)) do={
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hsprof] > 0) do={
:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
:do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={}
:do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
:log info ("NAVSPOT: Hotspot profile configurado - " . $dnsName)
:set processedCount ($processedCount + 1)
}}}
}
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local pName [:pick $rest 0 $p2]
:if ([:len $pName] > 0) do={
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={ :set pShared [:pick $sub2 0 $p4] } else={ :set pShared $sub2 }
} else={ :set pRate $sub }
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile add name=$pName shared-users=$pShared
}
:log info ("NAVSPOT: Perfil criado - " . $pName)
:set processedCount ($processedCount + 1)
} else={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile set $existing shared-users=$pShared
}
}}}
}
:if ($cmd = "create_user") do={
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local uName [:pick $rest 0 $p2]
:if ([:len $uName] > 0) do={
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local uPass ""
:local uProf "default"
:if ($p3 >= 0) do={
:set uPass [:pick $sub 0 $p3]
:set uProf [:pick $sub ($p3 + 1) [:len $sub]]
} else={ :set uPass $sub }
:if ([:len $uProf] = 0) do={ :set uProf "default" }
:local profExists [/ip hotspot user profile find name=$uProf]
:if ([:len $profExists] = 0) do={ /ip hotspot user profile add name=$uProf }
:local existing [/ip hotspot user find name=$uName]
:if ([:len $existing] = 0) do={
/ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
:log info ("NAVSPOT: Usuario criado - " . $uName)
:set processedCount ($processedCount + 1)
} else={
/ip hotspot user set $existing password=$uPass profile=$uProf
}}}
}
:if ($cmd = "remove_user") do={
:if ([:len $rest] > 0) do={
:local existing [/ip hotspot user find name=$rest]
:if ([:len $existing] > 0) do={
/ip hotspot user remove $existing
:log info ("NAVSPOT: Usuario removido - " . $rest)
:set processedCount ($processedCount + 1)
}}
}
:if ($cmd = "disable_user") do={
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
}}
:if ($cmd = "enable_user") do={
:if ([:len $rest] > 0) do={
:do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
}}
:if ($cmd = "kick_session") do={
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $kMac] > 0) do={
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
}}}
:if ($cmd = "update_password") do={
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local uName [:pick $rest 0 $p2]
:local uPass [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $uName] > 0) do={
:do { /ip hotspot user set [find name=$uName] password=$uPass } on-error={}
}}}
}}
}
} on-error={ :log error "NAVSPOT-ACTION: Erro processamento"; :set navspotLock "0"; :return }
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v${VERSION}: OK - " . $processedCount . " acoes")`
}
```

#### 2) Corrigir `generateSyncSource()` - Logs específicos + check-certificate + delay

```typescript
function generateSyncSource(syncUrl: string, syncToken: string): string {
  return `:log info "NAVSPOT-SYNC v${VERSION}: Iniciando..."
:local token ""
:do { :set token [/file get "navspot-token.txt" contents] } on-error={}
:if ([:len $token] < 10) do={
:set token "${syncToken}"
:log warning "NAVSPOT-SYNC: Usando token fallback embutido"
}
:local syncUrl "${syncUrl}"
:local users ""
:local registered ""
:local profiles ""
:local q "\\22"
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
/ip hotspot user
:foreach i in=[find where dynamic=no] do={
:local uname [get $i name]
:set registered ($registered . $uname . ",")
}
/ip hotspot user profile
:foreach p in=[find] do={
:local pname [get $p name]
:set profiles ($profiles . $pname . ",")
}
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q)
:set body ($body . ":" . $q . $users . $q)
:set body ($body . "," . $q . "registered_users_csv" . $q)
:set body ($body . ":" . $q . $registered . $q)
:set body ($body . "," . $q . "registered_profiles_csv" . $q)
:set body ($body . ":" . $q . $profiles . $q . "}")
:local hdr "Content-Type: application/json"
:local fetchOk false
:local syncOk false
:do {
/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field=$hdr check-certificate=no dst-path="navspot-resp.txt"
:set fetchOk true
} on-error={ :log warning "NAVSPOT-SYNC: FETCH falhou (rede/TLS/DNS)" }
:if ($fetchOk = true) do={
:delay 500ms
:local resp ""
:do { :set resp [/file get "navspot-resp.txt" contents] } on-error={}
:do { /file remove "navspot-resp.txt" } on-error={}
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={ :set i ($i + 1) }
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={ :set j ($j - 1) }
:local actions ""
:if ($j >= $i) do={ :set actions [:pick $raw $i ($j + 1)] }
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:if ([:len $actions] = 0) do={
:log info "NAVSPOT-SYNC: Nenhuma acao pendente"
:set syncOk true
} else={
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 1s
:do { /file set [find name="navspot-actions.txt"] contents=$actions } on-error={ :log error "NAVSPOT-SYNC: Falha ao salvar arquivo" }
:delay 500ms
:local fsize 0
:do { :set fsize [/file get [find name="navspot-actions.txt"] size] } on-error={}
:log info ("NAVSPOT-SYNC: Arquivo salvo (size=" . $fsize . "), acionando action-processor...")
:do {
/system script run navspot-action-processor
:set syncOk true
} on-error={ :log error "NAVSPOT-SYNC: action-processor FALHOU na execucao" }
}
} else={
:log warning "NAVSPOT-SYNC: Resposta invalida (sem pending_actions_pipe)"
}
}
:if ($syncOk = true) do={
:log info "NAVSPOT-SYNC v${VERSION}: OK"
} else={
:log warning "NAVSPOT-SYNC v${VERSION}: Concluido com erros"
}`
}
```

#### 3) Atualizar `generateAllScripts()` - Schedulers idempotentes

Linhas 293-310: Usar padrão remove-then-add para schedulers:

```typescript
# ===== 4. SCHEDULERS =====
:do { /system scheduler remove [find name="navspot-sync-scheduler"] } on-error={}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup
:log info "NAVSPOT-SCRIPTS: Scheduler sync criado"

:do { /system scheduler remove [find name="navspot-guardian-scheduler"] } on-error={}
/system scheduler add name="navspot-guardian-scheduler" interval=10m on-event="/system script run navspot-guardian" start-time=startup
:log info "NAVSPOT-SCRIPTS: Scheduler guardian criado"
```

#### 4) Bump de versão

```typescript
const VERSION = "7.1.10"
```

Atualizar docblock com descrição das mudanças v7.1.10.

---

### B) Outros Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION para "7.1.10" |
| `src/components/modals/ScriptModal.tsx` | Default scriptVersion="7.1.10" |
| `src/pages/Embarcacoes.tsx` | Fallback currentScriptVersion="7.1.10" |

---

## Resumo das Correções v7.1.10

| Componente | Antes | Depois |
|------------|-------|--------|
| **Separadores** | Comandos colados `:log...:return` | Separados com `;` |
| **Sintaxe** | `log warning` sem `:` | `:log warning` |
| **Espaços** | `do={:cmd}` | `do={ :cmd }` |
| **Parâmetros vazios** | Não tratados | Validação com `[:len]` |
| **check-certificate** | Ausente no sync | `check-certificate=no` |
| **Delay arquivo** | 500ms | 1s (Flash lenta) |
| **Logs** | "Fetch FALHOU" genérico | "FETCH falhou" vs "action-processor FALHOU" |
| **Schedulers** | if-else | remove-then-add idempotente |

---

## Validação Pós-Deploy

1. Gerar bootstrap v7.1.10
2. Importar: `/import navspot-bootstrap-v7.1.10.rsc`
3. Testar action-processor "seco":
   - `/file print file=navspot-actions.txt where name="__never__"`
   - `/system script run navspot-action-processor`
   - Esperado: log "Nenhuma acao pendente"
4. Sync manual: `/system script run navspot-sync`
5. Verificar logs: `/log print where message~"NAVSPOT"`
6. Confirmar usuário: `/ip hotspot user print where name="alexandre.silva"`

