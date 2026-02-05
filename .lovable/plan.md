
# Plano v7.1.22: Modularização + Validação Robusta + Fallback Seguro

## Resumo Executivo

Esta versão implementa uma arquitetura mais resiliente, seguindo rigorosamente as recomendações para **não resolver um problema gerando outro**.

---

## Diagnóstico do Estado Atual (v7.1.21)

| Componente | Tamanho | Status |
|------------|---------|--------|
| `navspot-action-processor` | ~6.7KB | **FALHA** (> 4KB limite do RouterOS 6.x) |
| `navspot-sync` | ~3.7KB | OK |
| `navspot-guardian` | ~2KB | OK |
| Fallback inline | ~3.5KB (linha única) | Escaping problemático |

**Problema Principal**: O comando `/file get ... contents` no RouterOS 6.x trunca arquivos maiores que ~4KB.

---

## Estratégia v7.1.22: Modularizar em vez de Descartar

### Arquitetura de Scripts

```text
┌─────────────────────────────────────────────────────────────┐
│                    NAVSPOT SCRIPTS v7.1.22                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  navspot-action-processor (~2.5KB - CORE HANDLERS)          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • configure_hotspot_profile  (login-url/dns)        │    │
│  │ • create_profile            (perfis de velocidade)  │    │
│  │ • create_user               (usuários hotspot)      │    │
│  │ • remove_user               (remoção de usuários)   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  navspot-action-aux (~2KB - HANDLERS SECUNDÁRIOS)           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • create_whitelist_domain   (walled garden allow)   │    │
│  │ • create_blacklist_domain   (walled garden deny)    │    │
│  │ • disable_user / enable_user                        │    │
│  │ • kick_session                                      │    │
│  │ • update_password                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Fallback Inline v7.1.22F (~1.2KB - MULTI-LINHA)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ • create_profile (parsing robusto 4 params)         │    │
│  │ • create_user                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Mudanças Detalhadas

### 1. Modularização do Action Processor

**Arquivo**: `supabase/functions/mikrotik-scripts/index.ts`

#### 1.1 Nova função `generateActionProcessorCoreSource()` (~2.5KB)

Mantém apenas handlers críticos:
- `configure_hotspot_profile` - Crítico para login-url
- `create_profile` - Parsing robusto de 4 parâmetros
- `create_user` - Core functionality
- `remove_user` - Necessário para remoção

**Código RouterOS** (estrutura):
```routeros
:log info "NAVSPOT-ACTION v7.1.22: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :return }
:set navspotLock "1"
# ... leitura do arquivo de ações ...

# HANDLER: configure_hotspot_profile
:if ($cmd = "configure_hotspot_profile") do={ ... }

# HANDLER: create_profile (robusto - 4 params)
:if ($cmd = "create_profile") do={ ... }

# HANDLER: create_user
:if ($cmd = "create_user") do={ ... }

# HANDLER: remove_user
:if ($cmd = "remove_user") do={ ... }

:set navspotLock "0"
:log info ("NAVSPOT-ACTION v7.1.22: OK - " . $processedCount . " acoes")
```

#### 1.2 Nova função `generateActionAuxSource()` (~2KB)

Handlers secundários instalados separadamente:
- `create_whitelist_domain`
- `create_blacklist_domain`
- `disable_user` / `enable_user`
- `kick_session`
- `update_password`

#### 1.3 Novo endpoint `action-aux-raw`

Adicionado ao switch case para servir o script auxiliar.

---

### 2. Instalador com Fetch Seguro + Validação Real

**Arquivo**: `supabase/functions/mikrotik-scripts/index.ts` (função `generateAllScripts`)

#### 2.1 Nomes de arquivos temporários únicos

Usar timestamp para evitar conflitos:
```routeros
:local ts [:timestamp]
:local tempFile ("ns-action-" . $ts . ".src")
```

#### 2.2 Delays configuráveis para flash lento

```routeros
:delay 700ms  # Após fetch (flash write)
:delay 500ms  # Após /file set
:delay 300ms  # Após /system script add
```

#### 2.3 Validação pós-criação com smoke test

```routeros
# Após criar action-processor
:delay 1s
:local apSrc ""
:do { :set apSrc [/system script get navspot-action-processor source] } on-error={}
:local apLen [:len $apSrc]
:local apPrefix [:pick $apSrc 0 40]
:log info ("NAVSPOT-INSTALL: action-processor source len=" . $apLen . " prefix=" . $apPrefix)

# Validação 1: Tamanho mínimo
:if ($apLen < 100) do={
  :log error "NAVSPOT-INSTALL: action-processor muito curto - FALLBACK"
  # aplicar fallback
}

# Validação 2: Contém header esperado
:if ([:find $apSrc ":log info"] < 0) do={
  :log error "NAVSPOT-INSTALL: action-processor sem header - FALLBACK"
  # aplicar fallback
}

