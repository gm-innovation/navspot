

# Versionamento anti-stale no Storage + aviso na UI

## Situação atual
- Storage path: `{hotspotId}/{V}` (ex: `abc123/7.9.18`)
- Quando o template muda sem bump de `V`, o path não muda e o Storage serve arquivo stale
- O hotspot já tem `scripts_version` no banco (gravado pelo gen7post no generate)
- O frontend não compara versões — não sabe se os scripts estão desatualizados

## Mudanças

### 1. gen7post — Storage path versionado com hash do template
Trocar o path de `{hotspotId}/{V}` para `{hotspotId}/v{V}` e adicionar um campo `scripts_template_hash` (hash curto do conteúdo concatenado dos 4 scripts) no PATCH do hotspot. Assim, mesmo sem bump de `V`, o frontend pode detectar stale comparando `scripts_version` com a versão corrente retornada pelo health check.

Alternativa mais simples (recomendada): manter o path como `{hotspotId}/{V}` — já funciona porque o `generate` sobrescreve com upsert. O problema real é só detecção no frontend.

### 2. ScriptModal — aviso "Scripts desatualizados"
- O `gen7post` já retorna `version` no JSON do generate
- O hotspot no banco já tem `scripts_version` (a versão dos scripts no Storage)
- Passar `hotspot.scripts_version` para o ScriptModal como prop `storedScriptVersion`
- Comparar com a versão corrente do gen7post (obtida via health check ou hardcoded no frontend)
- Se `scripts_version` do hotspot for diferente de `V` atual, mostrar um `Alert` amarelo: "Scripts no Storage foram gerados com v{storedVersion}. A versão atual é v{currentVersion}. Regenere para atualizar."

### 3. Implementação concreta

**gen7post** — adicionar endpoint health que retorna a versão atual (já existe: `mode=health` retorna `{version: V}`).

**Embarcacoes.tsx**:
- Ao montar o ScriptModal, passar `hotspot.scripts_version` como `storedScriptVersion`
- Fazer um health check ao gen7post na montagem (ou usar a versão retornada pelo último generate)

**ScriptModal.tsx**:
- Nova prop `storedScriptVersion?: string`
- Se `storedScriptVersion` existir e for diferente de `scriptVersion`, renderizar Alert de warning com botão para regenerar

### 4. Arquivos modificados
- `src/pages/Embarcacoes.tsx` — passar `scripts_version` do hotspot ao modal
- `src/components/modals/ScriptModal.tsx` — nova prop + Alert condicional de stale warning
- Nenhuma mudança no gen7post (o path `{hotspotId}/{V}` já é versionado; o health check já existe)

