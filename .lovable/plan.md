

# Fix v7.1.60: AP Lock Timeout + Global Error Handler + Sync Lock Robustness

## Problema

O Action Processor (AP) crasha silenciosamente durante o processamento de comandos, deixando `navspotLock="1"` permanentemente. O sync script tambem crasha quando `uptime-as-secs` retorna 0 e o lock esta ativo, pois a subtracao `0 - lockTime` falha no RouterOS.

## Alteracoes

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

---

### 1. VERSION bump (linha 38)

```
const VERSION = "7.1.60"
```

---

### 2. `generateActionProcessorFullSource()` (linhas 989-1123)

Adicionar:
- `:global navspotLockTime` para persistir timestamp do lock entre execucoes
- Lock timeout de 120s com `uptime-as-secs` (tolerante a falha)
- Quando `us=0` e lock ativo, tratar como lock expirado (log + reset)
- Wrap do loop `:while` inteiro em `:do { ... } on-error={ :log error ("NS-AP: CRASH=" . [:tostr $error]) }`
- Log diagnostico com tamanho dos dados e primeiros 80 chars
- Garantir `navspotLock "0"` em todos os caminhos (erro e sucesso)

Estrutura resultante (pseudo-codigo):

```text
:log info "NAVSPOT-ACTION v7.1.60"
:global navspotLock
:global navspotLockTime
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:set us 0}
:if ([:len $navspotLock]=0) do={:set navspotLock "0"}
:if ($navspotLock="1") do={
  :local la 999
  :if (($us>0)&&([:typeof $navspotLockTime]="num")&&($navspotLockTime>0)) do={
    :set la ($us - $navspotLockTime)
  }
  :if ($la>120) do={
    :log warning ("NS-AP: lock expired (age=" . $la . "s)")
  } else={
    :log info ("NS-AP: locked (age=" . $la . "s)")
    :return
  }
}
:set navspotLock "1"
:set navspotLockTime $us
[... file read ...]
:do {
  :log info ("NS-AP: processing " . [:len $d] . "b")
  [... while loop com todos os handlers existentes ...]
} on-error={
  :log error ("NS-AP: CRASH=" . [:tostr $error])
}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v7.1.60: OK - " . $cnt)
```

---

### 3. `generateActionProcessorCoreSource()` (linhas 876-969)

Mesmas alteracoes do Full, mas mantendo apenas os handlers existentes (configure_hotspot_profile, create_profile, create_user, add_whitelist_domain). Atencao ao limite de ~2.9KB para ROS 6.x -- o overhead do lock timeout + error handler adiciona ~300 bytes, mantendo dentro do limite.

---

### 4. `generateSyncSource()` (linhas 730-858)

Corrigir o bloco de lock check (linhas 740-745). Atualmente:

```routeros
:if ($navspotSyncLock="1") do={
:local la ($us - $navspotSyncLockTime)
```

Quando `us=0`, a subtracao `0 - lockTime` causa crash. Correcao:

```routeros
:if ($navspotSyncLock="1") do={
:local shouldSkip true
:if ($us=0) do={
:log warning "NAVSPOT-SYNC: uptime unavailable, forcing lock reset"
:set shouldSkip false
} else={
:local la 999
:if ([:typeof $navspotSyncLockTime]="num") do={:set la ($us - $navspotSyncLockTime)}
:if ($la>300) do={
:log warning ("NAVSPOT-SYNC: lock expirado (age=" . $la . "s), resetando")
:set shouldSkip false
} else={:log info "NAVSPOT-SYNC: locked"}
}
:if ($shouldSkip) do={:return}
}
```

Isso evita a aritmetica invalida e trata `us=0` como lock expirado de forma segura.

---

### 5. Fallback AP no instalador (linhas 291-343)

O fallback inline ja e minimalista e nao tem lock timeout. Adicionar o mesmo padrao basico:
- `:global navspotLockTime`
- Timeout simples de 120s
- Wrap do while em `:do { ... } on-error={}`

---

### 6. AUX Action Processor (`generateActionAuxSource`, linhas 1136-1223)

Aplicar o mesmo padrao de lock timeout + global error handler, identico ao core/full.

---

## Detalhes tecnicos importantes

### Compatibilidade ROS 6.x vs 7.x

- `[:typeof $var]` funciona em ambas as versoes para verificar se a variavel e numerica
- `uptime-as-secs` so existe no ROS 7.x; no 6.x o `:do {} on-error={}` captura e seta `us=0`
- O core AP deve permanecer abaixo de 2900 bytes -- o overhead estimado e ~250-300 bytes

### Prevencao de race conditions

- A checagem `if ($navspotLock="1")` seguida de `:set navspotLock "1"` nao e atomica, mas e suficiente para o cenario single-threaded do RouterOS scheduler
- O timeout de 120s para o AP (vs 300s do sync) reflete que o AP executa em <5s normalmente

### Logs adicionados

| Log | Significado |
|-----|-------------|
| `NS-AP: lock expired (age=Xs)` | Lock anterior estava travado, resetado |
| `NS-AP: locked (age=Xs)` | Outra instancia em execucao, skip |
| `NS-AP: processing Nb` | Inicio do processamento com tamanho |
| `NS-AP: CRASH=...` | Erro capturado pelo handler global |
| `NAVSPOT-SYNC: uptime unavailable, forcing lock reset` | Sync com us=0, lock resetado |

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` linha 38 | VERSION -> "7.1.60" |
| `supabase/functions/mikrotik-scripts/index.ts` `generateActionProcessorFullSource()` | Lock timeout 120s + global error handler |
| `supabase/functions/mikrotik-scripts/index.ts` `generateActionProcessorCoreSource()` | Mesmo (respeitando limite 2.9KB) |
| `supabase/functions/mikrotik-scripts/index.ts` `generateSyncSource()` | Fix lock check quando us=0 |
| `supabase/functions/mikrotik-scripts/index.ts` `generateAllScripts()` fallback | Lock timeout basico + error handler |
| `supabase/functions/mikrotik-scripts/index.ts` `generateActionAuxSource()` | Lock timeout + error handler |

## Redeploy

- `mikrotik-scripts` apenas

## Verificacao

1. Reimportar scripts no router: `/tool fetch ... dst-path=navspot-scripts.rsc` + `/import navspot-scripts.rsc`
2. Rodar sync: `/system script run navspot-sync`
3. Verificar logs: nenhum `NS-AP: CRASH` deve aparecer
4. Verificar `/ip hotspot user profile print` e `/ip hotspot user print` -- perfis e usuarios criados
5. Forcar lock travado (`:global navspotLock; :set navspotLock "1"; :global navspotLockTime; :set navspotLockTime 0`) e esperar 120s -- AP deve resetar automaticamente
6. Verificar que `NAVSPOT-SYNC: uptime unavailable, forcing lock reset` aparece quando `uptime-as-secs` falha

