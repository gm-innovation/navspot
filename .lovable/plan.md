

# v7.6.0: Template Sync Reescrito com Melhorias de Robustez

## Resumo

Substituir o template `sync` completo na tabela `script_templates` pelo template proposto pelo usuario, com uma correcao critica de escopo e bump de versao para 7.6.0.

## Correcao Critica: Escopo de Variaveis no create_user

O template proposto declara `$pw` e `$pr` dentro de blocos `:if ... do={} else={}`:

```text
:if ($p3 >= 0) do={
  :local pw [:pick $rest 0 $p3]       <-- escopo limitado ao bloco
  :local pr [:pick $rest ($p3 + 1)...]
} else={
  :local pw $rest                      <-- escopo limitado ao bloco
  :local pr "default"
}
/ip hotspot user add name=$un password=$pw profile=$pr   <-- $pw e $pr UNDEFINED aqui
```

**Solucao**: Declarar `$pw` e `$pr` ANTES do `:if`, e usar `:set` dentro dos blocos (mesmo padrao que `create_profile` usa para `$su`):

```text
:local pw $rest
:local pr "default"
:if ($p3 >= 0) do={
  :set pw [:pick $rest 0 $p3]
  :set pr [:pick $rest ($p3 + 1) [:len $rest]]
}
:do { /ip hotspot user remove [find name=$un] } on-error={}
/ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
```

## Melhorias Incluidas (do usuario)

1. **Safety cap (MAX_ACTIONS = 200)** - evita loops infinitos em payloads mal formados
2. **Log mais informativo** - inclui versao e numero de bytes
3. **Mensagem de warning** quando o cap e atingido
4. **Comentarios** nos handlers para legibilidade

## Template Final Completo

```text
:log info "NAVSPOT-SYNC v{{VERSION}}: START"
:global navspotSyncLock
:if ([:len $navspotSyncLock] = 0) do={ :set navspotSyncLock "0" }
:if ($navspotSyncLock = "1") do={ :log info "NAVSPOT-SYNC: locked"; :return }
:set navspotSyncLock "1"

:local tk "{{SYNC_TOKEN}}"
:local ac [:len [/ip hotspot active find]]
:local post ("{\"sync_token\":\"" . $tk . "\",\"active_count\":" . $ac . "}")

:do {
:local res [/tool fetch url="{{SYNC_URL}}" http-method=post http-data=$post http-header-field="Content-Type: application/json" as-value output=user]
:local body ($res->"data")
:log info ("NAVSPOT-SYNC: fetch returned " . [:len $body] . " bytes")

:local s [:find $body "[["]
:local e [:find $body "]]"]
:if (($s >= 0) && ($e > $s)) do={

:local a [:pick $body ($s + 2) $e]
:local pos 0
:local cnt 0
:local MAX_ACTIONS 200

:while ([:find $a ";" $pos] >= 0 && ($cnt < $MAX_ACTIONS)) do={
:local ep [:find $a ";" $pos]
:local ln [:pick $a $pos $ep]
:set pos ($ep + 1)

:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1 + 1) [:len $ln]]

:if ($c = "configure_hotspot_profile") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2 + 1) [:len $r]]
/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu
/ip hotspot profile set [find name="hsprof-navspot"] dns-name=$dn
/ip hotspot profile set [find name="hsprof-navspot"] login-by=cookie,http-pap,http-chap
:set cnt ($cnt + 1)
}
}

:if ($c = "create_user") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local un [:pick $r 0 $p2]
:local rest [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $rest "|"]
:local pw $rest
:local pr "default"
:if ($p3 >= 0) do={
:set pw [:pick $rest 0 $p3]
:set pr [:pick $rest ($p3 + 1) [:len $rest]]
}
:do { /ip hotspot user remove [find name=$un] } on-error={}
/ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
:set cnt ($cnt + 1)
}
}

:if ($c = "create_profile") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local n [:pick $r 0 $p2]
:local rt [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $rt "|"]
:local su "1"
:if ($p3 >= 0) do={
:set su [:pick $rt ($p3 + 1) [:len $rt]]
:set rt [:pick $rt 0 $p3]
}
:do { /ip hotspot user profile remove [find name=$n] } on-error={}
/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$su
:set cnt ($cnt + 1)
}
}

:if ($c = "remove_user") do={
:do { /ip hotspot user remove [find name=$r] } on-error={}
:set cnt ($cnt + 1)
}

:if ($c = "disable_user") do={
:do { /ip hotspot user set [find name=$r] disabled=yes } on-error={}
:set cnt ($cnt + 1)
}

:if ($c = "enable_user") do={
:do { /ip hotspot user set [find name=$r] disabled=no } on-error={}
:set cnt ($cnt + 1)
}

}
}

:if ($cnt >= $MAX_ACTIONS) do={
:log warning ("NAVSPOT-SYNC: action cap reached (" . $MAX_ACTIONS . "), further actions deferred")
}

:log info ("NAVSPOT-SYNC: OK - " . $cnt . " actions processed")
} else={
:log info "NAVSPOT-SYNC: no actions"
}
} on-error={
:log error "NAVSPOT-SYNC: fetch or processing failed"
:set navspotSyncLock "0"
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v{{VERSION}}: END"
```

## Diferencas vs Template do Usuario

1. **create_user**: `$pw` e `$pr` declarados ANTES do `:if ($p3>=0)` com valores default, e `:set` dentro do bloco (correcao de escopo)
2. Todo o resto: identico ao proposto pelo usuario

## Alteracoes nos Arquivos

### 1. Bump de versao para 7.6.0

- `supabase/functions/mt-scripts/index.ts`: VERSION "7.5.2" -> "7.6.0"
- `supabase/functions/mikrotik-script-generator/index.ts`: VERSION "7.5.2" -> "7.6.0"

### 2. SQL Migration

UPDATE da tabela `script_templates` com o template completo acima, usando dollar quoting `$ts$...$ts$`.

### 3. Deploy e teste

1. Atualizar VERSION nos 2 edge functions
2. Executar SQL migration
3. Deploy mt-scripts e mikrotik-script-generator
4. No MikroTik: `/import navspot-bootstrap-v7.6.0.rsc` ou `/system script run navspot-guardian`
5. Verificar: `/system script run navspot-sync` -- sem parse errors
6. Validar logs: `/log print where message~"NAVSPOT-SYNC"`

