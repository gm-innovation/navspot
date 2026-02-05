

# Correção v7.1.18: Fetch Raw Source Strategy

## Diagnóstico do Problema

Os logs mostram que após `/import navspot-bootstrap-v7.1.17.rsc`:
```routeros
/system script print where name~"navspot"
# source=
#   # feb/ 5/2026  9:11:44 by RouterOS 6.49.11
#   # software id = TDDJ-5DEI
#   #
#    # NAME                   TYPE                        SIZE CREATION-TIME
```

O source contém apenas o **header genérico** gerado pelo comando `/file print file=... where name="__never__"`. Isso significa que o comando `/file set contents="<SCRIPT_ESCAPADO>"` está falhando silenciosamente no RouterOS 6.x quando executado via `/import`.

### Causa Raiz Confirmada
O padrão atual `generateScriptViaFile()` tenta injetar o script inteiro dentro de um comando `contents="..."` durante o `/import`. O RouterOS 6.x não consegue processar strings multi-linha/grandes nesse contexto.

## Solução v7.1.18: Fetch Raw Source

### Estratégia
Em vez de embutir o source no RSC, vamos:
1. Criar endpoints que retornam **source puro** (texto RouterOS sem wrapper)
2. O instalador usa `/tool fetch` para baixar o source em arquivo `.src`
3. Cria o script via `/system script add source=[/file get ... contents]`

### Por que funciona
- O `/tool fetch` salva o conteúdo diretamente no sistema de arquivos
- O RouterOS não precisa parsear o script durante o `/import`
- O `[/file get ... contents]` lê bytes crus do arquivo

## Mudanças Técnicas

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

#### 1) Adicionar endpoints `*-raw` (linhas ~170-195)

Novos tipos que retornam **source puro** (texto RouterOS apenas):
- `type=sync-raw` → retorna `generateSyncSource()` direto (sem wrapper RSC)
- `type=action-raw` → retorna `generateActionProcessorSource()` direto
- `type=guardian-raw` → retorna `generateGuardianSource()` direto

#### 2) Reescrever `generateAllScripts()` (linhas 221-361)

O instalador principal passa a:
- Baixar cada script via `/tool fetch url=...?type=*-raw` para arquivo `.src`
- Logar tamanho do arquivo baixado (diagnóstico)
- Criar script via `source=[/file get "ns-*.src" contents]`
- Remover arquivo temporário
- Manter schedulers/netwatch como está

#### 3) Atualizar `*-source` endpoints (linhas 399-419)

Simplificar para também usarem estratégia de fetch + file:
- Em vez de `/file set contents="..."`, fazem fetch do `*-raw` correspondente

#### 4) Remover dependência de `escapeForFileContents()` no fluxo principal

A função pode ficar como fallback, mas o caminho principal não usa mais.

#### 5) Adicionar diagnóstico de conteúdo baixado

Após cada fetch, logar:
- Tamanho do arquivo: `[/file get "ns-*.src" size]`
- Primeiros 80 chars do conteúdo (para detectar HTML de erro)

#### 6) Version bump para 7.1.18

### Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`
- Bump VERSION para "7.1.18"

### Arquivo: `src/components/modals/ScriptModal.tsx`
- Bump scriptVersion para "7.1.18"

### Arquivo: `src/pages/Embarcacoes.tsx`
- Bump currentScriptVersion para "7.1.18"

## Código do Instalador v7.1.18 (generateAllScripts)

```text
Para cada script (sync, action, guardian):
  1. /tool fetch url=<API>?type=<script>-raw&token=<tk> dst-path="ns-<script>.src"
  2. :delay 2s (flash write)
  3. :local fsize [/file get "ns-<script>.src" size]
  4. :log info ("Downloaded " . $fsize . " bytes")
  5. :local prefix [:pick [/file get "ns-<script>.src" contents] 0 80]
  6. :if ([:find $prefix ":log info"] >= 0) do={
       /system script add name=navspot-<script> source=[/file get ... contents]
       :log info "Script installed OK"
     } else={
       :log error "Invalid content - not RouterOS script"
     }
  7. /file remove "ns-<script>.src"
```

## Exemplo de Fluxo v7.1.18

```text
Bootstrap -> /import ns-install.rsc
                |
                v
ns-install.rsc executes:
  1. /tool fetch ...?type=sync-raw -> ns-sync.src (7KB texto puro)
  2. /system script add source=[/file get "ns-sync.src" contents]
  3. /file remove "ns-sync.src"
  4. (repete para action, guardian)
  5. Cria schedulers/netwatch
  6. Executa primeiro sync
```

## Comparação de Abordagens

| Aspecto | v7.1.17 (Atual) | v7.1.18 (Proposta) |
|---------|-----------------|-------------------|
| Método | `/file set contents="..."` no RSC | `/tool fetch` + file get |
| Problema | Falha silenciosa em strings grandes | Funciona independente do tamanho |
| Parsing | RouterOS parseia contents durante import | Conteúdo lido como bytes crus |
| Diagnóstico | Difícil de debugar | Logs de tamanho e prefixo |

## Validação no MikroTik

```routeros
# 1. Importar bootstrap v7.1.18
/import navspot-bootstrap-v7.1.18.rsc

# 2. Verificar scripts (source NÃO deve ser header genérico)
/system script print where name~"navspot"

# 3. Verificar prefixo do source (CRÍTICO)
:local src [/system script get navspot-sync source]
:put [:pick $src 0 120]
# Esperado: ":log info \"NAVSPOT-SYNC v7.1.18..."

# 4. Rodar sync e verificar logs
/system script run navspot-sync
/log print where message~"NAVSPOT-SYNC" last=30
# Esperado: "NAVSPOT-SYNC v7.1.18: OK"

# 5. Aguardar frontend mostrar Online
```

## Checklist de Implementação

- [ ] Adicionar endpoints `sync-raw`, `action-raw`, `guardian-raw` (source puro)
- [ ] Reescrever `generateAllScripts()` com fetch + file pattern
- [ ] Adicionar logs de diagnóstico (tamanho e prefixo do arquivo)
- [ ] Validar conteúdo antes de criar script (detectar HTML de erro)
- [ ] Bump VERSION para 7.1.18 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar em RouterOS 6.49.x
- [ ] Confirmar scripts sem flag **I** e source correto
- [ ] Verificar hotspot Online no frontend

