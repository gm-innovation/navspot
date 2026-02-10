

# Fix Completo: AP `[:tostr $error]` + Fallback Robusto com `fbActions` + Escopo `lby`

## Problema Atual

1. **AP crash de parse**: As 3 instâncias de `[:tostr $error]` (linhas 353, 1070, 1240) causam crash de parse no RouterOS 7 antes mesmo de o script executar
2. **Fallback lê arquivo deletado**: O fallback (linha 896) tenta re-ler `navspot-actions.txt` que o AP já deletou
3. **`lby` fora de escopo**: A variável `lby` está declarada na linha 783 (dentro do `:do`), mas usada na linha 943 (fora do `:do`)

## 7 Mudanças no arquivo `supabase/functions/mikrotik-scripts/index.ts`

### Mudança 1: Hoisting de `lby` e `fbActions` (linhas 751-753)

Adicionar `lby` e `fbActions` junto com as variáveis já hoisted:

```routeros
:local fbLu ""
:local fbDn ""
:local fbHp ""
:local fbActions ""
:local lby "cookie,http-pap,http-chap"
```

### Mudança 2: Remover declaração duplicada de `lby` (linha 783)

Remover a linha `:local lby "cookie,http-pap,http-chap"` de dentro do bloco `:do`, pois agora está no nível 1.

### Mudança 3: Salvar `fbActions` quando ações são extraídas (linha 853)

Após `[:len $a]>0`, inserir:

```routeros
:if ([:len $a]>0) do={
:set fbActions $a
:log info ("NAVSPOT-SYNC: fbActions len=" . [:len $fbActions])
```

### Mudança 4: Fallback usa `$fbActions` em vez de re-ler arquivo (linhas 895-896)

De:
```routeros
:local full ""
:do {:set full [/file get "navspot-actions.txt" contents]} on-error={:set full ""}
```

Para:
```routeros
:local full $fbActions
```

### Mudança 5: Bloco hoisted com limpeza e proteção `[:len]` (linhas 940-945)

De:
```routeros
:if ([:len $fbHp] > 0) do={
/ip hotspot profile set $fbHp login-url=$fbLu
/ip hotspot profile set $fbHp dns-name=$fbDn
/ip hotspot profile set $fbHp login-by=$lby
:log info "NAVSPOT-SYNC: Fallback aplicado com sucesso"
}
```

Para:
```routeros
:if ([:len $fbHp] > 0) do={
:if ([:len $fbLu] > 10) do={ /ip hotspot profile set $fbHp login-url=$fbLu }
:if ([:len $fbDn] > 0) do={ /ip hotspot profile set $fbHp dns-name=$fbDn }
/ip hotspot profile set $fbHp login-by=$lby
:log info "NAVSPOT-SYNC: Fallback aplicado com sucesso (hoisted)"
:set fbActions ""
:set fbLu ""
:set fbDn ""
:set fbHp ""
}
```

### Mudança 6: AP Core -- Remover `[:tostr $error]` (linha 1070)

De:
```routeros
} on-error={:log error ("NS-AP: CRASH=" . [:tostr $error])}
```

Para:
```routeros
} on-error={:log error "NS-AP: action processing error"}
```

### Mudança 7: AP Full -- Remover `[:tostr $error]` (linha 1240)

Mesma substituição que a Mudança 6.

### Mudança 8: Bootstrap Fallback AP -- Remover `[:tostr $error]` (linha 353)

Mesma substituição que a Mudança 6.

## Resumo

| # | Local | Linhas | Fix |
|---|-------|--------|-----|
| 1 | Sync hoisting | 751-753 | Adicionar `fbActions` e `lby` |
| 2 | Sync interior | 783 | Remover `lby` duplicado |
| 3 | Sync interior | 853 | Salvar `fbActions` + log |
| 4 | Sync fallback | 895-896 | Usar `$fbActions` |
| 5 | Sync hoisted | 940-945 | Proteção `[:len]`, limpeza, log |
| 6 | AP Core | 1070 | Remover `[:tostr $error]` |
| 7 | AP Full | 1240 | Remover `[:tostr $error]` |
| 8 | Bootstrap Fallback | 353 | Remover `[:tostr $error]` |

## Verificação Pós-Deploy

1. Re-importar bootstrap ou usar "Atualizar Scripts"
2. `/system script run navspot-sync` -- log deve mostrar `NAVSPOT-ACTION v7.2.0` e `OK`
3. Se AP falhar, log deve mostrar `Fallback aplicado com sucesso (hoisted)`
4. `/ip hotspot profile print detail` -- confirmar `login-url`, `dns-name`, `login-by`
