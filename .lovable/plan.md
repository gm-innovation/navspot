

# Fix v7.5.2: Hoist [find] para Eliminar Subexpressao em L5

## Causa Raiz Definitiva

O erro "expected end of command (line 43 column 59)" aponta para `login-url=` na linha:

```text
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu} on-error={}
                                                          ^-- col 59
```

O parser do ROS 7 no hAP ax2 interpreta `[find name="hsprof-navspot"]` como o argumento completo de `set`. Quando encontra `login-url=$lu` logo depois, nao sabe o que fazer e rejeita com "expected end of command".

Isso acontece porque `[find ...]` e uma **subexpressao** que, dentro de `:do {} on-error={}` em L5, esgota a capacidade de parsing do hardware. O problema NAO e o nivel de nesting em si, mas a combinacao de `:do {}` + `[find ...]` + propriedade no mesmo comando.

## Solucao: Hoist [find] para Variavel

Mover a chamada `[find]` para uma variavel local no nivel L4 (fora do `:do {}`). Isso elimina a subexpressao de dentro do bloco protegido.

### Antes (CRASH - subexpressao [find] dentro de :do {} em L5):
```text
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu} on-error={}
```

### Depois (OK - [find] hoisted para L4, :do {} usa variavel simples):
```text
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:do {/ip hotspot profile set $hp login-url=$lu} on-error={}
```

## Handlers Afetados

3 handlers usam `set [find ...] propriedade=valor` dentro de `:do {} on-error={}`:

1. **configure_hotspot_profile** - `set [find name="hsprof-navspot"]` com 3 propriedades
2. **disable_user** - `set [find name=$r] disabled=yes`
3. **enable_user** - `set [find name=$r] disabled=no`

Handlers NAO afetados (usam `[find]` sem propriedade depois, ou usam `add`):
- `remove_user` - `remove [find name=$r]` (sem propriedade, OK)
- `create_user` - `remove [find name=$un]` (sem propriedade) + `add` (sem [find])
- `create_profile` - `remove [find name=$n]` (sem propriedade) + `add` (sem [find])

## Alteracoes

### 1. Bump de versao para 7.5.2

Arquivos:
- `supabase/functions/mt-scripts/index.ts`: VERSION "7.5.1" -> "7.5.2"
- `supabase/functions/mikrotik-script-generator/index.ts`: VERSION "7.5.1" -> "7.5.2"

### 2. SQL Migration - Atualizar template sync

Apenas os 3 handlers afetados serao alterados:

**configure_hotspot_profile (hoisted):**
```text
:if ($c="configure_hotspot_profile") do={
:local p2 [:find $r "|"]
:local lu ""
:local dn ""
:if ($p2>=0) do={:set lu [:pick $r 0 $p2];:set dn [:pick $r ($p2+1) [:len $r]]}
:local hp [/ip hotspot profile find name="hsprof-navspot"]
:do {/ip hotspot profile set $hp login-url=$lu} on-error={}
:do {/ip hotspot profile set $hp dns-name=$dn} on-error={}
:do {/ip hotspot profile set $hp login-by=$lby} on-error={}
:set cnt ($cnt+1)
}
```

**disable_user (hoisted):**
```text
:if ($c="disable_user") do={
:local hu [/ip hotspot user find name=$r]
:do {/ip hotspot user set $hu disabled=yes} on-error={}
:set cnt ($cnt+1)
}
```

**enable_user (hoisted):**
```text
:if ($c="enable_user") do={
:local hu [/ip hotspot user find name=$r]
:do {/ip hotspot user set $hu disabled=no} on-error={}
:set cnt ($cnt+1)
}
```

Os demais handlers (create_user, create_profile, remove_user) permanecem inalterados pois nao combinam `[find]` + propriedade dentro de `:do {}`.

### 3. Deploy e teste

1. Atualizar VERSION nos 2 edge functions para "7.5.2"
2. Executar SQL migration para atualizar template sync
3. Deploy mt-scripts e mikrotik-script-generator
4. No MikroTik: `/system script run navspot-guardian` para forcar re-download
5. Verificar: `/system script run navspot-sync` -- o parse error da linha 43 nao deve mais ocorrer

## Detalhes Tecnicos

- A tecnica "Hoist [find]" extrai a subexpressao `[find]` para uma variavel local (`$hp`, `$hu`) no nivel L4
- Dentro do `:do {} on-error={}` em L5, o comando `/set $hp propriedade=valor` usa apenas variaveis simples, sem subexpressoes
- Isso respeita o limite de complexidade do parser do hAP ax2 que nao suporta subexpressoes + propriedades no mesmo comando dentro de blocos `:do {}` profundos
- Cirurgicamente, apenas os 3 handlers afetados serao modificados, conforme a politica de modificacao minima

