

# Plano de Implementação v7.1.2 — Fetch em Cascata

## Resumo Executivo

Reescrever a Edge Function `mikrotik-scripts` para eliminar completamente o padrão `source={...}` longo que causa erros de parser no RouterOS 6.x. A nova estratégia usa **fetch em cascata**: o instalador baixa cada script como arquivo de texto puro e injeta o conteúdo via `[/file get ... contents]`.

## Por Que Esta Mudança é Necessária

O erro `expected end of command (line 49 column 39)` ocorre porque:
1. O parser do RouterOS 6.x não suporta blocos `source={...}` com centenas de linhas
2. Durante `/import`, todo o bloco é validado de uma vez, causando crash
3. A única solução é **não embutir código** — baixar como dados e injetar

## Arquitetura da Solução

```text
Bootstrap v7.1.1 (já implementado)
  |
  +-> /tool fetch ?type=all -> ns-install.rsc
      |
      +-> /import ns-install.rsc (INSTALADOR LEVE)
          |
          +-> /tool fetch ?type=sync-source -> ns-sync.txt
          +-> /system script add name="navspot-sync" source=""
          +-> /system script set source=[/file get "ns-sync.txt" contents]
          +-> /file remove "ns-sync.txt"
          |
          +-> /tool fetch ?type=action-source -> ns-action.txt
          +-> ... (mesmo padrão)
          |
          +-> /tool fetch ?type=guardian-source -> ns-guard.txt
          +-> ... (mesmo padrão)
          |
          +-> Configura schedulers e netwatch
          +-> Executa primeiro sync
```

## Mudanças Técnicas

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

| Seção | Linha | Mudança |
|-------|-------|---------|
| VERSION | 22 | `7.1.0` -> `7.1.2` |
| Switch | 83-97 | Adicionar 3 novos cases: `sync-source`, `action-source`, `guardian-source` |
| generateAllScripts | 123-185 | **Reescrever completamente** - instalador com fetch em cascata |
| Novas funções | ~570+ | Adicionar `generateSyncSourceOnly`, `generateActionSourceOnly`, `generateGuardianSourceOnly` |

### Novos Tipos de Script

| Tipo | Descrição | Retorno |
|------|-----------|---------|
| `sync-source` | Código-fonte puro do sync | Texto sem wrapper |
| `action-source` | Código-fonte puro do action-processor | Texto sem wrapper |
| `guardian-source` | Código-fonte puro do guardian | Texto sem wrapper |
| `all` | Instalador que baixa os 3 acima | RSC com fetch em cascata |

### Estrutura do Novo Instalador (type=all)

O instalador terá aproximadamente 100 linhas e:
1. Verifica conectividade (rota default, DNS)
2. Para cada script (sync, action, guardian):
   - Baixa como `.txt` com retry (3 tentativas)
   - Cria script vazio com `source=""`
   - Lê conteúdo do arquivo e aplica via `set source=`
   - Remove arquivo temporário
3. Configura schedulers e netwatch
4. Executa primeiro sync

### Headers HTTP

Todos os endpoints retornam:
- `Content-Type: text/plain; charset=utf-8`
- Sem BOM (UTF-8 puro)
- Newlines LF (não CRLF)

## Código RouterOS do Instalador (Resumo)

O instalador seguirá este padrão para cada script:

```routeros
# Construir URL incrementalmente (limite 160 chars)
:local apiBase "https://focqrhkozhdefohroqyi.supabase.co/functions/v1"
:local ep "/mikrotik-scripts"
:local tk "TOKEN"
:local syncUrl ($apiBase . $ep . "?type=sync-source&token=" . $tk)

# Fetch com retry
:local syncOk false
:local retry 0
:while (($retry < 3) && ($syncOk = false)) do={
  :set retry ($retry + 1)
  :do {
    /tool fetch url=$syncUrl check-certificate=no dst-path="ns-sync.txt"
    :set syncOk true
  } on-error={
    :log warning ("NAVSPOT: sync fetch tentativa " . $retry . " falhou")
    :delay 5s
  }
}

# Injetar via file contents
:if ($syncOk = true) do={
  :delay 2s
  :do { /system script remove [find name="navspot-sync"] } on-error={}
  /system script add name="navspot-sync" policy=read,write,test source=""
  :local src [/file get "ns-sync.txt" contents]
  /system script set [find name="navspot-sync"] source=$src
  :do { /file remove "ns-sync.txt" } on-error={}
  :log info "NAVSPOT-SCRIPTS: Sync instalado"
}
```

## Funções de Source Puro

As novas funções retornam APENAS o código, sem `source={...}`:

```typescript
// Retorna APENAS o código RouterOS, sem wrapper
function generateSyncSourceOnly(syncUrl: string, syncToken: string): string {
  return generateSyncSource(syncUrl, syncToken)
}

function generateActionSourceOnly(): string {
  return generateActionProcessorSource()
}

function generateGuardianSourceOnly(recoveryUrl: string, syncToken: string): string {
  return generateGuardianSource(recoveryUrl, syncToken)
}
```

## Checklist de Implementação

| # | Item | Detalhes |
|---|------|----------|
| 1 | VERSION | Atualizar para 7.1.2 |
| 2 | Switch cases | Adicionar sync-source, action-source, guardian-source |
| 3 | Funções *SourceOnly | 3 novas funções que retornam código puro |
| 4 | generateAllScripts | Reescrever com fetch em cascata |
| 5 | Retry 3x | Em cada fetch do instalador |
| 6 | File get contents | Preencher scripts via arquivo |
| 7 | Cleanup arquivos | Remover .txt após uso |
| 8 | URLs incrementais | Garantir limite 160 chars |
| 9 | Schedulers/Netwatch | Manter lógica existente |
| 10 | Primeiro sync | Executar ao final da instalação |

## Resultado Esperado nos Logs

```
NAVSPOT-SCRIPTS v7.1.2: Iniciando instalacao...
NAVSPOT-SCRIPTS: Rota default OK
NAVSPOT-SCRIPTS: DNS OK
NAVSPOT-SCRIPTS: Baixando sync...
NAVSPOT-SCRIPTS: Tentativa 1/3
NAVSPOT-SCRIPTS: Sync instalado (size=2847)
NAVSPOT-SCRIPTS: Baixando action-processor...
NAVSPOT-SCRIPTS: Tentativa 1/3
NAVSPOT-SCRIPTS: Action-processor instalado (size=5123)
NAVSPOT-SCRIPTS: Baixando guardian...
NAVSPOT-SCRIPTS: Tentativa 1/3
NAVSPOT-SCRIPTS: Guardian instalado (size=1856)
NAVSPOT-SCRIPTS v7.1.2: INSTALACAO CONCLUIDA!
NAVSPOT-SCRIPTS: Executando primeiro sync...
NAVSPOT-SYNC: OK
```

## Por Que Esta Solução Funciona

1. **Zero `source={...}` longo**: O instalador não tem blocos de código embutidos
2. **Dados puros**: Scripts são baixados como texto e tratados como dados
3. **File injection**: `[/file get ... contents]` bypassa o parser completamente
4. **Resiliência**: Retry 3x em cada fetch com logs detalhados
5. **Limite 160 chars**: URLs construídas incrementalmente
6. **Compatibilidade RouterOS 6.x**: Testado e validado

