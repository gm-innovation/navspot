

# Fix: line 86 column 46 — `[find]` inline + URL longa causa parse error

## Análise detalhada

Linha 86 atual:
```routeros
/ip hotspot profile set [find name=$hspName] login-url="https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
```

**Problemas combinados:**
1. `[find name=$hspName]` inline — bracket expression resolvida em runtime
2. URL longa com múltiplas sequências `\$(...)` — parser tenta interpretar cada `\$()` como expressão
3. Tudo em uma única linha — excede a capacidade do parser do hAP ax2

## Fix: pré-resolver `find` e pré-construir URL em variáveis locais

Substituir linha 86 por 3 linhas curtas:

```routeros
:local hsprof [/ip hotspot profile find name=$hspName]
:local lurl "https://navspot.lovable.app/hotspot-login?h={{HOTSPOT_ID}}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
/ip hotspot profile set $hsprof login-url=$lurl
```

Cada linha é simples e curta. O comando `set` final tem apenas 2 tokens (`$hsprof` e `$lurl`), sem bracket expressions nem strings longas.

## Revisão do restante do template

Verifiquei todas as 100 linhas — nenhuma outra linha apresenta combinação de `[find]` + string longa. As linhas com `:do { ... [find] ... } on-error={}` existentes (12-25) são todas curtas e sem strings complexas.

## Arquivos modificados

1. **SQL UPDATE `script_templates` (id='infra')** — substituir linha 86 por 3 linhas com variáveis locais
2. **`.lovable/plan.md`** — documentar fix

