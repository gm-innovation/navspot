
# Fix: Bump de Versao + Correcao do Parse Error no Sync Template

## Problema

1. **Versao nao foi incrementada**: Tanto `mt-scripts` quanto `mikrotik-script-generator` estao em v7.4.5. O guardian compara a string de versao para decidir se re-baixa os scripts. Sem bump, mesmo que o template tenha sido atualizado no banco, o roteador nao sabe que precisa atualizar.

2. **Parse error na linha 41 do sync template**: A linha que configura o hotspot profile viola a Regra de Ouro #1 do ROS 7 - multiplos parametros (`login-url`, `dns-name`, `login-by`) no mesmo comando `set` dentro de bloco aninhado causa `expected end of command` no hAP ax2.

## Correcoes

### 1. Bump de versao para 7.5.0

Arquivos afetados:
- `supabase/functions/mt-scripts/index.ts`: VERSION "7.4.5" -> "7.5.0"
- `supabase/functions/mikrotik-script-generator/index.ts`: VERSION "7.4.5" -> "7.5.0"

### 2. Corrigir template sync no banco (SQL migration)

A linha problemática:

```text
ANTES (linha 41 - parse error):
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=[:pick $r 0 $p2] dns-name=[:pick $r ($p2+1) [:len $r]] login-by=$lby} on-error={}

DEPOIS (separado em comandos individuais):
:local lu [:pick $r 0 $p2]
:local dn [:pick $r ($p2+1) [:len $r]]
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-url=$lu} on-error={}
:do {/ip hotspot profile set [find name="hsprof-navspot"] dns-name=$dn} on-error={}
:do {/ip hotspot profile set [find name="hsprof-navspot"] login-by=$lby} on-error={}
```

Cada propriedade e aplicada em um comando separado, respeitando o limite de aninhamento do ROS 7.x.

A versao no template tambem sera atualizada para `{{VERSION}}` (ja usa placeholder, so precisa garantir que o replace funciona com a nova constante).

### 3. Deploy

1. Atualizar constante VERSION nos 2 edge functions
2. Executar SQL migration para atualizar template sync
3. Deploy mt-scripts e mikrotik-script-generator
4. No MikroTik: o guardian (intervalo 10min) vai detectar v7.5.0 != v7.4.5 e forcar re-download automatico
5. Ou manualmente: `/system script run navspot-guardian` para forcar imediatamente

### Detalhes Tecnicos

A migration SQL usara dollar quoting ($ts$...$ts$) para preservar caracteres especiais do RouterOS no PostgreSQL, conforme padrao estabelecido.

O template completo sera reescrito na migration, mantendo toda a logica existente mas com a linha 41 corrigida.
