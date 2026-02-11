

# v7.3.0: Eliminacao do Action Processor - Tudo Inline no Sync

## Resumo

Eliminar completamente o `navspot-action-processor` como script separado. O sync recebe a resposta da API e processa as acoes diretamente na variavel, sem escrever arquivo intermediario. Isso remove toda a complexidade que causa crashes no hAP ax2.

## O que sera REMOVIDO

### Funcoes removidas de `mikrotik-scripts/index.ts`:
- `generateActionProcessorCoreSource()` (linhas 915-1027, ~112 linhas)
- `generateActionProcessorFullSource()` (linhas 1046-1199, ~153 linhas)
- `generateActionAuxSource()` (linhas 1211-1310, ~100 linhas)
- `generateActionProcessorScript()` (linhas 655-660)
- `generateActionProcessorRSC()` (linhas 680-685)

### Endpoints removidos do switch:
- `action-raw` (linhas 199-205)
- `action-aux-raw` (linhas 207-209)
- `action-processor` (linhas 219-220)
- `action-source` (linhas 228-229)

### Bloco removido do installer (`generateAllScripts`):
- Secao 2 inteira: download do action-processor (linhas 434-500, ~66 linhas)
- Secao 2.1 inteira: smoke test + fallback (linhas 502-545, ~43 linhas)
- `fallbackSource` e `escapedFallback` (linhas 291-323)
- Referencias ao action-processor nos logs finais

### Simplificacao do Guardian:
- Remover verificacao de `apScript` (action-processor nao existe mais)
- Remover verificacao de `configure_hotspot_profile` no source do AP

## O que sera ADICIONADO/MODIFICADO

### `generateSyncSource()` - Novo fluxo inline

O sync atual (linhas 703-897) sera reescrito. A parte de coleta de telemetria (steps 1-5, fetch) permanece identica. A mudanca e APENAS no processamento pos-resposta.

**Antes** (linhas 815-863): escreve arquivo, chama AP separado, trata erros, fallback hoisted

**Depois**: processa acoes diretamente da variavel `$a`, sem arquivo intermediario

Estrutura do novo processamento (seguindo as sugestoes do usuario):

```text
# Apos extrair $a do marcador [[ ... ]]
:if ([:len $a]>0) do={
:local pos 0
:local cnt 0
:local lby "cookie,http-pap,http-chap"
:while ([:find $a ";" $pos] >= 0) do={
:local ep [:find $a ";" $pos]
:local ln [:pick $a $pos $ep]
:set pos ($ep + 1)
:if ([:len $ln] > 0) do={
:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1+1) [:len $ln]]
:if ($c = "configure_hotspot_profile") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2 + 1) [:len $r]]
/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu dns-name=$dn login-by=$lby
:log info "NAVSPOT-SYNC: cfg-hp applied"
:set cnt ($cnt+1)
}
}
:if ($c = "create_profile") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local rt ""
:local sh "1"
:if ($p3>=0) do={:set rt [:pick $sub 0 $p3];:set sh [:pick $sub ($p3+1) [:len $sub]]} else={:set rt $sub}
:local ex [/ip hotspot user profile find name=$n]
:if ([:len $ex]>0) do={
:if ([:len $rt]>0) do={/ip hotspot user profile set $ex rate-limit=$rt}
/ip hotspot user profile set $ex shared-users=$sh
} else={
:if ([:len $rt]>0) do={/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$sh} else={/ip hotspot user profile add name=$n shared-users=$sh}
}
:set cnt ($cnt+1)
}
} on-error={}}
:if ($c = "create_user") do={
:do {
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local sub [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3>=0) do={:set pw [:pick $sub 0 $p3];:set pf [:pick $sub ($p3+1) [:len $sub]]} else={:set pw $sub}
:if ([:len $pf]=0) do={:set pf "default"}
:do {/ip hotspot user profile add name=$pf} on-error={}
:local ex [/ip hotspot user find name=$un]
:if ([:len $ex]>0) do={
:if ([:len $pw]>0) do={/ip hotspot user set $ex password=$pw}
:if ($pf!="default") do={/ip hotspot user set $ex profile=$pf}
} else={
:if ([:len $pw]>0) do={/ip hotspot user add name=$un password=$pw profile=$pf comment="navspot"}
}
:set cnt ($cnt+1)
}
} on-error={}}
:if (($c="create_whitelist_domain")||($c="add_whitelist_domain")) do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local wg [/ip hotspot walled-garden find dst-host~$dom]
:if ([:len $wg]=0) do={/ip hotspot walled-garden add dst-host=("*".$dom."*") action=allow comment="navspot";:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="add_firewall_block") do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-BLOCK-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={/ip firewall filter add chain=forward content=$dom action=drop comment=$cm place-before=0;:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="add_firewall_allow") do={
:do {
:local dom $r
:local p2 [:find $r "|"]
:if ($p2>=0) do={:set dom [:pick $r ($p2+1) [:len $r]]}
:if ([:len $dom]>0) do={
:local cm ("NAVSPOT-ALLOW-".$dom)
:local ex [/ip firewall filter find comment=$cm]
:if ([:len $ex]=0) do={/ip firewall filter add chain=forward content=$dom action=accept comment=$cm place-before=0;:set cnt ($cnt+1)}
}} on-error={}}
:if ($c="remove_user") do={
:do {:if ([:len $r]>0) do={:local ex [/ip hotspot user find name=$r];:if ([:len $ex]>0) do={/ip hotspot user remove $ex;:set cnt ($cnt+1)}}} on-error={}}
:if ($c="disable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=yes;:set cnt ($cnt+1)}} on-error={}}
:if ($c="enable_user") do={
:do {:if ([:len $r]>0) do={/ip hotspot user set [find name=$r] disabled=no;:set cnt ($cnt+1)}} on-error={}}
:if ($c="kick_session") do={
:do {:local p2 [:find $r "|"];:if ($p2>=0) do={:local mac [:pick $r ($p2+1) [:len $r]];:if ([:len $mac]>0) do={/ip hotspot active remove [find mac-address=$mac];:set cnt ($cnt+1)}}} on-error={}}
}}}
:log info ("NAVSPOT-SYNC: processed " . $cnt . " actions")
# Protecao de memoria (sugestao B)
:set a ""
:set raw ""
}
```

