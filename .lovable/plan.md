

# Upgrade para v7.4.5: Parsing de 3 campos + Escaping seguro

## Resumo

Atualizar os handlers `create_user` e `create_profile` para suportar formato completo com 3+ campos, bumpar versao para 7.4.5, e garantir escaping correto de `$` nas variaveis RouterOS dentro do template literal TypeScript.

## Nota sobre escaping de `$`

O template literal JS/Deno so interpola `${...}` (com chaves). Variaveis RouterOS como `$c`, `$r`, `$un` **funcionam sem escape** porque nao usam chaves. Porem, para seguranca e clareza, todas as novas variaveis RouterOS serao escritas sem chaves (ex: `$rest`, `$pw`, `$pr`) que tambem sao seguras. A unica situacao perigosa seria escrever `${rest}` que o Deno interpretaria como interpolacao -- isso sera evitado.

Regra: NUNCA usar `${variavel}` para variaveis RouterOS no template literal. Usar sempre `$variavel` (sem chaves).

## Detalhes tecnicos

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

#### 1. Bump de versao

- Linha 9: comentario `v7.3.0` -> `v7.4.5`
- Linha 21: `const VERSION = "7.4.0"` -> `const VERSION = "7.4.5"`

#### 2. Comentarios de secao

- Linha 356: `v7.3.0: INLINE ACTION PROCESSING` -> `v7.4.5`
- Linha 360: `v7.3.0: Sync with INLINE...` -> `v7.4.5`
- Linha 448: `v7.3.0: Simplified Guardian` -> `v7.4.5`

#### 3. Handler `create_user` (linhas 407-415)

Substituir por parsing de 3 niveis com fallback:

```
:if ($c="create_user") do={
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local un [:pick $r 0 $p2]
:local rest [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $rest "|"]
:local pw $rest
:local pr "default"
:if ($p3>=0) do={
:set pw [:pick $rest 0 $p3]
:set pr [:pick $rest ($p3+1) [:len $rest]]
}
:do {/ip hotspot user remove [find name=$un]} on-error={}
:do {/ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"} on-error={}
:set cnt ($cnt+1)
}}
```

Nota de escaping: `$rest`, `$pw`, `$pr`, `$un` sao seguras em template literal JS (sem chaves = sem interpolacao).

#### 4. Handler `create_profile` (linhas 416-424)

Substituir por parsing de 3 niveis com fallback `shared-users="1"`:

```
:if ($c="create_profile") do={
:local p2 [:find $r "|"]
:if ($p2>=0) do={
:local n [:pick $r 0 $p2]
:local rest [:pick $r ($p2+1) [:len $r]]
:local p3 [:find $rest "|"]
:local rt $rest
:local su "1"
:if ($p3>=0) do={
:set rt [:pick $rest 0 $p3]
:set su [:pick $rest ($p3+1) [:len $rest]]
}
:do {/ip hotspot user profile remove [find name=$n]} on-error={}
:do {/ip hotspot user profile add name=$n rate-limit=$rt shared-users=$su} on-error={}
:set cnt ($cnt+1)
}}
```

### Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`

- Bumpar VERSION de `"7.4.0"` para `"7.4.5"` (politica de sincronizacao).

### Deploy

1. Deletar edge function `mikrotik-scripts` (resolver 404 persistente)
2. Redeployar `mikrotik-scripts` e `mikrotik-script-generator`
3. Testar com curl `GET /mikrotik-scripts?type=sync-raw&token=...` -- confirmar que retorna v7.4.5 com os novos handlers
4. Verificar no output que `$rest`, `$pw`, `$pr` aparecem literalmente (sem interpolacao do Deno)

### O que NAO muda

- `mikrotik-sync/index.ts` -- ja envia o formato correto com 3+ campos
- `generateGuardianSource()` -- so comentario de versao
- `generateAllScripts()` -- usa VERSION automaticamente
- Nenhuma tabela, RLS ou frontend