# Validação 3: SMOKE TEST
:log info "NAVSPOT-INSTALL: Executando smoke test..."
# Criar arquivo de teste inofensivo
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 300ms
/file set [find name="navspot-actions.txt"] contents="create_profile|test_min|1M|1;"
:delay 300ms

# Executar e capturar erro
:local smokeOk false
:do {
  /system script run navspot-action-processor
  :set smokeOk true
} on-error={
  :log error ("NAVSPOT-INSTALL: smoke test ERRO=" . $error)
}

:if ($smokeOk = false) do={
  :log error "NAVSPOT-INSTALL: smoke test falhou - aplicando FALLBACK INLINE"
  # remover script corrompido e aplicar fallback
}
```

---

### 3. Fallback Inline Multi-Linha (~1.2KB)

**Problema do v7.1.21**: Linha única com escaping complexo (`\\"`) pode falhar no parser.

**Solução v7.1.22**: Formato multi-linha legível com escaping mínimo.

```typescript
const fallbackSource = `:log info "NAVSPOT-ACTION v7.1.22F: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :return }
:set navspotLock "1"
:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ :set navspotLock "0"; :return }
:local raw [/file get $fid contents]
:do { /file remove $fid } on-error={}
:local pos 0
:local cnt 0
:while ([:find $raw ";" $pos] >= 0) do={
:local ep [:find $raw ";" $pos]
:local ln [:pick $raw $pos $ep]
:set pos ($ep + 1)
:if ([:len $ln] > 0) do={
:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local r [:pick $ln ($p1 + 1) [:len $ln]]
:if ($c = "create_profile") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local pn [:pick $r 0 $p2]
:local sub [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $sub "|"]
:local ps "1"
:if ($p3 >= 0) do={
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={ :set ps [:pick $sub2 0 $p4] } else={ :set ps $sub2 }
}
:do { /ip hotspot user profile add name=$pn shared-users=$ps } on-error={}
:set cnt ($cnt + 1)
}}
:if ($c = "create_user") do={
:local p2 [:find $r "|"]
:if ($p2 >= 0) do={
:local u [:pick $r 0 $p2]
:local sub [:pick $r ($p2 + 1) [:len $r]]
:local p3 [:find $sub "|"]
:local pw ""
:local pf "default"
:if ($p3 >= 0) do={
:set pw [:pick $sub 0 $p3]
:set pf [:pick $sub ($p3 + 1) [:len $sub]]
}
:do { /ip hotspot user profile add name=$pf } on-error={}
:do { /ip hotspot user add name=$u password=$pw profile=$pf } on-error={}
:set cnt ($cnt + 1)
}}
}}}
:set navspotLock "0"
:log info ("NAVSPOT-ACTION v7.1.22F: OK - " . $cnt)`
```

**Instalação do fallback** (sem escaping problemático):
```routeros
/system script add name="navspot-action-processor" policy=read,write,test source=$fallbackSource
```

> Nota: O instalador usará uma variável :local com o source multi-linha, evitando inline escaping.

---

### 4. Robustez na Escrita do Arquivo de Ações

**Arquivo**: `supabase/functions/mikrotik-scripts/index.ts` (script navspot-sync)

#### 4.1 Retry com delays exponenciais

```routeros
:local writeOk false
:local retry 0
:while (($retry < 3) && ($writeOk = false)) do={
  :set retry ($retry + 1)
  :local delayMs (500 * $retry)  # 500ms, 1000ms, 1500ms
  
  # Escrever arquivo
  :do { /file remove "navspot-actions.txt" } on-error={}
  /file print file=navspot-actions.txt where name="__never__"
  :delay ($delayMs . "ms")
  /file set [find name="navspot-actions.txt"] contents=$actions
  :delay ($delayMs . "ms")
  
  # Verificar tamanho
  :local savedLen [:len [/file get [find name="navspot-actions.txt"] contents]]
  :local expectedLen [:len $actions]
  
  :if ($savedLen = $expectedLen) do={
    :set writeOk true
    :log info ("NAVSPOT-SYNC: Arquivo salvo OK (tentativa " . $retry . ", size=" . $savedLen . ")")
  } else={
    :log warning ("NAVSPOT-SYNC: Mismatch tentativa " . $retry . " (expected=" . $expectedLen . ", saved=" . $savedLen . ")")
  }
}

:if ($writeOk = false) do={
  :log error "NAVSPOT-SYNC: Falha ao salvar arquivo apos 3 tentativas"
}
```

#### 4.2 Normalização do pipe (collapse `;;` em `;`)

No backend (`mikrotik-sync/index.ts`):
```typescript
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // Remove control characters
    .replace(/"/g, "'")             // Double quotes -> single
    .replace(/;{2,}/g, ';')         // Collapse multiple semicolons
    .replace(/\|\|+/g, '|')         // Collapse multiple pipes
    // NÃO substituir backslash - preserva \$(mac)
}
```

---

