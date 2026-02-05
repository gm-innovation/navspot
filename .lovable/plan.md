
# Correção v7.1.20: Validação Pós-Instalação + Fallback Inline + Sanitização de Pipe

## Diagnóstico Confirmado

### Problema 1: Action Processor Instalado mas "Oco"
O fetch funciona (3KB baixados), mas o `source=[/file get ... contents]` pode falhar se o conteúdo do arquivo contiver caracteres que quebram o parsing do RouterOS 6.x.

**Verificação a executar:**
```routeros
:put ("Tamanho do source: " . [:len [/system script get navspot-action-processor source]])
:put ("Conteudo inicial: " . [:pick [/system script get navspot-action-processor source] 0 50])
```

Se o tamanho for menor que 500 bytes ou não começar com `:log info`, o script está corrompido.

### Problema 2: Truncamento do Arquivo de Ações (36 bytes perdidos)
O log mostrou:
```
pending_actions_pipe (187 chars)
Arquivo salvo (size=151)  <- 36 bytes perdidos!
```

O `/file set contents=$actions` trunca quando encontra caracteres especiais como `"` ou `\` sem escape.

---

## Solução v7.1.20

### Parte 1: Validação Pós-Instalação (O "Pulo do Gato")

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

Após criar cada script, verificar IMEDIATAMENTE se o source foi instalado corretamente:

```text
# Para cada script (sync, action, guardian):
:delay 1s
:local testSrc [/system script get navspot-action-processor source]
:if ([:len $testSrc] < 100) do={
    :log error "NAVSPOT-INSTALL: Source muito curto - FALLBACK INLINE"
    # Aplicar fallback
}
:if ([:find $testSrc ":log info"] = -1) do={
    :log error "NAVSPOT-INSTALL: Source sem :log info - FALLBACK INLINE"
    # Aplicar fallback
}
```

### Parte 2: Fallback Inline para Action Processor

Se a validação falhar, criar o script com source minificado inline (~2KB):

- Remover todos os comentários
- Manter apenas handlers essenciais:
  - `configure_hotspot_profile` (v7.0 - crítico)
  - `create_profile` (perfis antes de usuários)
  - `create_user` (usuários)
  - `create_whitelist_domain` (walled garden)
- Usar nomes de variáveis curtos

### Parte 3: Sanitização do Pipe de Ações

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Antes de retornar o `pending_actions_pipe`, sanitizar a string:

```typescript
// Remover caracteres problemáticos para /file set contents
const sanitizedPipe = pipeDelimitedActions
  .replace(/[\x00-\x1F]/g, '')    // Caracteres de controle
  .replace(/"/g, "'")             // Aspas duplas -> simples
  .replace(/\\/g, "/")            // Backslash -> forward slash
```

---

## Mudanças Técnicas Detalhadas

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Constante de Versão (linha 34):**
```typescript
const VERSION = "7.1.20"
```

**Função `generateAllScripts()` (após cada bloco de instalação):**

Para cada script instalado, adicionar bloco de validação:

```routeros
# VALIDAÇÃO NAVSPOT-ACTION-PROCESSOR (após instalar)
:delay 1s
:local apTestSrc ""
:do { :set apTestSrc [/system script get navspot-action-processor source] } on-error={}
:local apValid false
:if (([:len $apTestSrc] >= 100) && ([:find $apTestSrc ":log info"] >= 0)) do={ :set apValid true }
:if ($apValid = false) do={
:log error "NAVSPOT-INSTALL: action-processor INVALIDO - aplicando fallback inline"
:do { /system script remove [find name="navspot-action-processor"] } on-error={}
:delay 200ms
/system script add name="navspot-action-processor" policy=read,write,test source=":log info \\"NAVSPOT-ACTION v7.1.20F: Start\\";:global navspotLock;:if (\$navspotLock = \\"1\\") do={ :return };:set navspotLock \\"1\\";:local fid [/file find name=\\"navspot-actions.txt\\"];:if ([:len \$fid] = 0) do={ :set navspotLock \\"0\\"; :return };:local raw [/file get \$fid contents];:do { /file remove \$fid } on-error={};:local pos 0;:local cnt 0;:while ([:find \$raw \\";\\\" \$pos] >= 0) do={:local ep [:find \$raw \\";\\\" \$pos];:local line [:pick \$raw \$pos \$ep];:set pos (\$ep + 1);:if ([:len \$line] > 0) do={:local p1 [:find \$line \\"|\\"];:if (\$p1 >= 0) do={:local c [:pick \$line 0 \$p1];:local r [:pick \$line (\$p1 + 1) [:len \$line]];:if (\$c = \\"create_user\\") do={:local p2 [:find \$r \\"|\\"];:if (\$p2 >= 0) do={:local u [:pick \$r 0 \$p2];:local sub [:pick \$r (\$p2 + 1) [:len \$r]];:local p3 [:find \$sub \\"|\\"];:local pw \\"\\";:local pf \\"default\\";:if (\$p3 >= 0) do={:set pw [:pick \$sub 0 \$p3];:set pf [:pick \$sub (\$p3 + 1) [:len \$sub]]};:if ([:len \$pf] = 0) do={ :set pf \\"default\\" };:do { /ip hotspot user profile add name=\$pf } on-error={};:local ex [/ip hotspot user find name=\$u];:if ([:len \$ex] = 0) do={:do { /ip hotspot user add name=\$u password=\$pw profile=\$pf comment=\\"navspot\\" } on-error={};:set cnt (\$cnt + 1)} else={:do { /ip hotspot user set \$ex password=\$pw profile=\$pf } on-error={}}}};:if (\$c = \\"create_profile\\") do={:local p2 [:find \$r \\"|\\"];:if (\$p2 >= 0) do={:local pn [:pick \$r 0 \$p2];:local sub [:pick \$r (\$p2 + 1) [:len \$r]];:local ex [/ip hotspot user profile find name=\$pn];:if ([:len \$ex] = 0) do={:do { /ip hotspot user profile add name=\$pn } on-error={};:set cnt (\$cnt + 1)}}}}}}};:set navspotLock \\"0\\";:log info (\\"NAVSPOT-ACTION v7.1.20F: OK - \\" . \$cnt . \\" acoes\\")"
:log info "NAVSPOT-INSTALL: Fallback inline instalado"
}
```

> Nota: O fallback inline usa versão "7.1.20F" (F = Fallback) para identificação nos logs.

### 2. `supabase/functions/mikrotik-sync/index.ts`

**Constante de Versão (linha 9):**
```typescript
const VERSION = "7.1.20"
```

**Função de Sanitização (adicionar após linha 20):**
```typescript
// v7.1.20: Sanitize pipe string for safe /file set contents
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // Remove control characters
    .replace(/"/g, "'")             // Double quotes -> single (safer in MikroTik)
    .replace(/\\/g, "/")            // Backslash -> forward slash
}
```

**Aplicar sanitização (linha ~1487):**
```typescript
// v7.1.20: Sanitize before wrapping
const sanitizedPipe = sanitizePipeForFileContents(pipeDelimitedActions)
const formattedPipe = sanitizedPipe ? `[[${sanitizedPipe};]]` : '[[]]'
```

### 3. `supabase/functions/mikrotik-script-generator/index.ts`
- Bump VERSION para "7.1.20"

### 4. `src/components/modals/ScriptModal.tsx`
- Bump scriptVersion para "7.1.20"

### 5. `src/pages/Embarcacoes.tsx`
- Bump currentScriptVersion para "7.1.20"

---

## Fluxo v7.1.20

```text
Bootstrap -> /import navspot-bootstrap-v7.1.20.rsc
                |
                v
Instalador executa:
  1. /tool fetch sync-raw -> ns-sync.src (6KB)
  2. Cria navspot-sync
  3. VALIDA: source >= 100 bytes && contém ":log info"
     - Se FALHAR: skip (sync não tem fallback inline)
  
  4. /tool fetch action-raw -> ns-action.src (3KB)
  5. Cria navspot-action-processor
  6. VALIDA: source >= 100 bytes && contém ":log info"
     - Se FALHAR: APLICA FALLBACK INLINE (~2KB minificado)
  
  7. /tool fetch guardian-raw -> ns-guard.src (2KB)
  8. Cria navspot-guardian
  9. VALIDA: source >= 100 bytes && contém ":log info"
     - Se FALHAR: skip (guardian não é crítico)
  
  10. Cria schedulers/netwatch
  11. Executa primeiro sync
```

---

## Fallback Inline: Handlers Incluídos

O fallback minificado suporta apenas:

| Handler | Motivo |
|---------|--------|
| `create_user` | Crítico - cria/atualiza usuários |
| `create_profile` | Crítico - perfis devem existir antes de usuários |

**Handlers NÃO incluídos no fallback** (para manter < 2KB):
- `configure_hotspot_profile` - Tratado pelo guardian no próximo ciclo
- `create_whitelist_domain` / `create_blacklist_domain` - Menor prioridade
- `disable_user`, `enable_user`, `kick_session` - Podem esperar

---

## Sanitização do Pipe: Transformações

| Original | Sanitizado | Motivo |
|----------|------------|--------|
| `"` | `'` | Aspas duplas quebram `/file set contents="..."` |
| `\` | `/` | Backslash causa escapes indesejados |
| `\x00-\x1F` | (removido) | Caracteres de controle corrompem arquivo |

---

## Validação no MikroTik

### Antes de reimportar (verificar estado atual):
```routeros
:put ("Tamanho action-processor: " . [:len [/system script get navspot-action-processor source]])
:put ("Inicio: " . [:pick [/system script get navspot-action-processor source] 0 50])
```

### Após v7.1.20:
```routeros
/import navspot-bootstrap-v7.1.20.rsc

# Verificar logs de validação
/log print where message~"NAVSPOT-INSTALL" last=50

# Esperado:
# "NAVSPOT-INSTALL: action content valido" (se fetch funcionou)
# OU
# "NAVSPOT-INSTALL: action-processor INVALIDO - aplicando fallback inline"
# "NAVSPOT-INSTALL: Fallback inline instalado"

# Verificar script instalado
:local src [/system script get navspot-action-processor source]
:put [:pick $src 0 60]
# Esperado: ":log info \"NAVSPOT-ACTION v7.1.20..." ou ":log info \"NAVSPOT-ACTION v7.1.20F..."

# Testar sync
/system script run navspot-sync
/log print where message~"NAVSPOT" last=30
# Esperado: "NAVSPOT-SYNC v7.1.20: OK" e "NAVSPOT-ACTION v7.1.20: OK - X acoes"
```

---

## Critérios de Sucesso

1. Action-processor com source válido (via fetch OU via fallback)
2. Logs mostram "content valido" OU "Fallback inline instalado"
3. Sync executa action-processor sem erro
4. Arquivo de ações salvo sem truncamento (size = comprimento esperado)
5. Hotspot fica Online no painel

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Fallback muito grande (> 4KB) | Minificação agressiva, apenas handlers essenciais |
| Aspas simples em dados de usuário | Raro; senhas/logins normalmente não têm aspas |
| Forward slash em URLs | URLs já usam forward slash, sem impacto |
| Guardian não repara fallback | O fallback É funcional; guardian repara no próximo ciclo se necessário |

---

## Checklist de Implementação

- [ ] Bump VERSION para 7.1.20 em `mikrotik-scripts/index.ts`
- [ ] Bump VERSION para 7.1.20 em `mikrotik-sync/index.ts`
- [ ] Adicionar `sanitizePipeForFileContents()` em `mikrotik-sync`
- [ ] Aplicar sanitização no `pipeDelimitedActions`
- [ ] Adicionar bloco de validação pós-instalação para action-processor
- [ ] Adicionar fallback inline minificado (~2KB)
- [ ] Bump VERSION para 7.1.20 em `mikrotik-script-generator`
- [ ] Bump scriptVersion para 7.1.20 em `ScriptModal.tsx`
- [ ] Bump currentScriptVersion para 7.1.20 em `Embarcacoes.tsx`
- [ ] Deploy edge functions
- [ ] Testar em RouterOS 6.49.x
- [ ] Verificar logs de validação e fallback
- [ ] Confirmar hotspot Online no frontend
