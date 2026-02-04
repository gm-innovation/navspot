
# Correção v7.1.12: Sintaxe de Variáveis RouterOS

## Problema Identificado

O script `navspot-action-processor` está marcado como **Invalid (I)** mesmo após o import bem-sucedido. O erro está na linha que configura `login-url`:

```routeros
:do { /ip hotspot profile set $hsprof login-url="$loginUrl" } on-error={}
```

**Causa raiz**: Em RouterOS, `"$variavel"` **não expande** a variável — o texto literal `$loginUrl` é passado. O parser do RouterOS 6.x rejeita essa sintaxe em tempo de validação, marcando o script como inválido.

## Solução RouterOS 6.x

A forma correta de passar uma variável que contém caracteres especiais (`&`, `?`, `=`) em RouterOS é:

```routeros
# Opção 1: Sem aspas (variável expande)
login-url=$loginUrl

# Opção 2: Concatenação explícita (variável expande)  
login-url=("" . $loginUrl)
```

A **Opção 2** é mais robusta porque força o contexto de expressão, garantindo que caracteres especiais sejam tratados como parte do valor.

## Mudanças Técnicas v7.1.12

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

**1) Corrigir `generateActionProcessorSource()` - Linhas 566-567**

Alterar de:
```typescript
:do { /ip hotspot profile set $hsprof login-url="$loginUrl" } on-error={ :log warning "NAVSPOT: falha set login-url" }
:do { /ip hotspot profile set $hsprof dns-name="$dnsName" } on-error={ :log warning "NAVSPOT: falha set dns-name" }
```

Para (usando concatenação explícita):
```typescript
:do { /ip hotspot profile set $hsprof login-url=("" . $loginUrl) } on-error={ :log warning "NAVSPOT: falha set login-url" }
:do { /ip hotspot profile set $hsprof dns-name=("" . $dnsName) } on-error={ :log warning "NAVSPOT: falha set dns-name" }
```

**2) Bump de versão para 7.1.12**

- Atualizar `const VERSION = "7.1.12"`
- Atualizar docblock com descrição da correção

### Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`

- Bump `VERSION = "7.1.12"`
- Atualizar `DEPLOYED_AT`

### Arquivo: `src/components/modals/ScriptModal.tsx`

- Default `scriptVersion="7.1.12"`

### Arquivo: `src/pages/Embarcacoes.tsx`

- Fallback `currentScriptVersion="7.1.12"`

## Resumo da Correção

| Linha | Antes (v7.1.11) | Depois (v7.1.12) |
|-------|-----------------|------------------|
| 566 | `login-url="$loginUrl"` | `login-url=("" . $loginUrl)` |
| 567 | `dns-name="$dnsName"` | `dns-name=("" . $dnsName)` |

## Validação no MikroTik

1. Gerar bootstrap v7.1.12 e importar
2. Verificar script: `/system script print where name="navspot-action-processor"`
   - Esperado: **sem flag I (invalid)**
3. Rodar manualmente: `/system script run navspot-action-processor`
   - Esperado: log `NAVSPOT-ACTION v7.1.12: Start` e `OK`
4. Verificar profile: `/ip hotspot profile print detail where name="hsprof-navspot"`
   - Esperado: `login-url` com a URL completa (incluindo `$(mac)`, `$(ip)`)

## Arquivos Alterados

- `supabase/functions/mikrotik-scripts/index.ts`
- `supabase/functions/mikrotik-script-generator/index.ts`
- `src/components/modals/ScriptModal.tsx`
- `src/pages/Embarcacoes.tsx`
