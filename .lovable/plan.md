
# Alinhamento Backend ao Contrato v7.8.24: Parser Flexível + Comandos Corrigidos + Template

## Estado Atual vs. Contrato v7.8.24

Três gaps críticos existem no código atual:

**Gap 1 — Parser rígido (linha 135 do `mikrotik-sync/index.ts`)**
O guard `if (parts.length >= 4)` descarta TODAS as entradas do CSV enviado pelo script v7.8.24, que só envia 3 colunas (`user,mac,uptime`). Resultado: zero usuários processados, consumo nulo, status sempre "offline".

**Gap 2 — `block_quota` com parâmetro extra (linha 1878)**
O backend envia `block_quota|MAC|user`, mas o script v7.8.24 faz split por `|` e usa apenas o índice 1 como MAC. O valor que o script recebe é `MAC|user`, o que invalida a busca no ip-binding do MikroTik — o bloqueio nunca é aplicado.

**Gap 3 — `force_reg` não implementado (linhas 1877-1888)**
O script v7.8.24 já suporta o comando `force_reg|username`, mas o backend nunca gera esse comando. Tripulantes com `status = 'pendente_cadastro'` são tratados como usuários normais no reconciliador (`create_user`), em vez de receberem um redirecionamento forçado para o portal.

---

## Alterações Planejadas

### 1. Corrigir `parseActiveUsersCsv` (linha 122–148)

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Substituir a função atual por uma versão flexível que aceita 2, 3 ou 5+ colunas:

```typescript
// v7.8.24: Flexible CSV parser — supports 2-col (user,mac), 3-col (user,mac,uptime) v7.8.24
// and 5-col (user,mac,bytes_in,bytes_out,uptime) v7.8.26+
function parseActiveUsersCsv(csv: string): ActiveUser[] {
  if (!csv || csv.trim().length === 0) return []
  const users: ActiveUser[] = []
  const entries = csv.split(';').filter(e => e.trim().length > 0)
  for (const entry of entries) {
    const parts = entry.split(',').map(p => p.trim())
    if (parts.length < 2) continue  // Need at minimum user + mac
    const col2 = parts[2] || ''
    // Detect v7.8.26+ format: col[2] is purely numeric (bytes_in)
    const isExtendedFormat = parts.length >= 4 && /^\d+$/.test(col2)
    users.push({
      user: parts[0],
      mac: parts[1],
      uptime: isExtendedFormat ? (parts[4] || '0') : (col2 || '0'),
      bytes_in: isExtendedFormat ? (parseInt(col2, 10) || 0) : 0,
      bytes_out: isExtendedFormat ? (parseInt(parts[3], 10) || 0) : 0,
      ip: parts[5] || undefined
    })
  }
  return users
}
```

**Impacto imediato:** Usuários ativos passam a ser detectados e o hotspot aparece como "online".

---

### 2. Corrigir `block_quota` no pipe (linha 1878)

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

```typescript
// Antes:
case 'block_quota':
  return `block_quota|${p.mac || ''}|${p.user || ''}`

// Depois (v7.8.24 compatible — script só aceita MAC):
case 'block_quota':
  return `block_quota|${p.mac || ''}`
```

**Impacto:** Bloqueio de cota passa a funcionar corretamente no MikroTik.

---

### 3. Implementar `force_reg` no reconciliador e no pipe

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**a) No reconciliador de usuários (próximo ao trecho da linha 451):**
Tripulantes com `status = 'pendente_cadastro'` devem gerar `force_reg` em vez de `create_user`:

```typescript
// v7.8.24: force_reg for pendente_cadastro users
if (tripulante.status === 'pendente_cadastro') {
  newActionsToInject.push({
    id: `auto-force-reg-${login}`,
    type: 'force_reg',
    payload: { user: login }
  })
  meta.last_synced_at = now
  continue  // Skip create_user logic
}
```

**b) No switch do pipe (após linha 1888 — default):**
Adicionar case para `force_reg`:

```typescript
case 'force_reg':
  return `force_reg|${p.user || ''}`
```

**c) Na categorização de prioridade (trecho das linhas 1704-1758):**
`force_reg` deve ser categorizado como `userActions` (mesma prioridade que `create_user`):

```typescript
else if (action.type === 'force_reg') {
  userActions.push(action)
}
```

---

### 4. Bump de versão

Atualizar a constante `VERSION` no topo do arquivo de `7.8.7` para `7.8.24` para refletir o alinhamento de contrato.

---

### 5. Migration SQL: Atualizar template `sync` no banco

**Arquivo:** nova migration em `supabase/migrations/`

Atualizar a tabela `script_templates` com o conteúdo do script v7.8.24 enviado pelo usuário, substituindo os valores hardcoded por placeholders:
- Token de autenticação → `{{SYNC_TOKEN}}`
- URL do backend → `{{SYNC_URL}}`
- Versão → `{{VERSION}}`

```sql
UPDATE public.script_templates
SET content = $ts$
# [conteúdo do navspot-sync-v7.8.24.rsc com placeholders]
$ts$,
version = '7.8.24',
updated_at = now()
WHERE id = 'sync';
```

Isso garante que ao gerar um novo script via `mt-gen`, o roteador receba o script v7.8.24 com a lógica correta de `force_reg`, `block_quota|MAC` e o parser CSV de 3 colunas.

---

## Arquivos Modificados

| Arquivo | Linha(s) | Mudança |
|---|---|---|
| `supabase/functions/mikrotik-sync/index.ts` | 122–148 | Parser flexível (≥2 colunas) |
| `supabase/functions/mikrotik-sync/index.ts` | 1878 | `block_quota` sem `|user` |
| `supabase/functions/mikrotik-sync/index.ts` | ~451 | `force_reg` para `pendente_cadastro` |
| `supabase/functions/mikrotik-sync/index.ts` | ~1750 | Categorizar `force_reg` em `userActions` |
| `supabase/functions/mikrotik-sync/index.ts` | ~1885 | Case `force_reg` no switch do pipe |
| `supabase/functions/mikrotik-sync/index.ts` | topo | VERSION `7.8.24` |
| `supabase/migrations/YYYYMMDD_sync_template_v7824.sql` | — | UPDATE em `script_templates` |

---

## Ordem de Execução

1. Migration SQL — atualiza template `sync` no banco com script v7.8.24
2. Editar `mikrotik-sync/index.ts` — todas as 4 correções de código
3. Deploy automático da edge function
4. Próximo sync do roteador (~1 min): CSV com 3 colunas é processado corretamente

---

## Resultado Esperado Após Deploy

- Fim do Erro 500: parser aceita o CSV de 3 colunas sem exceção
- Dashboard mostra tripulantes Online: `active_count` > 0 processado corretamente
- Bloqueio de cota funciona: `block_quota|MAC` chega ao MikroTik no formato correto
- Redirecionamento de cadastro funciona: tripulantes `pendente_cadastro` recebem `force_reg|username`
- Consumo em MB: será zerado por enquanto (esperado), ativado ao migrar para script v7.8.26

---

## Nota sobre Compatibilidade Futura (v7.8.26)

O parser flexível detecta automaticamente o formato estendido quando `col[2]` é numérico — scripts futuros que enviem `user,mac,bytes_in,bytes_out,uptime` serão processados sem nenhuma mudança adicional no backend.
