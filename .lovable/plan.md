

# Diagnóstico e Correção: Erro "syntax error (line 119 column 8)" em v6.9.38

## Problema Identificado

O erro `syntax error (line 119 column 8)` ocorre durante `/import` no RouterOS 6.x. Após análise detalhada do script gerado, identifiquei **duas possíveis causas**:

### Causa 1: Bloco `:if ... do={` com múltiplas linhas

A linha 119 do output corresponde aproximadamente ao bloco:

```routeros
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}
```

O parser do RouterOS 6.x durante `/import` pode ter problemas com blocos `:if` multi-linha onde o `do={` está numa linha e o `}` fechando está em outra.

### Causa 2: Placeholders TypeScript não interpolados

As linhas 827-829 do TypeScript usam:

```typescript
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"
```

Se por algum motivo a interpolação TypeScript não funcionar corretamente, o output conteria literalmente `${RUNTIME_PLACEHOLDERS.mac}` que quebraria o parser.

---

## Solução Proposta (v6.9.39)

### Mudança 1: Converter blocos `:if` multi-linha para single-line ou usar `:do { } on-error={}`

**DE (multi-linha problemático):**
```routeros
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway}
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}
```

**PARA (padrão seguro com `:do { } on-error={}`):**
```routeros
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:local needCreate 0
:if ([:len $_hsprof] = 0) do={ :set needCreate 1 }
:if ($needCreate = 1) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
}
:if ($needCreate = 1) do={
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}
```

**OU ainda mais seguro (sem `:if` com `[:len]`):**
```routeros
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
# Sempre tenta criar - on-error={}  ignora se já existe
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway}
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
} on-error={}
```

### Mudança 2: Garantir interpolação correta dos placeholders

Verificar que `${RUNTIME_PLACEHOLDERS.mac}` está dentro do template literal correto e gera `@@RUNTIME_MAC@@` no output.

### Mudança 3: Adicionar regra de linter para `:if ([:len $var]`

Atualmente o linter bloqueia `:if ([:len [/...` (comando aninhado), mas não bloqueia `:if ([:len $var]` que também pode causar problemas em arquivos `.rsc` durante `/import`.

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

| Linha | Mudança |
|-------|---------|
| 8 | `VERSION = "6.9.39"` |
| 838-849 | Simplificar bloco do hotspot profile - remover `:if ([:len...` |
| 845-849 | Usar padrão `:do { } on-error={}` em vez de `:if ([:len $var]) do={...}` |
| ~90 | Adicionar regra linter para `:if ([:len $` em arquivos .rsc |

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

| Linha | Mudança |
|-------|---------|
| 34 | `VERSION = "6.9.39"` |
| Bloco hotspot | Mesmas mudanças do generator |

### 3. `src/components/modals/ScriptModal.tsx`

| Linha | Mudança |
|-------|---------|
| 34 | `scriptVersion = "6.9.39"` |

---

## Código Proposto para Hotspot Profile (v6.9.39)

```routeros
# 7. HOTSPOT v6.9.39 (simplificado - sem :if [:len])
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotIdSafe}"
:local urlVars1 "&mac=@@RUNTIME_MAC@@"
:local urlVars2 "&ip=@@RUNTIME_IP@@"
:local urlVars3 "&link-login-only=@@RUNTIME_LINK_LOGIN_ONLY@@"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl])

# Criar ou atualizar profile (idempotente - on-error ignora duplicatas)
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway}
} on-error={}

# Garantir que profile existe e configurar
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do { /ip hotspot profile set $_hsprof dns-name="${dnsName}" } on-error={}
:do { /ip hotspot profile set $_hsprof html-directory=hotspot } on-error={}
:do { /ip hotspot profile set $_hsprof login-by=http-pap,http-chap } on-error={}
:do { /ip hotspot profile set $_hsprof keepalive-timeout=2m } on-error={}
:do { /ip hotspot profile set $_hsprof idle-timeout=5m } on-error={}
:do { /ip hotspot profile set $_hsprof login-url=$fullUrl } on-error={}

:do { /ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no } on-error={}
:log info "NAVSPOT: Hotspot v${VERSION} com portal externo ativo"
```

**Benefícios:**
1. Remove completamente o `:if ([:len $_hsprof] = 0) do={...}` problemático
2. Usa apenas `:do { } on-error={}` que é seguro para `/import`
3. Mantém idempotência (pode rodar múltiplas vezes sem erro)
4. Linhas curtas (<100 chars)

---

## Nova Regra de Linter (Opcional)

```typescript
// v6.9.39: Block :if ([:len $var]) patterns in /import scripts
// This pattern can cause syntax errors during /import in RouterOS 6.x
{ regex: /:if \(\[:len \$[^]]+\]\)/, desc: ':if ([:len $var]) pattern breaks /import (use :do {} on-error={} instead)' },
```

---

## Verificação da Interpolação de Placeholders

Confirmar que o TypeScript está gerando:

```routeros
:local urlVars1 "&mac=@@RUNTIME_MAC@@"
```

E NÃO:

```routeros
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"
```

Se o segundo estiver acontecendo, a correção é usar interpolação explícita no template:

```typescript
// ERRADO (literal):
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"

// CORRETO (interpolado):
:local urlVars1 "&mac=${RUNTIME_PLACEHOLDERS.mac}"  // Dentro de template `` funciona
```

Verificar se a linha está dentro do template literal que começa na linha 728.

---

## Testes a Adicionar

1. **Teste de sintaxe**: Verificar que não há `:if ([:len $` no output final
2. **Teste de placeholders**: Verificar que `@@RUNTIME_` não aparece no output final
3. **Teste de linhas longas**: Já existe (< 160 chars)

---

## Checklist de Implementação

| Item | Descrição |
|------|-----------|
| VERSION 6.9.39 | Atualizar em generator, recovery, ScriptModal |
| Remover `:if ([:len)` | Substituir por `:do { } on-error={}` |
| Simplificar hotspot block | Uma única tentativa de add + sets |
| Verificar placeholders | Confirmar interpolação correta |
| Adicionar linter rule | Bloquear `:if ([:len $` pattern |
| Deploy | Testar `/import` no MikroTik |

---

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.39.rsc
# Deve completar SEM "syntax error"

/ip hotspot profile print where name="hsprof-navspot"
# Deve mostrar profile configurado

/log print where message~"NAVSPOT"
# Deve mostrar: INSTALACAO CONCLUIDA!
```

