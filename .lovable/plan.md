

# Plano v6.9.5: Correção de Formatação do Rate-Limit e Robustez do Sync

## Diagnóstico Completo

Você identificou corretamente a causa raiz. O problema está no formato dos dados:

```
create_profile|tripulacao-googlemarine|3MB/3MB|1|104857600;
```

### Problemas Identificados:

| Problema | Valor Atual | Valor Esperado | Motivo |
|----------|-------------|----------------|--------|
| Rate-limit com "B" | `3MB/3MB` | `3M/3M` | RouterOS não aceita "MB", apenas "M", "k", ou "G" |
| Dados no banco | `3mb` | `3M` | Armazenado incorretamente com "mb" minúsculo |
| Extração do pipe | `[[ ...]]` sem trim | Conteúdo limpo | Espaços extras podem causar falha no parsing |

### Origem do Erro:

1. **Banco de dados**: O perfil "Tripulação Googlemarine" tem `velocidade_download: 3mb` e `velocidade_upload: 3mb`
2. **Backend** (linha 627-629): Converte para maiúsculas → `3MB/3MB` (ainda com 'B')
3. **MikroTik**: Rejeita `3MB` porque o sufixo válido é apenas `M` (megabit)

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Normalizar rate-limit: remover "B" e forçar maiúsculas |
| `supabase/functions/mikrotik-sync/index.ts` | Trim do conteúdo extraído do pipe |
| `supabase/functions/mikrotik-script-generator/index.ts` | Trim robusto na extração do pipe |
| `supabase/functions/mikrotik-script-generator/index.ts` | Ignorar linhas vazias no action processor |
| Migração SQL | Corrigir dados existentes no banco |

---

## Correção 1: Normalização do Rate-Limit no Backend

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Linhas 626-630 - Código Atual:**
```typescript
// v6.9.1: Garantir formato maiúsculo para compatibilidade RouterOS
const uploadRate = String(p.velocidade_upload || '2M').toUpperCase()
const downloadRate = String(p.velocidade_download || '5M').toUpperCase()
const rateLimit = `${uploadRate}/${downloadRate}`
```

**Código Corrigido:**
```typescript
// v6.9.5: Normalizar rate-limit - remover "B" e forçar maiúsculas
// RouterOS aceita: k (kbit), M (megabit), G (gigabit) - SEM o "B"
function normalizeRateLimit(value: string): string {
  return String(value || '2M')
    .toUpperCase()
    .replace(/MB/g, 'M')  // 3MB -> 3M
    .replace(/KB/g, 'K')  // 512KB -> 512K
    .replace(/GB/g, 'G')  // 1GB -> 1G
    .trim()
}
const uploadRate = normalizeRateLimit(p.velocidade_upload)
const downloadRate = normalizeRateLimit(p.velocidade_download)
const rateLimit = `${uploadRate}/${downloadRate}`
```

**Linha 729 - Mesma correção:**
```typescript
// v6.9.5: Normalizar rate-limit
const rateLimit = normalizeRateLimit(String(p.rate_limit || '2M/5M'))
return `create_profile|${p.name || ''}|${rateLimit}|${p.shared_users || 1}|${p.limit_bytes || 0}`
```

---

## Correção 2: Trim na Extração do Pipe (Backend)

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Linha 754 - Código Atual:**
```typescript
// v6.9: Wrap in [[ ]] markers for RouterOS extraction
const formattedPipe = pipeDelimitedActions ? `[[ ${pipeDelimitedActions}; ]]` : ''
```

**Código Corrigido (remover espaços dentro dos delimitadores):**
```typescript
// v6.9.5: Wrap em [[ ]] SEM espaços extras para extração limpa
const formattedPipe = pipeDelimitedActions ? `[[${pipeDelimitedActions};]]` : ''
```

---

## Correção 3: Extração Robusta no Script MikroTik

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 258-262 (syncScriptSource) - Código Atual:**
```routeros
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local actions [:pick $resp ($start + 2) $end]
:global navspotActions $actions
```