Pontos criticos incorporados das sugestoes:

- **A. Parsing achatado**: Todos os handlers usam `:if` independentes (nunca `else if`), mantendo nesting constante
- **B. Protecao de memoria**: `$a` e `$raw` sao limpos ao final com `:set a ""`/`:set raw ""`
- **C. Handler configure_hotspot_profile**: Trata dns-name vazio implicitamente (se `$p2 >= 0` garante que ha separador)

### Nesting maximo do novo sync

O fluxo completo:
- L0: main `:do { } on-error={}`
- L1: `:if ($ok) do={}`
- L2: `:if (markers found) do={}`
- L3: `:if ([:len $a]>0) do={}`
- L4: `:while (find ";" $pos) do={}`
- L5: `:if ([:len $ln]>0) do={}`
- L6: `:if ($p1>=0) do={}`
- L7: `:if ($c="handler") do={}` (cada handler independente)

Dentro de cada handler: +1-2 niveis para parsing de parametros = L8-L9 no pior caso.

**IMPORTANTE**: Isso e mais profundo que L6 do hAP ax2 -- mas a diferenca crucial e que NAO HA SCRIPT SEPARADO sendo chamado via `/system script run`. O crash do AP era no PARSE do script separado (5.6KB), nao no nesting do sync. O sync atual ja funciona perfeitamente ate a linha 833 (nesting L5) com 8KB.

Para manter seguranca, podemos envolver cada handler em `:do { } on-error={}` que ja esta no plano acima.

### `generateAllScripts()` - Installer simplificado

O installer passara de ~310 linhas para ~200 linhas:
1. Secao 1 (sync): permanece igual
2. Secao 2 (action-processor): **REMOVIDA INTEIRAMENTE**
3. Secao 2.1 (smoke test + fallback): **REMOVIDA INTEIRAMENTE**
4. Secao 3 (guardian): permanece igual
5. Secao 4 (schedulers): permanece igual
6. Secao 5 (netwatch): permanece igual
7. Secao 6 (primeiro sync): permanece igual
8. Logs finais: atualizar para "Scripts: navspot-sync, navspot-guardian" (sem action-processor)
9. Bootstrap cleanup: remover `navspot-action-processor` do cleanup

### `generateGuardianSource()` - Simplificado

Remover:
- `:local apScript [/system script find name="navspot-action-processor"]` 
- Verificacao de apScript missing
- Verificacao de `configure_hotspot_profile` no source do AP

Manter:
- Verificacao de sync script
- Verificacao de scheduler
- Verificacao de login-url
- Verificacao de login-by (http-pap)
- Recovery via fetch

### `mikrotik-script-generator/index.ts` - Bootstrap cleanup

Na funcao `generateBootstrapScript`:
- Remover `:do { /system script remove [find where name=navspot-action-processor] } on-error={}`
- VERSION -> 7.3.0

### Constantes de configuracao

Remover `ROSConfig.useFullActionProcessor` (nao ha mais action-processor).
Simplificar `ROSConfig` para conter apenas delays.

## Arquivos modificados

1. **`supabase/functions/mikrotik-scripts/index.ts`**: Reescrita significativa (~600 linhas finais vs 1356 atuais)
2. **`supabase/functions/mikrotik-script-generator/index.ts`**: VERSION + remover cleanup do AP no bootstrap

## Resultado esperado no roteador

1. Bootstrap instala apenas 2 scripts: `navspot-sync` + `navspot-guardian`
2. Primeiro sync roda, recebe acoes da API
3. Processa INLINE: `configure_hotspot_profile`, `create_profile`, `create_user`, etc.
4. Log: `NAVSPOT-SYNC v7.3.0: processed 15 actions`
5. Log: `NAVSPOT-SYNC v7.3.0: OK`
6. `login-url` e `dns-name` aplicados
7. Portal captivo funcional

Zero crashes porque nao ha script separado sendo parseado.

