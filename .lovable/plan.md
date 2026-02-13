

# Fix Guardian v7.8.6: Deploy + Health URL + Crash-Safe Version Check

## Problemas Confirmados

1. **Edge Function retorna 404**: O `navspot-script-gen` nao esta registrado no gateway. Confirmado via teste direto.
2. **URL do health check errada**: O template usa `{{SCRIPTS_URL}}&type=health` que resolve para `mode=serve&type=health`, caindo no handler errado.
3. **Guardian crasha silenciosamente**: O parsing complexo de JSON (`[:find $hbody "\"version\":\""]`) causa crash no RouterOS 7 que nao e capturado pelo `on-error`.
4. **Sem logging de debug**: Quando o health check falha, nao ha visibilidade sobre o conteudo recebido.

## Alteracoes

### 1. Version bump para 7.8.6

Arquivo: `supabase/functions/navspot-script-gen/index.ts`
- Mudar VERSION de `"7.8.5"` para `"7.8.6"`

### 2. Template `guardian` (tabela `script_templates`)

Reescrever com as seguintes correcoes:

**a) Lock reset** (mantido como esta)

**b) Component checks** (mantidos)

**c) Health check com URL correta e crash-safe**:
- Usar `{{API_BASE}}/navspot-script-gen?mode=health` em vez de `{{SCRIPTS_URL}}&type=health`
- Substituir parsing complexo de JSON por verificacao simples: `[:find $hbody "{{VERSION}}"]`
- Se a string `{{VERSION}}` (ex: "7.8.6") NAO aparece no body, a versao mudou
- Adicionar log do conteudo recebido para facilitar debug

```text
# Version check (crash-safe)
:do {
:local hresp [/tool fetch url="{{API_BASE}}/navspot-script-gen?mode=health" as-value output=user]
:local hbody ($hresp->"data")
:log info ("NAVSPOT-GUARDIAN: health=" . $hbody)
:if ([:find $hbody "{{VERSION}}"] < 0) do={
:log warning "NAVSPOT-GUARDIAN: Versao diferente detectada"
:set needsRepair 1
:set missing ($missing . "version ")
}
} on-error={
:log warning "NAVSPOT-GUARDIAN: Health check falhou"
}
```

### 3. Template `guardian-standalone` (tabela `script_templates`)

Mesmas correcoes do template `guardian`, com escaping correto para RouterOS:
- `\"` para aspas dentro do source
- `\$` para variaveis
- URL correta: `{{API_BASE}}/navspot-script-gen?mode=health`
- Verificacao simplificada: `[:find \$hbody \"{{VERSION}}\"]`
- Log de debug do conteudo recebido

### 4. Deploy forcado

Executar delete + redeploy do `navspot-script-gen` para resolver o 404 persistente no gateway.

### 5. Verificacao pos-deploy

Testar via curl que `navspot-script-gen?mode=health` retorna:
```text
{"version":"7.8.6","status":"ok","deployed_at":"...","function":"navspot-script-gen"}
```

## Ordem de Execucao

1. Bump versao no `index.ts` para 7.8.6
2. UPDATE template `guardian` no banco com URL correta + version check simplificado + log de debug
3. UPDATE template `guardian-standalone` no banco com mesmas correcoes (escapadas)
4. Delete + redeploy da edge function `navspot-script-gen`
5. Testar health check via curl
6. Gerar scripts novamente pelo painel e importar `guardian.rsc` no roteador

## Secao Tecnica: Por que o parsing complexo crasha

No RouterOS 7.x, a expressao:
```text
:local vs [:find $hbody "\"version\":\""]
```
Envolve aspas escapadas dentro de aspas, que o parser do hAP ax2 nao interpreta corretamente. Isso causa um crash silencioso que nao e capturado nem pelo bloco `on-error`. A solucao e usar:
```text
:if ([:find $hbody "{{VERSION}}"] < 0) do={...}
```
Onde `{{VERSION}}` e substituido pelo valor literal (ex: "7.8.6") no momento da geracao do script, eliminando qualquer ambiguidade de escaping.

## Acao Imediata (Manual)

Enquanto as correcoes sao aplicadas, restaurar o sync executando no MikroTik:

```text
/tool fetch url="https://focqrhkozhdefohroqyi.supabase.co/functions/v1/mikrotik-recovery-download" http-method=post http-data="{\"sync_token\":\"bba989838d50d36a5fd0d8f0ac45b11bec0020fe8be395789691d4c002f0ad0e\"}" http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-recovery.rsc"
```
Depois:
```text
/import navspot-recovery.rsc
```

