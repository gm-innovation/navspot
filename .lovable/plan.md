

# Correção Cirúrgica v7.1.21: Fix de Sanitização e Parsing de Profile

## Diagnóstico Preciso

### Bug 1: `sanitizePipeForFileContents` quebra placeholders
**Localização**: `supabase/functions/mikrotik-sync/index.ts` linha 17
**Problema**: O `.replace(/\\/g, "/")` transforma `\$(mac)` em `/$(mac)`
**Impacto**: O RouterOS interpreta `$(mac)` como variável de script em vez de placeholder de runtime

```typescript
// CÓDIGO ATUAL (ERRADO)
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // OK - remove caracteres de controle
    .replace(/"/g, "'")             // OK - aspas duplas para simples
    .replace(/\\/g, "/")            // ❌ BUG - quebra \$(mac) virando /$(mac)
}
```

### Bug 2: Parser de `create_profile` não suporta 4 parâmetros
**Localização**: `supabase/functions/mikrotik-scripts/index.ts` linhas 644-678
**Problema**: O parser só extrai `name|rate|shared`, mas o backend envia `name|rate|shared|limitBytes`
**Impacto**: `pShared` captura `1|104857600` (tudo depois do terceiro pipe), causando erro em `shared-users=1|104857600`

```routeros
# COMPORTAMENTO ATUAL (ERRADO)
# Pipe recebido: create_profile|tripulacao-padrao|2M/5M|1|104857600
# Resultado do parsing:
#   pName = "tripulacao-padrao"
#   pRate = "2M/5M"  
#   pShared = "1|104857600"  <- ❌ VALOR INVÁLIDO
```

---

## Correções Cirúrgicas

### Correção 1: Ajustar `sanitizePipeForFileContents`
**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`
**Linhas**: 11-18

```typescript
// v7.1.21: Sanitize pipe string - NÃO substituir backslash
function sanitizePipeForFileContents(pipe: string): string {
  return pipe
    .replace(/[\x00-\x1F]/g, '')    // Remove control characters
    .replace(/"/g, "'")             // Double quotes -> single (safer in MikroTik)
    // REMOVIDO: .replace(/\\/g, "/") - quebrava \$(mac) -> /$(mac)
}
```

### Correção 2: Parser de `create_profile` com 4 parâmetros
**Arquivo**: `supabase/functions/mikrotik-scripts/index.ts`
**Linhas**: 644-678 (handler `create_profile` dentro de `generateActionProcessorSource`)

```routeros
:if ($cmd = "create_profile") do={
:do {
:local p2 [:find $rest "|"]
:if ($p2 >= 0) do={
:local pName [:pick $rest 0 $p2]
:if ([:len $pName] > 0) do={
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
# v7.1.21: Check for 4th parameter (limitBytes) - ignore it, just don't let it corrupt pShared
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={
:set pShared [:pick $sub2 0 $p4]
# limitBytes is in rest of sub2 but MikroTik doesn't use it directly
} else={
:set pShared $sub2
}
} else={
:set pRate $sub
}
# ... resto do handler permanece igual
```

### Correção 3: Fallback inline também precisa parsing robusto
**Arquivo**: `supabase/functions/mikrotik-scripts/index.ts`
**Linhas**: ~358 (fallback inline na função `generateAllScripts`)

O fallback inline atual não processa `create_profile` corretamente. Precisa usar a mesma lógica de 4 parâmetros.

### Correção 4: Bump de versão
Atualizar VERSION para "7.1.21" em:
- `supabase/functions/mikrotik-sync/index.ts` (linha 9)
- `supabase/functions/mikrotik-scripts/index.ts` (linha 34)
- `supabase/functions/mikrotik-script-generator/index.ts`
- `src/components/modals/ScriptModal.tsx`
- `src/pages/Embarcacoes.tsx`

---

## Impacto das Mudanças

| Mudança | Antes (Quebrado) | Depois (Correto) |
|---------|------------------|------------------|
| Sanitização | `\$(mac)` → `/$(mac)` | `\$(mac)` preservado |
| create_profile 4 params | `pShared = "1|104857600"` | `pShared = "1"` |
| Fallback inline | Parsing de 2 params | Parsing de 4 params |

---

## Validação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.21.rsc

# Verificar logs de instalação
/log print where message~"NAVSPOT-INSTALL" last=30

# Testar sync e ver se action-processor executa sem erro
/system script run navspot-sync
/log print where message~"NAVSPOT" last=40

# Esperado:
# - "NAVSPOT-ACTION v7.1.21: Start"
# - "NAVSPOT-ACTION: len=XXX" (tamanho do arquivo de ações)
# - "NAVSPOT: Perfil criado - tripulacao-padrao" (ou similar)
# - "NAVSPOT-ACTION v7.1.21: OK - X acoes"
```

---

## Checklist de Implementação

- [ ] Remover `.replace(/\\/g, "/")` em `mikrotik-sync/index.ts`
- [ ] Atualizar parsing de `create_profile` para 4 parâmetros em `mikrotik-scripts/index.ts`
- [ ] Atualizar fallback inline para parsing robusto
- [ ] Bump VERSION para 7.1.21 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar em MikroTik

