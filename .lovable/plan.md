

# Fix v7.2.5: Simplificacao Radical

## O Problema Real

A API funciona. O sync recebe dados (654-914 bytes de acoes). Mas o roteador nao consegue PROCESSAR porque os scripts sao complexos demais para o hAP ax2.

Dois crashes simultaneos:
1. Fallback AP crasheia no PARSE (Start nunca aparece)
2. Sync crasheia silenciosamente apos "AP threw runtime error" (OK nunca aparece, fallback hoisted nunca roda)

## Solucao: 2 mudancas cirurgicas

### Mudanca 1: Fallback AP ultra-minimal (sem loop)

Substituir o Fallback AP inteiro (linhas 291-363 de mikrotik-scripts/index.ts) por ~25 linhas que fazem UMA coisa: encontrar `configure_hotspot_profile|` no texto e aplicar. Sem `:while`, sem multi-handler.

```text
:log info "NAVSPOT-ACTION v7.2.5F: Start"
:global navspotLock
:set navspotLock "1"
:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ :set navspotLock "0"; :return }
:local raw [/file get $fid contents]
:do { /file remove $fid } on-error={}
:local marker "configure_hotspot_profile|"
:local mpos [:find $raw $marker]
:if ([:typeof $mpos] = "nil") do={ :set navspotLock "0"; :log info "NAVSPOT-ACTION v7.2.5F: no cfg-hp"; :return }
:local rest [:pick $raw ($mpos + [:len $marker]) [:len $raw]]
:local sem [:find $rest ";"]
:if ($sem >= 0) do={ :set rest [:pick $rest 0 $sem] }
:local psep [:find $rest "|"]
:if ([:typeof $psep] = "nil") do={ :set navspotLock "0"; :return }
:local lu [:pick $rest 0 $psep]
:local dn [:pick $rest ($psep + 1) [:len $rest]]
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hp] > 0) do={
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
/ip hotspot profile set $hp login-by=cookie,http-pap,http-chap
:log info ("NAVSPOT: cfg-hp applied on " . [/ip hotspot profile get $hp name])
}
:set navspotLock "0"
:log info "NAVSPOT-ACTION v7.2.5F: OK"
```

Max nesting: **L1**. Impossivel crashear por complexidade.

Nao processa create_profile nem create_user -- esses serao tratados em syncs futuros quando profiles/users forem reconciliados pela API.

### Mudanca 2: Sync pos-AP simplificado (linhas 895-912)

Substituir o bloco L7 por logica plana:

Antes (crasheia silenciosamente):
```text
:if ($apRan = true) do={           # L6
  :if ($afterSize = 0) do={        # L7 <-- CRASH
    :log info "..."
  } else={                         # L7
    :log warning "..."
  }
}
:if (($apRan = false) || ($afterSize > 0)) do={  # L6
  :do {/file remove ...} on-error={}              # L7 <-- CRASH
}
```

Depois (max L5):
```text
:delay 300ms
:do {/file remove "navspot-actions.txt"} on-error={}
:if ($apRan = true) do={ :log info "NAVSPOT-SYNC: AP processed" }
:if ($apRan = false) do={ :log warning "NAVSPOT-SYNC: AP failed, fallback pending" }
```

Remove toda a logica de afterSize/actionsId2. Simplificacao brutal.

### Mudanca 3: VERSION 7.2.4 -> 7.2.5

Em ambos os arquivos:
- `supabase/functions/mikrotik-scripts/index.ts` linha 38
- `supabase/functions/mikrotik-script-generator/index.ts` linha 8

## Detalhes tecnicos

### Arquivo: supabase/functions/mikrotik-scripts/index.ts

1. **Linhas 291-363**: Substituir fallbackSource inteiro pelo script ultra-minimal acima
2. **Linhas 895-912**: Substituir bloco pos-AP por versao simplificada
3. **Linha 38**: VERSION "7.2.4" -> "7.2.5"

### Arquivo: supabase/functions/mikrotik-script-generator/index.ts

1. **Linha 8**: VERSION "7.2.4" -> "7.2.5"

## Resultado esperado

1. `NAVSPOT-ACTION v7.2.5F: Start` aparece (parse OK - impossivel falhar com L1)
2. `NAVSPOT: cfg-hp applied on hsprof-navspot` aparece (login-url e dns-name aplicados)
3. `NAVSPOT-SYNC v7.2.5: OK` aparece (sync completa normalmente)
4. `Fallback aplicado com sucesso (hoisted)` aparece (codigo hoisted finalmente alcancado)
5. Portal captivo funcional com login-url correto

## O que NAO sera processado pelo Fallback

- create_profile: profiles serao criados via reconciliacao no proximo sync quando o portal estiver funcional
- create_user: usuarios serao reconciliados automaticamente pela API
- add_whitelist_domain: walled garden ja configurado no bootstrap

Isso esta 100% alinhado com a arquitetura thin-client: o hardware faz o minimo, a API cuida do resto.

