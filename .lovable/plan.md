

# v7.7.1: Externalizar Bootstrap para o Banco de Dados

## Objetivo

Mover o conteudo da funcao `generateBootstrapScript` (linhas 421-740, ~320 linhas de RouterOS inline) para um template `bootstrap` na tabela `script_templates`. Isso reduz o arquivo da Edge Function de ~740 para ~300 linhas, eliminando o risco de timeout do bundler Deno.

## Situacao Atual

- `generateBootstrapScript()` constroi o script RouterOS inteiro via template literals TypeScript
- O script tem partes dinamicas (portas LAN, WAN config, network base) que precisam ser parametrizadas
- Templates `sync`, `guardian`, `installer`, `sync-standalone`, `guardian-standalone` ja estao no banco
- O bootstrap e o unico template que ainda vive inline no codigo

## Desafio Principal

O bootstrap atual usa logica TypeScript para gerar conteudo dinamico:
- `allLanPorts` filtra portas baseado na WAN interface
- `migrationCommands` gera N blocos de migracao por porta
- `wanConfig` muda conforme `wan_type` (dhcp vs manual)
- Variaveis como `networkBase`, `gateway`, `poolStart`, `poolEnd` sao derivadas de `hotspot.rede`

Essas derivacoes precisam ser movidas para o handler TypeScript (pre-processamento) e injetadas como placeholders.

## Plano Tecnico

### 1. Novo template `bootstrap` na tabela `script_templates` (SQL)

Conteudo: todo o RouterOS que hoje esta entre as linhas 455-738, com placeholders:

```text
Placeholders existentes (ja usados em outros templates):
  {{VERSION}}, {{SYNC_TOKEN}}, {{DEPLOYED_AT}}

Novos placeholders especificos do bootstrap:
  {{WAN_INTERFACE}}     - ex: ether1
  {{WAN_CONFIG}}        - bloco completo de config WAN (dhcp-client ou log manual)
  {{NETWORK_BASE}}      - ex: 10.10.10
  {{NETWORK_CIDR}}      - ex: 10.10.10.0/24
  {{GATEWAY}}           - ex: 10.10.10.1
  {{POOL_START}}        - ex: 10.10.10.10
  {{POOL_END}}          - ex: 10.10.10.254
  {{EMBARCACAO_NOME}}   - nome da embarcacao
  {{MIGRATION_COMMANDS}} - bloco de migracao de portas LAN (gerado pelo handler)
  {{SCRIPTS_URL}}       - URL do endpoint serve
  {{SUPABASE_HOST}}     - hostname para DNS resolve check
```

O template sera inserido via SQL migration usando dollar quoting ($ts$...$ts$).

### 2. Modificar Edge Function (handler POST)

Substituir a chamada `generateBootstrapScript()` por:

1. Calcular as variaveis derivadas (networkBase, gateway, poolStart, etc) - manter essa logica em TypeScript (~30 linhas)
2. Gerar `migrationCommands` e `wanConfig` como strings - manter essa logica (~15 linhas)
3. Buscar template `bootstrap` do banco via service_role
4. Aplicar todas as substituicoes de placeholders
5. Executar `normalizeNewlines`, `validateBalance`, `validateRouterOSScript` no resultado

A funcao `generateBootstrapScript` e as helpers `isBlockedNetwork`, `normalizeNewlines`, `validateBalance`, `validateRouterOSScript` permanecem no arquivo. Apenas o corpo do template RouterOS sai.

Resultado: o arquivo passa de ~740 linhas para ~350 linhas (handlers + logica de derivacao + helpers).

### 3. Adicionar tipo `bootstrap` no serve mode

Para permitir download direto do bootstrap via modular (sem JWT):

```text
GET ?mode=serve&type=bootstrap&token=XXX
```

O handler serve precisa da mesma logica de derivacao (calcular networkBase, gateway, etc a partir do hotspot). Adicionar esse case no switch de `scriptType`.

### 4. Atualizar frontend

No hook `useGenerateHotspotScript` (useHotspots.ts): nenhuma mudanca necessaria - o POST continua funcionando igual, so o backend muda internamente.

Na aba Modular do ScriptModal: o botao "Infraestrutura" ja chama `type=infra`. Podemos manter `infra` como alias para `bootstrap` ou atualizar para `type=bootstrap`.

### 5. Validacao de seguranca

- O template no banco usa dollar quoting para preservar caracteres especiais
- Placeholders sao sanitizados (sem input do usuario direto)
- `validateRouterOSScript` roda apos substituicao para garantir integridade

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| SQL migration | INSERT template `bootstrap` com ~280 linhas de RouterOS |
| `mikrotik-script-generator/index.ts` | Remover corpo de `generateBootstrapScript`, buscar template do banco, adicionar type=bootstrap no serve |
| Nenhuma mudanca no frontend | POST continua igual, serve mode ja suporta infra |

## Ordem de Execucao

1. Criar migration SQL com o template `bootstrap`
2. Refatorar `generateBootstrapScript` para buscar template + aplicar placeholders
3. Adicionar `type=bootstrap` no serve mode (alias de infra)
4. Deploy da Edge Function
5. Testar: `curl ?mode=health` confirma deploy OK
6. Testar: POST para gerar bootstrap via painel
7. Testar: `curl ?mode=serve&type=bootstrap&token=XXX` retorna script valido
8. Importar no MikroTik e verificar execucao

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Placeholders nao substituidos (aparecem literais no .rsc) | Validacao pos-render: verificar se nenhum `{{` resta no script final |
| Dollar quoting quebra no SQL | Usar tag unica ($bs$...$bs$) e testar a migration |
| Logica de derivacao incorreta | Manter os mesmos calculos TypeScript, so mudar onde o template vive |
| Deploy timeout persiste | Arquivo final tera ~350 linhas (vs 740), bem abaixo do limite |

