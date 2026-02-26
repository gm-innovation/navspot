

# Diagnostico: `\n` e `\r\n` nao funcionam — RouterOS nao interpreta escapes em `source="..."`

## Confirmacao do problema

Olhando os logs do router (linhas 970-980), o script `navspot-sync` foi criado com sucesso, mas o conteudo tem `\n` literal (dois caracteres: `\` + `n`) em vez de newlines reais. Quando o RouterOS executa o script, ele falha porque o body e uma linha unica com `\n` espalhados como texto.

| Abordagem | O que RouterOS faz no `/import` | Resultado |
|---|---|---|
| Multi-linha `source="...\n...\n..."` | Corrompe/trunca scripts longos | Falha |
| `\r\n` escapado (4 chars) | Armazena literalmente | Falha |
| `\n` escapado (2 chars) | Armazena literalmente | Falha |

**Conclusao**: O parser do `/import` do RouterOS 7 NAO interpreta escape sequences dentro de `source="..."`. Nenhum tipo de escape vai funcionar. Precisamos de uma abordagem completamente diferente.

## Solucao: Fetch-based script creation

Em vez de embutir o body do script dentro de `source="..."`, o template standalone vai:
1. Criar o script vazio (`source=""`)
2. Baixar o body do script via `/tool fetch` da API gen7post
3. Ler o arquivo baixado e setar como `source` via `/system script set`

Isso funciona porque:
- A rede ja esta configurada quando sync-standalone roda (infra.rsc roda primeiro)
- O `/file get` retorna o conteudo com newlines reais
- O `/system script set` aceita variaveis com newlines reais

## Alteracoes necessarias

### 1. gen7post — Adicionar serve type `sync-source` e `guardian-source`

Quando `mode=serve` e `type=sync-source` ou `type=guardian-source`, o gen7post retorna APENAS o body do script (o conteudo que atualmente fica entre `source="` e `"`), sem o wrapper `/system script add`.

Implementacao: no gen7post, adicionar uma funcao `extractSourceBody(script)` que extrai o conteudo entre `source="` e a linha de fechamento `"`. Para os tipos `*-source`, aplicar essa funcao em vez de `collapseSourceBlocks`.

### 2. Templates no banco — Atualizar `sync-standalone` e `guardian-standalone`

Substituir o bloco:

```text
/system script add name="navspot-sync" policy=read,write,test source="
:log info \"NAVSPOT-SYNC: START\"
...187 linhas...
"
```

Por:

```text
/system script add name="navspot-sync" policy=read,write,test source=""
:local tmpFile "ns-install-sync.txt"
:log info "NAVSPOT-SYNC-INSTALL: Baixando body do sync..."
:do {
/tool fetch url="{{SCRIPTS_URL}}" http-method=post http-data=("{\"mode\":\"serve\",\"type\":\"sync-source\",\"token\":\"{{SYNC_TOKEN}}\"}") output=file dst-path=$tmpFile
:delay 2s
:local syncBody [/file get $tmpFile contents]
/system script set [find name="navspot-sync"] source=$syncBody
:do { /file remove $tmpFile } on-error={}
:log info "NAVSPOT-SYNC-INSTALL: Body carregado com sucesso"
} on-error={
:log error "NAVSPOT-SYNC-INSTALL: Falha ao baixar body do sync"
}
```

Mesma logica para `guardian-standalone`.

### 3. gen7post — Remover `collapseSourceBlocks`

A funcao nao e mais necessaria. Os templates standalone nao terao mais blocos `source="...body..."` multi-linha. O `tpl()` volta a retornar o template renderizado sem pos-processamento.

### 4. Bump versao para v7.9.12

## Fluxo apos a mudanca

```text
1. /import infra.rsc       → Configura rede, bridge, hotspot (sem source= blocks)
2. /import sync.rsc         → Cria script vazio, faz fetch do body via API, seta source
3. /import guardian.rsc      → Idem
4. /import bootstrap.rsc    → Configura schedulers (sem source= blocks)
```

## Resumo das mudancas

| Arquivo/Recurso | Acao |
|---|---|
| `gen7post/index.ts` | Remover `collapseSourceBlocks`, adicionar `extractSourceBody`, servir tipos `sync-source` e `guardian-source` |
| Template `sync-standalone` (banco) | Substituir `source="...body..."` por fetch-based approach |
| Template `guardian-standalone` (banco) | Idem |
| Versao | 7.9.11 → 7.9.12 |

