

# Fix v7.2.3b: Reduzir nesting para Level 6 (limite real do hAP ax2)

## Diagnostico

O hAP ax2 com RouterOS 7.14.3 tem limite pratico de **Level 6** (nao 7). Evidencia: `NAVSPOT-ACTION v7.2.3F: Start` nunca aparece nos logs -- o script crasheia no PARSE antes de executar qualquer linha.

## 3 Mudancas Cirurgicas

Todas no arquivo `supabase/functions/mikrotik-scripts/index.ts`.

### Mudanca 1: Fallback AP -- remover wrapper `:do {} on-error={}` (linhas 315 e 357)

Remover a linha 315 (`:do {`) e a linha 357 (`} on-error={:log error "NS-AP: action processing error"}`).

Isso reduz TODOS os handlers do Fallback AP em 1 nivel:

| Handler | Antes | Depois |
|---------|-------|--------|
| configure_hotspot_profile | L7 | **L6** |
| create_profile | L6 | **L5** |
| create_user | L7 | **L6** |

### Mudanca 2: Full AP -- remover wrapper + achatar create_profile (linhas 1137, 1161-1180, 1254)

- Remover linha 1137 (`:do {`) e linha 1254 (`} on-error={...}`)
- Achatar `create_profile` (linhas 1161-1180): remover sub-parsing aninhado de `shared-users` (que atinge L9), simplificar para parsing direto em uma unica linha

Isso reduz o Full AP para max L7, aumentando a chance de passar o smoke test. Se ainda falhar, o Fallback a L6 sera usado.

### Mudanca 3: Sync Inline Fallback -- mover parsing para FORA do bloco profundo (linhas 908-934)

Remover todo o bloco de parsing de `configure_hotspot_profile` de dentro do `:if (($apRan = false) || ($afterSize > 0))` (que esta a L6 dentro do bloco principal). Substituir por logica simples que apenas limpa o arquivo de acoes.

Mover o parsing real para DEPOIS do `} on-error={}` (apos linha 947), no nivel L0, usando as variaveis hoisted `fbActions`:

```text
# Nivel L0 (apos o on-error):
:if (([:len $fbHp] = 0) && ([:len $fbActions] > 0)) do={    # L1
  :local marker "configure_hotspot_profile|"                  # L1
  :local mpos [:find $fbActions $marker]                      # L1
  :if ($mpos >= 0) do={                                       # L2
    ... parse payload ...                                     # L2-L3
    :if ([:len $hp] > 0) do={                                 # L3
      :set fbLu $lu; :set fbDn $dn; :set fbHp $hp            # L3
    }
  }
}
```

Max nivel: **L3**. Completamente seguro.

## Resumo final de niveis

| Componente | v7.2.3 (atual) | v7.2.3b | Status |
|------------|----------------|---------|--------|
| Fallback AP: configure_hotspot_profile | L7 (CRASH) | **L6** | OK |
| Fallback AP: create_profile | L6 | **L5** | OK |
| Fallback AP: create_user | L7 (CRASH) | **L6** | OK |
| Full AP: configure_hotspot_profile | L9 | **L8** | Smoke test decidira |
| Full AP: create_profile | L9 | **L7** | Smoke test decidira |
| Sync Inline Fallback | L8 | **L3** | OK |

## Verificacao esperada

Apos deploy + re-import:
1. `NAVSPOT-ACTION v7.2.3F: Start` aparece nos logs (parse OK)
2. `NAVSPOT: cfg-hp applied on hsprof-navspot` (config aplicada)
3. `dns-name` e `login-url` preenchidos no profile
4. Sem mais "AP threw runtime error" para o Fallback

## Detalhes tecnicos de cada mudanca

### Fallback AP (linhas 315-357)

Remover apenas 2 linhas:
- Linha 315: `:do {`
- Linha 357: `} on-error={:log error "NS-AP: action processing error"}`

O tratamento de erro individual de cada handler (`:do {} on-error={}` dentro de `create_user`, etc.) ja protege contra falhas. O wrapper externo e redundante e adiciona 1 nivel desnecessario.

### Full AP (linhas 1137-1254)

Remover wrapper externo:
- Linha 1137: `:do {`
- Linha 1254: `} on-error={:log error "NS-AP: action processing error"}`

Achatar `create_profile` (linhas 1161-1180): substituir o bloco com sub-parsing profundo (`:local sub2`, `:local p4`, `:if ($p4>=0)`) por versao simplificada que extrai rate-limit e shared-users em menos niveis, usando parsing em uma linha.

### Sync Inline Fallback (linhas 908-934)

Substituir o bloco inteiro por:
```routeros
:if (($apRan = false) || ($afterSize > 0)) do={
:do {/file remove "navspot-actions.txt"} on-error={}
}
```

E adicionar apos a linha 947 (apos `} on-error={...}`), antes do bloco hoisted existente (linha 948):
```routeros
:if (([:len $fbHp] = 0) && ([:len $fbActions] > 0)) do={
:local marker "configure_hotspot_profile|"
:local mpos [:find $fbActions $marker]
:if ($mpos >= 0) do={
:local sem [:find $fbActions ";" $mpos]
:local seg ""
:if ([:typeof $sem] = "nil") do={ :set seg [:pick $fbActions $mpos [:len $fbActions]] } else={ :set seg [:pick $fbActions $mpos $sem] }
:local pl [:len $marker]
:local payload [:pick $seg $pl [:len $seg]]
:local psep [:find $payload "|"]
:local lu ""
:local dn ""
:if ($psep >= 0) do={ :set lu [:pick $payload 0 $psep]; :set dn [:pick $payload ($psep + 1) [:len $payload]] }
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $hp] > 0) do={
:set fbLu $lu
:set fbDn $dn
:set fbHp $hp
}
}
}
```

