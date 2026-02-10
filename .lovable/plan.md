

# Fix: Hoisting do Sync Fallback + Split AP Core/Full (v7.2.0)

## Problema

O comando `/ip hotspot profile set` no fallback do sync (linhas 910-913) esta no nivel 10 de aninhamento, causando `expected end of command` no RouterOS 7.

## 3 Mudancas no arquivo `supabase/functions/mikrotik-scripts/index.ts`

### Mudanca 1: Sync Fallback -- Hoisting (generateSyncSource)

**Adicionar variaveis no nivel 1** (apos linha 780, junto com `:local lby`):

```routeros
:local fbLu ""
:local fbDn ""
:local fbHp ""
```

**Substituir bloco profundo (linhas 910-915)** -- em vez de executar `/set` no nivel 10, apenas salvar nas variaveis:

```routeros
:if ([:len $hp] > 0) do={
:set fbLu $lu
:set fbDn $dn
:set fbHp $hp
:do {/file remove "navspot-actions.txt"} on-error={}
} else={
:log error "NAVSPOT-SYNC: fallback - hotspot profile not found"
}
```

**Adicionar bloco de aplicacao no nivel 1** (antes da linha 938 `:set navspotSyncLock "0"`):

```routeros
:if ([:len $fbHp] > 0) do={
/ip hotspot profile set $fbHp login-url=$fbLu
/ip hotspot profile set $fbHp dns-name=$fbDn
/ip hotspot profile set $fbHp login-by=$lby
:log info "NAVSPOT-SYNC: Fallback aplicado com sucesso"
}
```

Os comandos `/set` executam agora no nivel 2 (dentro de um unico `:if` apos o bloco `:do`).

### Mudanca 2: AP Core -- Split "Um Comando, Uma Propriedade" (linha 1004)

De:
```routeros
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
```

Para:
```routeros
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
```

Esta no nivel 9 (borderline). Separar segue a regra de ouro e reduz risco.

### Mudanca 3: AP Full -- Mesmo split (linha 1132)

De:
```routeros
/ip hotspot profile set $hp login-url=$lu dns-name=$dn
```

Para:
```routeros
/ip hotspot profile set $hp login-url=$lu
/ip hotspot profile set $hp dns-name=$dn
```

## Inicializacao das variaveis

Conforme a dica, todas as variaveis de fallback sao inicializadas com `""` no topo:
- `:local fbLu ""` -- login-url (vazio ate o fallback preencher)
- `:local fbDn ""` -- dns-name (vazio ate o fallback preencher)
- `:local fbHp ""` -- hotspot profile ID (vazio ate o fallback preencher)
- `:local lby "cookie,http-pap,http-chap"` -- ja existe na linha 780

O bloco de aplicacao so executa se `fbHp` nao for vazio (`[:len $fbHp] > 0`), garantindo que variaveis `""` nunca sejam passadas para `/set`.

## Verificacao Pos-Deploy

1. `/system script run navspot-sync` -- log deve mostrar `NAVSPOT-SYNC v7.2.0: OK`
2. Se AP ausente/falhar: log deve mostrar `NAVSPOT-SYNC: Fallback aplicado com sucesso`
3. `/ip hotspot profile print detail` -- confirmar `login-url` e `login-by` corretos

## Resumo

| Local | Linhas | Problema | Fix |
|-------|--------|----------|-----|
| Sync fallback | 780, 910-915, antes 938 | `/set` no nivel 10 | Hoisting: extrair no 10, aplicar no 2 |
| AP Core | 1004 | 2 props em 1 cmd no nivel 9 | Split em 2 comandos |
| AP Full | 1132 | 2 props em 1 cmd no nivel 9 | Split em 2 comandos |

