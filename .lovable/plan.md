

# Fix linha 90: Walled Garden `foreach` com `:toarray`

## Erro confirmado

Linha 96 do template (linha 90 do RSC renderizado):
```
:foreach d in={$supabaseHost;"cdn.jsdelivr.net";...} do={
```
O parser falha na coluna 147 ao expandir `$supabaseHost` dentro da lista inline `{...}`.

## Correção

Substituir linhas 95-100 do template pelo trecho revisado do usuário:

```routeros
# 9. Walled Garden (toarray para evitar erro de parse na lista)
:local hosts "cdn.jsdelivr.net,*.gstatic.com,*.googleapis.com,connectivitycheck.gstatic.com,*.navspot.com.br"
:if ([:len $supabaseHost] > 0) do={
  :set hosts ($supabaseHost . "," . $hosts)
}
:foreach d in=[:toarray $hosts] do={
  :do { /ip hotspot walled-garden add action=allow dst-host=$d comment="navspot" } on-error={}
}
:do { /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot" } on-error={}
:do { /ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot" } on-error={}
```

## Implementação

1. **SQL UPDATE `script_templates` (id='infra')** — substituir seção 9 (linhas 95-100) pela versão `:toarray`
2. **`.lovable/plan.md`** — adicionar padrão `:toarray` e regra de não usar variáveis dentro de listas inline `{...}`

