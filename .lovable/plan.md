

# Fix: Mover variáveis de fallback para FORA do bloco `:do {}`

## Problema

As variáveis `fbLu`, `fbDn`, `fbHp` foram declaradas na linha 781-783, **dentro** do bloco `:do {` (linha 751). O bloco de aplicação hoisted (linha 940-945) está **fora** desse `:do`, após o `} on-error={...}` da linha 939. Resultado: variáveis fora de escopo — o RouterOS não as reconhece.

Além disso, o router provavelmente ainda tem o script antigo. Após o fix, será necessário re-baixar os scripts.

## Mudança Única

No arquivo `supabase/functions/mikrotik-scripts/index.ts`:

**Mover as 3 declarações** das linhas 781-783 para **antes** da linha 751 (antes do `:do {`).

Ou seja, inserir após a linha 750 (`:do {:set us ...}`) e antes da linha 751 (`:do {`):

```routeros
:local fbLu ""
:local fbDn ""
:local fbHp ""
```

E **remover** as mesmas 3 linhas de dentro do bloco (linhas 781-783 atuais).

### Antes (errado):
```text
Linha 750: :do {:set us [...]} on-error={...}
Linha 751: :do {                           <-- início do bloco principal
  ...
Linha 780:   :local lby "cookie,http-pap,http-chap"
Linha 781:   :local fbLu ""               <-- DENTRO do :do (escopo limitado)
Linha 782:   :local fbDn ""
Linha 783:   :local fbHp ""
  ...
Linha 939: } on-error={...}               <-- fim do :do
Linha 940: :if ([:len $fbHp] > 0) do={    <-- fbHp FORA DO ESCOPO!
```

### Depois (correto):
```text
Linha 750: :do {:set us [...]} on-error={...}
           :local fbLu ""                 <-- FORA do :do (escopo global do script)
           :local fbDn ""
           :local fbHp ""
Linha 751: :do {                           <-- início do bloco principal
  ...
Linha 780:   :local lby "cookie,http-pap,http-chap"
                                           <-- SEM fbLu/fbDn/fbHp aqui
  ...
Linha 939: } on-error={...}
Linha 940: :if ([:len $fbHp] > 0) do={    <-- fbHp ACESSÍVEL!
```

## Verificação Pós-Deploy

1. Re-baixar scripts no router (via "Atualizar Scripts" ou fetch+import manual)
2. `/system script run navspot-sync` — deve executar sem crash
3. Log deve mostrar `NAVSPOT-SYNC v7.2.0: OK`

