
# Plano de Implementação v6.9.38 — Hard Line Cap + Comandos Curtos ✅ IMPLEMENTADO

## Problema Identificado

O erro "expected end of command (line 115 column 176)" ocorre porque o RouterOS tem um limite prático de ~160 caracteres por linha durante `/import`. O script v6.9.37 tem **10 linhas acima de 160 chars**:

| Linha | Chars | Comando Problemático |
|-------|-------|---------------------|
| 115/818 | 211 | `/ip hotspot profile add name="hsprof-navspot" hotspot-address=... dns-name="..." html-directory=... login-by=... keepalive-timeout=... idle-timeout=...` |
| 386/402 | 278 | `:local body ("{" . $q . "sync_token" . $q . ":" ... }` (JSON inline gigante) |
| 890/929 | 180+ | `on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}"` |
| 892/931 | 175+ | scheduler guardian com delay inline |
| 937 | 161+ | netwatch up-script com delay inline |
| 950 | 187 | first-sync scheduler |

## Estratégia v6.9.38

### A) Hotspot Profile: Add Curto + Sets Separados

**DE (211 chars):**
```routeros
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="engenharia-googlemarine.navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
```

**PARA (múltiplas linhas <120 chars cada):**
```routeros
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1
} on-error={:log info "NAVSPOT: profile possivelmente ja existe"}

:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
  /ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1
  :set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Sets separados (cada linha <100 chars)
:do { /ip hotspot profile set $_hsprof dns-name="${dnsNameEsc}" } on-error={}
:do { /ip hotspot profile set $_hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $_hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $_hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $_hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $_hsprof login-url=$fullUrl } on-error={}
```

### B) JSON Incremental no Sync Script

**DE (278 chars - linha única):**
```routeros
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q . "," . $q . "registered_users_csv" . $q . ":" . $q . $registered . $q . "," . $q . "registered_profiles_csv" . $q . ":" . $q . $profiles . $q . "}")
```

**PARA (múltiplas linhas <100 chars cada):**
```routeros
:local body ("{" . $q . "sync_token" . $q . ":" . $q . $token . $q)
:set body ($body . "," . $q . "active_users_csv" . $q . ":" . $q . $users . $q)
:set body ($body . "," . $q . "registered_users_csv" . $q . ":" . $q . $registered . $q)
:set body ($body . "," . $q . "registered_profiles_csv" . $q . ":" . $q . $profiles . $q . "}")
```

### C) Schedulers/Netwatch: Strings Curtas

**DE (180+ chars):**
```routeros
on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}"
```

**PARA (~50 chars):**
```routeros
on-event="/system script run navspot-sync"
```

O delay de startup será gerenciado pelo `first-sync` scheduler que já existe.

### D) Guardrail: Regra de Linha Longa no Linter

Adicionar regra que bloqueia **qualquer linha não-comentário >160 chars**:

```typescript
// v6.9.38: Block ANY non-comment line >160 chars (RouterOS /import practical limit)
{ regex: /^(?!\s*#).{161,}$/m, desc: 'Line >160 chars (RouterOS /import may fail - split into multiple commands)' },
```

### E) Sanitização de Inputs

- `encodeURIComponent(hotspot.id)` para urlBase
- Escape de aspas no dnsName: `dnsName.replace(/"/g, '\\"')`

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

| Seção | Mudança |
|-------|---------|
| Linha 8 | `VERSION = "6.9.38"` |
| Linha 113 | Adicionar regra linter `^(?!\s*#).{161,}$` |
| Linhas 352-386 | Refatorar `syncScriptSource` com JSON incremental |
| Linhas 804-835 | Refatorar hotspot profile: add curto + sets separados |
| Linhas 890-932 | Encurtar scheduler on-event strings |
| Linha 937 | Encurtar netwatch up-script |
| Linha 950 | Encurtar first-sync scheduler |

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

| Seção | Mudança |
|-------|---------|
| Linha 34 | `VERSION = "6.9.38"` |
| Linha 117 | Adicionar regra linter `^(?!\s*#).{161,}$` |
| Linhas 369-402 | Refatorar `syncScriptSource` com JSON incremental |
| Linhas 686-691 | Encurtar scheduler on-event strings |
| Linha 696 | Encurtar netwatch up-script |
| Linhas 768-771 | Refatorar hotspot profile: add curto + sets separados |

### 3. `src/components/modals/ScriptModal.tsx`

| Seção | Mudança |
|-------|---------|
| Linha 34 | `scriptVersion = "6.9.38"` |

### 4. `test/useMikrotikSync.test.ts`

Adicionar testes para:
- Nenhuma linha não-comentário >160 chars
- Profile add não contém dns-name/login-by/timeouts
- on-event strings são curtas (`/system script run ...`)
- JSON body construído via múltiplos `:set`

## Exemplo de Saída Esperada (Linha 115 após correção)

```routeros
# Linha 1: ~85 chars
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1
} on-error={:log info "NAVSPOT: profile possivelmente ja existe"}

# Linha 2: ~65 chars
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]

# Linhas 3-8: cada ~70-100 chars
:do { /ip hotspot profile set $_hsprof dns-name="engenharia-googlemarine.navspot.local" } on-error={}
:do { /ip hotspot profile set $_hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $_hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $_hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $_hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $_hsprof login-url=$fullUrl } on-error={}
```

## Checklist de Implementação

| Item | Descrição |
|------|-----------|
| VERSION 6.9.38 | Atualizar em generator, recovery, ScriptModal |
| Profile add curto | Apenas `name` + `hotspot-address` no add |
| Sets separados | dns-name, html-directory, login-by, timeouts, login-url |
| JSON incremental | 4 linhas de `:set body` em vez de 1 linha gigante |
| Schedulers curtos | `on-event="/system script run ..."` sem `:delay`/`:do` |
| Netwatch curto | `up-script="/system script run ..."` sem `:delay`/`:do` |
| Regra linter | `^(?!\s*#).{161,}$` para bloquear linhas longas |
| encodeURIComponent | Sanitizar hotspot.id na urlBase |
| Escape dnsName | `dnsName.replace(/"/g, '\\"')` |
| Testes | Validar todas as regras acima |

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.38.rsc
# Deve completar SEM erros de parsing

/ip hotspot profile print where name="hsprof-navspot"
# Deve mostrar todos os campos configurados

/log print where message~"NAVSPOT"
# Deve mostrar: INSTALACAO CONCLUIDA!
```

