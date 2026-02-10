

# Fix: Hoisting do `configure_hotspot_profile` no AP + Smoke Test + Sync on-error

## Diagnostico

O Action Processor (AP) tem os comandos `/ip hotspot profile set` no handler `configure_hotspot_profile` no nivel 9 de aninhamento. O RouterOS 7 se torna instavel em comandos `/set` a partir do nivel 8-9. Os logs confirmam que "NAVSPOT-ACTION v7.2.0" nunca aparece -- o AP crasheia durante o parse/execucao.

Adicionalmente:
- O smoke test do instalador usa `[:tostr $error]` (linha 562), que retorna string vazia no ROS 7, mascarando a falha do AP
- O on-error do sync (linha 941) concatena `$step` que pode causar crash secundario

## 5 Mudancas no arquivo `supabase/functions/mikrotik-scripts/index.ts`

### Mudanca 1: AP CORE -- Hoisting do configure_hotspot_profile

Na funcao `generateActionProcessorCoreSource()` (linha 971):

**Declarar variaveis de hoisting no nivel 0** (antes do `:do {` na linha 995):

```routeros
:local cfgHp ""
:local cfgLu ""
:local cfgDn ""
```

**Dentro do handler** (linhas 1005-1023), substituir a execucao direta dos `/set` por captura em variaveis:

De (linhas 1017-1022):
```routeros
:if ([:len $hp]>0) do={
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
/ip hotspot profile set $hp login-by=$lby
:log info ("NAVSPOT: login-by=" . $lby . " aplicado em ".[/ip hotspot profile get $hp name])
:set cnt ($cnt+1)
```

Para:
```routeros
:if ([:len $hp]>0) do={:set cfgHp $hp;:set cfgLu $lu;:set cfgDn $dn;:set cnt ($cnt+1)}
```

**Apos o bloco** `} on-error={...}` (apos linha 1076), adicionar bloco de aplicacao no nivel 1:

```routeros
:if ([:len $cfgHp]>0) do={
/ip hotspot profile set $cfgHp login-url=$cfgLu
/ip hotspot profile set $cfgHp dns-name=$cfgDn
/ip hotspot profile set $cfgHp login-by=$lby
:log info ("NAVSPOT: cfg-hp applied on " . [/ip hotspot profile get $cfgHp name])
}
```

### Mudanca 2: AP FULL -- Mesmo hoisting

Na funcao `generateActionProcessorFullSource()` (linha 1098), aplicar identica transformacao:

- Declarar `cfgHp`, `cfgLu`, `cfgDn` antes do `:do {` (linha 1124)
- No handler (linhas 1146-1151), capturar em vez de executar
- Apos `} on-error={...}` (linha 1246), aplicar no nivel 1

### Mudanca 3: Installer Smoke Test -- Corrigir deteccao de erro

Linhas 558-564: Substituir `[:tostr $error]` por string estatica para garantir que o instalador detecte a falha do AP.

De:
```routeros
:set smokeErr [:tostr $error]
:log error ("NAVSPOT-INSTALL: smoke test ERRO=" . $smokeErr)
```

Para:
```routeros
:set smokeErr "script_error"
:log error "NAVSPOT-INSTALL: smoke test ERRO detectado"
```

### Mudanca 4: Sync on-error -- String estatica

Linha 941: Substituir concatenacao com `$step` por string estatica.

De:
```routeros
} on-error={:log error ("NAVSPOT-SYNC: CRASH step=" . $step);:set navspotSyncLock "0"}
```

Para:
```routeros
} on-error={:log error "NAVSPOT-SYNC: CRASH in main block";:set navspotSyncLock "0"}
```

### Mudanca 5: Delay antes de disparar AP

Linha 868 (apos escrever navspot-actions.txt e antes de rodar o AP): adicionar um delay de 300ms para dar tempo ao filesystem.

Localizar o ponto onde o script executa `/system script run navspot-action-processor` e inserir `:delay 300ms` antes dele.

## Resumo

| # | Local | Problema | Fix |
|---|-------|----------|-----|
| 1 | AP CORE handler cfg-hp | `/set` no nivel 9 | Hoisting: capturar no 9, aplicar no 1 |
| 2 | AP FULL handler cfg-hp | `/set` no nivel 9 | Hoisting: capturar no 9, aplicar no 1 |
| 3 | Installer smoke test | `[:tostr $error]` vazio | String estatica "script_error" |
| 4 | Sync on-error | Concatenacao instavel | String estatica |
| 5 | Sync pre-AP | Race condition filesystem | Delay 300ms antes de rodar AP |

## Detalhes Tecnicos

### Contagem de niveis no AP (configure_hotspot_profile) -- ANTES

```text
Level 0: :do {
Level 1:   :while
Level 2:     :if ([:len $ln]>0)
Level 3:       :if ($p1>=0)
Level 4:         :if ($c="configure_hotspot_profile")
Level 5:           :do {
Level 6:             :if ($p2>=0)
Level 7:               :if (([:len $lu]>0)&&...)
Level 8:                 :if ([:len $hp]>0)
Level 9:                   /ip hotspot profile set  <-- CRASH
```

### Contagem de niveis -- DEPOIS

```text
Level 0: :do { ... }
Level 0: :if ([:len $cfgHp]>0)
Level 1:   /ip hotspot profile set  <-- OK
```

## Verificacao Pos-Deploy

1. Re-importar bootstrap: `/import navspot-bootstrap-v7.2.0.rsc`
2. Smoke test deve DETECTAR erros reais (se houver) e instalar fallback
3. `/system script run navspot-sync` -- logs esperados:
   - `NAVSPOT-ACTION v7.2.0` (AP inicia)
   - `NS-AP: cfg-hp` (handler captura valores)
   - `NAVSPOT: cfg-hp applied on hsprof-navspot` (hoisted aplica)
   - `NAVSPOT-ACTION v7.2.0: OK - 1` (AP completa)
   - `NAVSPOT-SYNC v7.2.0: OK` (sync completa)
4. `/ip hotspot profile print detail` -- confirmar `login-url`, `dns-name`, `login-by`