**Código Corrigido (com trim e log de debug):**
```routeros
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local raw [:pick $resp ($start + 2) $end]
# v6.9.5: Trim de espaços no início e fim
:local i 0
:local j ([:len $raw] - 1)
:while (($i <= $j) && ([:pick $raw $i ($i + 1)] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $raw $j ($j + 1)] = " ")) do={:set j ($j - 1)}
:local actions ""
:if ($j >= $i) do={:set actions [:pick $raw $i ($j + 1)]}
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:log info ("NAVSPOT-DEBUG: raw=[" . $actions . "]")
```

---

## Correção 4: Action Processor Resiliente a Linhas Vazias

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 296 (actionProcessorSource) - Adicionar verificação:**

No loop do action processor, já existe verificação de linha vazia, mas precisa ser mais robusta. A linha atual:
```routeros
:if ($j < $i) do={:set pos ($endPos + 1)}
```

**Código Corrigido (skip completo se vazio):**
```routeros
:if ($j < $i) do={
# v6.9.5: Linha vazia ou só espaços, pular completamente
:set pos ($endPos + 1)
} else={
# ... resto do processamento apenas se não for vazio
```

A estrutura atual já faz isso implicitamente, mas podemos melhorar com um `:continue` ou garantindo que `$p1` não seja buscado em string vazia.

---

## Correção 5: Migração SQL para Corrigir Dados Existentes

Executar no banco de dados para corrigir perfis existentes:

```sql
-- v6.9.5: Normalizar velocidades - remover "b" do sufixo
UPDATE perfis_velocidade
SET 
  velocidade_download = UPPER(REPLACE(REPLACE(velocidade_download, 'mb', 'M'), 'kb', 'K')),
  velocidade_upload = UPPER(REPLACE(REPLACE(velocidade_upload, 'mb', 'M'), 'kb', 'K'))
WHERE 
  velocidade_download ILIKE '%mb%' 
  OR velocidade_download ILIKE '%kb%'
  OR velocidade_upload ILIKE '%mb%'
  OR velocidade_upload ILIKE '%kb%';

-- Verificar resultado
SELECT nome, velocidade_download, velocidade_upload FROM perfis_velocidade;
```

---

## Correção 6: Atualizar Versão para v6.9.5

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Buscar e substituir todas as ocorrências de "v6.9.4" por "v6.9.5".

---

## Estrutura Final do Pipeline v6.9.5

```text
┌──────────────────────────────────────────────────────────────┐
│ BANCO DE DADOS (perfis_velocidade)                           │
│ velocidade_download: "3M" (normalizado)                      │
│ velocidade_upload: "3M" (normalizado)                        │
└──────────────────────┬───────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ MIKROTIK-SYNC (Backend)                                      │
│ normalizeRateLimit("3M") → "3M"                              │
│ rateLimit = "3M/3M"                                          │
│ pending_actions_pipe = "[[create_profile|...|3M/3M|...;]]"   │
└──────────────────────┬───────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ MIKROTIK (RouterOS)                                          │
│ Extração: [:pick $resp ($start + 2) $end] → trim             │
│ Parsing: "create_profile|name|3M/3M|1|0"                     │
│ Execução: /ip hotspot user profile add rate-limit=3M/3M      │
└──────────────────────────────────────────────────────────────┘
```

---

## Resumo das Correções

| Problema | Antes | Depois |
|----------|-------|--------|
| Rate-limit | `3MB/3MB` | `3M/3M` |
| Dados no banco | `3mb` | `3M` (via SQL) |
| Pipe delimitadores | `[[ ... ]]` (com espaços) | `[[...]]` (sem espaços) |
| Extração RouterOS | Sem trim | Com trim de espaços |
| Linhas vazias | Pode falhar | Skip robusto |

---

## Validação Pós-Implementação

1. Executar migração SQL para corrigir dados existentes
2. Regenerar script para hotspot de teste
3. Verificar logs do MikroTik:
   ```
   /log print where topics~"script"
   ```
4. Confirmar que não há erros de sintaxe no rate-limit
5. Testar criação de perfil via sync:
   ```
   /ip hotspot user profile print where name~"tripulacao"
   ```

---

## Impacto

- **Criticidade:** Alta (impede sincronização de perfis)
- **Risco:** Baixo (normalização de dados + robustez)
- **Compatibilidade:** RouterOS 6.x e 7.x

