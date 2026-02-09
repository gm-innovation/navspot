

# Fix v7.1.58d: Resolver login invalido do tripulante

## Resumo

O hotspot voltou a ficar Online (fix v7.1.58c funcionou), mas o login do tripulante continua falhando. A investigacao revelou 3 problemas interligados:

1. **6 acoes presas no banco** (desde 03-05/fev) que nunca sao marcadas como executadas
2. **Filtro de UUID quebrado** que impede a marcacao de QUALQUER acao como executada
3. **Escape duplo na login-url** que corrompe os placeholders `$(mac)` do portal cativo

## Mudancas

### 1. Migration SQL: Limpar 6 acoes presas

Marcar as 6 acoes pendentes como `executado` para parar de reenvia-las em todo sync:

```sql
UPDATE acoes_pendentes 
SET status = 'executado', executed_at = NOW() 
WHERE hotspot_id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1' 
  AND status = 'pendente';
```

### 2. mikrotik-sync/index.ts: Filtro UUID no mark-as-executed (linhas 1553-1568)

O codigo atual filtra por prefixo (`auto-`, `initial-`) mas nao por formato UUID. IDs como `repair-config-profile` ou `rollout-config-profile` causam erro de tipo no PostgreSQL (`invalid input syntax for type uuid`), fazendo a query inteira falhar.

**Correcao**: Filtrar por regex UUID em vez de prefixo:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const actionIds = expandedActions
  .filter(a => UUID_REGEX.test(a.id))
  .map(a => a.id)
```

### 3. mikrotik-sync/index.ts: Remover escape duplo do login URL

O `$(mac)` e escapado duas vezes:
- Linha 1442 (auto-repair): `escapeRouterOSPlaceholders()` converte `$(mac)` para `\$(mac)` no payload
- Linha 1583 (pipe generation): `escapeRouterOSPlaceholders()` converte novamente `\$(mac)` para `\\$(mac)`

O RouterOS le o pipe como texto cru do arquivo, entao ve `\\$(mac)` literalmente, quebrando o portal.

**Correcao em 2 pontos**:

a) **Linha 1442-1444** (auto-repair): Remover `escapeRouterOSPlaceholders()` -- guardar URL crua no payload:
```typescript
const loginUrl = `https://${portalHost}/hotspot-login?hotspot_id=${hotspot.id}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
```

b) **Linha 1583** (pipe generation): Manter UMA unica chamada a `escapeRouterOSPlaceholders()` aqui, que e o ponto correto (antes de escrever no pipe):
```typescript
// Ja esta correto -- escapa uma vez so aqui
const escapedLoginUrl = escapeRouterOSPlaceholders(String(p.login_url || ''))
```

Isso garante que o escape acontece uma unica vez, no momento certo.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | Marcar 6 acoes presas como executado |
| `supabase/functions/mikrotik-sync/index.ts` | Linhas 1442-1444: remover escapeRouterOSPlaceholders do auto-repair |
| `supabase/functions/mikrotik-sync/index.ts` | Linhas 1555-1557: filtrar por UUID_REGEX |

## O que NAO muda

- A funcao `extractFirstJsonObject` (fix v7.1.58c) permanece intacta
- A logica de parse-first + fallback permanece intacta
- O `http-data=($b)` no mikrotik-scripts permanece intacto
- A logica de reconciliacao de perfis/usuarios permanece intacta
- O pipe generation para outros tipos de acao permanece intacto

## Resultado esperado

1. Migration limpa as 6 acoes presas imediatamente
2. Proximo sync: payload reduzido (apenas acoes reais de reconciliacao)
3. Filtro UUID garante que acoes com IDs sinteticos nao quebram a query
4. Login URL com `\$(mac)` correto (escape unico) permite portal funcionar
5. Tripulante consegue fazer login via portal cativo

## Secao tecnica

### Fluxo do escape (antes e depois)

**ANTES (quebrado)**:
```text
auto-repair payload: \$(mac)     [escapeRouterOSPlaceholders aplicado]
pipe generation:     \\$(mac)    [escapeRouterOSPlaceholders aplicado NOVAMENTE]
RouterOS le:         \\$(mac)    [literal - portal quebrado]
```

**DEPOIS (correto)**:
```text
auto-repair payload: $(mac)      [sem escape - URL crua]
pipe generation:     \$(mac)     [escapeRouterOSPlaceholders aplicado UMA vez]
RouterOS le:         \$(mac)     [armazena como $(mac) para expansao em runtime]
```

### Cadeia de causalidade das acoes presas

```text
acoes_pendentes tem 6 rows pendente com UUIDs validos
  -> sync monta formattedActions com essas 6 + acoes sinteticas (repair-*, auto-*)
  -> expandedActions contem mix de UUIDs e strings
  -> filtro por prefixo NAO remove 'repair-config-profile'
  -> actionIds = ['uuid1', 'uuid2', ..., 'repair-config-profile']
  -> UPDATE ... IN ('uuid1', ..., 'repair-config-profile') -> ERRO PostgreSQL
  -> NENHUMA acao marcada como executada
  -> Proximo sync: mesmas 6 acoes voltam -> loop infinito
```