### 5. Diagnósticos Aprimorados

#### 5.1 Captura de $error no on-error

```routeros
:do {
  /system script run navspot-action-processor
} on-error={
  :log error ("NAVSPOT-SYNC: action-processor ERRO=" . $error)
}
```

#### 5.2 Log do prefixo em caso de conteúdo inválido

```routeros
:if ([:find $prefix ":log info"] < 0) do={
  :local fullPrefix [:pick [/file get "ns-action.src" contents] 0 200]
  :log error ("NAVSPOT-INSTALL: Conteudo invalido, primeiros 200 chars: " . $fullPrefix)
}
```

---

## Arquivos a Modificar

### Backend (Edge Functions)

| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/mikrotik-scripts/index.ts` | Modularizar action-processor, novo endpoint action-aux-raw, fallback multi-linha, smoke test |
| `supabase/functions/mikrotik-sync/index.ts` | Melhorar sanitização, bump versão |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump versão |

### Frontend

| Arquivo | Mudanças |
|---------|----------|
| `src/components/modals/ScriptModal.tsx` | Bump scriptVersion para 7.1.22 |
| `src/pages/Embarcacoes.tsx` | Bump currentScriptVersion para 7.1.22 |

---

## Tamanhos Target

| Componente | v7.1.21 | v7.1.22 Target |
|------------|---------|----------------|
| navspot-action-processor | 6729 bytes | **~2500 bytes** |
| navspot-action-aux | N/A | ~2000 bytes |
| fallback inline | ~3500 bytes | **~1200 bytes** |
| navspot-sync | ~3700 bytes | ~3800 bytes |

---

## Fluxo de Instalação v7.1.22

```text
Bootstrap importa
    │
    ├─1─► Fetch sync-raw (3.8KB)
    │     └─► Cria navspot-sync [OK]
    │
    ├─2─► Fetch action-raw (2.5KB) 
    │     └─► Cria navspot-action-processor
    │         │
    │         ├─► Validação source (len >= 100, contém ":log info")
    │         │
    │         └─► SMOKE TEST (create_profile|test_min|1M|1)
    │             │
    │             ├─► SUCESSO: "action-processor validado"
    │             │
    │             └─► FALHA: Aplica Fallback Inline v7.1.22F
    │
    ├─3─► Fetch action-aux-raw (2KB) [OPCIONAL]
    │     └─► Cria navspot-action-aux (handlers secundários)
    │
    ├─4─► Fetch guardian-raw (2KB)
    │     └─► Cria navspot-guardian [OK]
    │
    ├─5─► Cria schedulers + netwatch
    │
    └─6─► Primeiro sync
          └─► Action processor executa [OK]
```

---

## Critérios de Sucesso

1. Action-processor baixado com ~2.5KB (dentro do limite de 4KB)
2. Log mostra "action content valido" (não "prefix=")
3. Smoke test passa OU fallback inline aplicado
4. Sync executa action-processor sem erro
5. Arquivo de ações salvo sem truncamento (size esperado = size real)
6. Hotspot fica Online no painel

---

## Testes Recomendados

### Backend (Unit Tests)

```typescript
// Garantir tamanho do action-processor
test('generateActionProcessorSource deve ter < 2800 bytes', () => {
  const source = generateActionProcessorSource()
  expect(source.length).toBeLessThan(2800)
})

// Garantir que sanitização preserva backslash
test('sanitizePipeForFileContents preserva \\$(mac)', () => {
  const input = 'configure_hotspot_profile|http://example.com?mac=\\$(mac)|hotspot.local'
  const output = sanitizePipeForFileContents(input)
  expect(output).toContain('\\$(mac)')
})
```

### Hardware (E2E)

1. **Staging em múltiplos modelos**:
   - hAP lite (flash lento)
   - hAP ac
   - CCR (firmware diferente)

2. **Cenários de teste**:
   - Escrita lenta em flash
   - Conteúdo com aspas, backslashes, percent-encoded chars
   - Payload grande (muitas ações)

---

## Checklist de Implementação

- [ ] Criar `generateActionProcessorCoreSource()` (~2.5KB) com handlers essenciais
- [ ] Criar `generateActionAuxSource()` (~2KB) com handlers secundários
- [ ] Adicionar endpoint `action-aux-raw` no switch case
- [ ] Implementar fallback multi-linha (~1.2KB) sem escaping complexo
- [ ] Adicionar smoke test no instalador com captura de `$error`
- [ ] Implementar retries na escrita do arquivo de ações (3 tentativas)
- [ ] Adicionar normalização do pipe (collapse `;;`)
- [ ] Bump VERSION para 7.1.22 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar em RouterOS 6.49.x (múltiplos modelos)
- [ ] Verificar tamanho do action-processor (~2.5KB)
- [ ] Confirmar smoke test passa ou fallback aplicado
- [ ] Monitorar logs por 48-72h (taxas de fallback, erros)
