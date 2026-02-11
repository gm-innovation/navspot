

# Fix: Reduzir Nesting dos Handlers no Sync Template (v7.5.1)

## Problema Real

O parse error NAO era apenas por multiplas propriedades no mesmo comando. O problema fundamental e o **nivel de aninhamento (nesting) L6**, que excede o limite do hAP ax2 (maximo L5).

Todos os handlers que usam `:if ($p2>=0) do={...}` como bloco multi-linha criam um nivel extra de nesting, empurrando os comandos executaveis para L6.

Handlers afetados:
- `configure_hotspot_profile` (L6 - causa o crash na linha 41)
- `create_user` (L6 - tambem vai crashar)
- `create_profile` (L6 - tambem vai crashar)

Handlers nao afetados (ficam em L5):
- `remove_user`, `disable_user`, `enable_user` - nao tem o `:if ($p2>=0) do={}` extra

## Solucao: Inline Guard Pattern

Converter os blocos `:if ($p2>=0) do={...multi-linha...}` em guards inline de uma unica linha, seguidos de comandos flat. Isso elimina 1 nivel de nesting.

### Antes (L6 - CRASH):
```text
:if ($c="configure_hotspot_profile") do={       L4
:local p2 [:find $r "|"]
:if ($p2>=0) do={                               L5
:local lu [:pick $r 0 $p2]
:do {/ip hotspot profile set ... login-url=$lu} on-error={}   L6 CRASH
}}
```

### Depois (L5 - OK):
```text
:if ($c="configure_hotspot_profile") do={       L4
:local p2 [:find $r "|"]
:local lu ""
:local dn ""
:if ($p2>=0) do={:set lu [:pick $r 0 $p2];:set dn [:pick $r ($p2+1) [:len $r]]}   L5 inline (apenas :set)
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu} on-error={}   L5
:do {/ip hotspot profile set [find name="hsprof-navspot"] dns-name=$dn} on-error={}    L5
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-by=$lby} on-error={}   L5
:set cnt ($cnt+1)
}
```

A mesma tecnica sera aplicada aos handlers `create_user` e `create_profile`.

## Alteracoes

### 1. Bump de versao para 7.5.1

Arquivos:
- `supabase/functions/mt-scripts/index.ts`: VERSION "7.5.0" -> "7.5.1"
- `supabase/functions/mikrotik-script-generator/index.ts`: VERSION "7.5.0" -> "7.5.1"

### 2. SQL Migration - Atualizar template sync

Atualizar a tabela `script_templates` com o template corrigido, aplicando o Inline Guard Pattern nos 3 handlers afetados:

**configure_hotspot_profile:**
```text
:if ($c="configure_hotspot_profile") do={
:local p2 [:find $r "|"]
:local lu ""
:local dn ""
:if ($p2>=0) do={:set lu [:pick $r 0 $p2];:set dn [:pick $r ($p2+1) [:len $r]]}
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu} on-error={}
:do {/ip hotspot profile set [find name="hsprof-navspot"] dns-name=$dn} on-error={}
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-by=$lby} on-error={}
:set cnt ($cnt+1)
}
```

**create_user:**
```text
:if ($c="create_user") do={
:local p2 [:find $r "|"]
:local un $r
:local pw ""
:local pr "default"
:if ($p2>=0) do={:set un [:pick $r 0 $p2];:set pw [:pick $r ($p2+1) [:len $r]];:local p3 [:find $pw "|"];:if ($p3>=0) do={:set pr [:pick $pw ($p3+1) [:len $pw]];:set pw [:pick $pw 0 $p3]}}
:do {/ip hotspot user remove [find name=$un]} on-error={}
:do {/ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"} on-error={}
:set cnt ($cnt+1)
}
```

**create_profile:**
```text
:if ($c="create_profile") do={
:local p2 [:find $r "|"]
:local n $r
:local rt ""
:local su "1"
:if ($p2>=0) do={:set n [:pick $r 0 $p2];:set rt [:pick $r ($p2+1) [:len $r]];:local p3 [:find $rt "|"];:if ($p3>=0) do={:set su [:pick $rt ($p3+1) [:len $rt]];:set rt [:pick $rt 0 $p3]}}
:do {/ip hotspot user profile remove [find name=$n]} on-error={}
:do {/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$su} on-error={}
:set cnt ($cnt+1)
}
```

### 3. Deploy e teste

1. Atualizar VERSION nos 2 edge functions
2. Executar SQL migration
3. Deploy mt-scripts e mikrotik-script-generator
4. No MikroTik: `/system script run navspot-guardian` para forcar re-download v7.5.1
5. Verificar: `/system script run navspot-sync` — deve executar sem parse error

## Detalhes Tecnicos

- A tecnica "Inline Guard" mantem a logica de validacao ($p2>=0) mas como statement de uma unica linha, sem abrir um bloco multi-linha
- Os comandos `:set` dentro do guard inline nao tem sub-expressoes complexas como `[find]`, entao sao seguros mesmo em L5
- Os comandos executaveis (`/ip hotspot profile set`, `/ip hotspot user add`) ficam em L5, dentro do limite do hAP ax2
- Dollar quoting ($ts$...$ts$) sera usado na migration SQL

