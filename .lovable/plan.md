
# Plano v6.9.10: Correção de Parsing de Usuários Ativos e Ativação Automática

## Problema Crítico Identificado

### Evidência nos Logs
```
Received sync request: {
  "sync_token":"...",
  "active_users_csv":"alexandre.silva,04:BF:1B:6E:9F:E9,753628,438498;",
  "registered_users_csv":"default-trial,alexandre.silva,",
  "registered_profiles_csv":"default,tripulacao-googlemarine,"
}
```

O MikroTik envia corretamente os dados via `active_users_csv`, mas o backend NÃO FAZ PARSING deste campo!

---

## Bugs Identificados

| # | Bug | Impacto |
|---|-----|---------|
| 1 | `active_users_csv` não é parseado para `active_users[]` | Sessões, dispositivos e consumo nunca são registrados |
| 2 | Status `pendente_cadastro` nunca muda para `ativo` | Usuário sempre aparece como inativo no painel |
| 3 | `ultimo_login` nunca é atualizado | Dashboard mostra "Nunca conectou" |
| 4 | `bytes_consumidos` nunca acumula | Consumo sempre zerado |

---

## Solução

### 1. Adicionar Parsing de `active_users_csv`

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Adicionar função de parsing após as interfaces (linha ~55):**

```typescript
// v6.9.10: Parse active_users_csv from MikroTik into ActiveUser array
function parseActiveUsersCsv(csv: string): ActiveUser[] {
  if (!csv || csv.trim().length === 0) {
    return []
  }
  
  const users: ActiveUser[] = []
  
  // Format: "user,mac,bytes_in,bytes_out;user2,mac2,bytes_in2,bytes_out2;"
  const entries = csv.split(';').filter(e => e.trim().length > 0)
  
  for (const entry of entries) {
    const parts = entry.split(',').map(p => p.trim())
    
    if (parts.length >= 4) {
      users.push({
        user: parts[0],
        mac: parts[1],
        uptime: '0', // MikroTik doesn't send uptime in current format
        bytes_in: parseInt(parts[2], 10) || 0,
        bytes_out: parseInt(parts[3], 10) || 0,
        ip: parts[4] || undefined // Optional 5th field
      })
    }
  }
  
  return users
}
```

### 2. Invocar o Parsing no Início do Handler

**Após receber o payload (linha ~336):**

```typescript
const payload: SyncPayload = await req.json()
console.log('[mikrotik-sync] Received sync request:', JSON.stringify(payload))

// v6.9.10: Parse active_users_csv if provided as CSV string
if (!payload.active_users && (payload as any).active_users_csv) {
  const csvData = (payload as any).active_users_csv as string
  payload.active_users = parseActiveUsersCsv(csvData)
  console.log(`[mikrotik-sync] v6.9.10: Parsed ${payload.active_users.length} active users from CSV`)
}
```

### 3. Ativar Automaticamente Usuários `pendente_cadastro`

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Adicionar após atualizar o consumo do tripulante (linha ~542):**

```typescript
// Update consumption and last login
await supabase
  .from('tripulantes')
  .update({
    bytes_consumidos: tripulante.bytes_consumidos + totalBytes,
    ultimo_login: new Date().toISOString()
  })
  .eq('id', tripulante.id)

// v6.9.10: Auto-activate user on first successful login
if ((tripulante as any).status === 'pendente_cadastro') {
  await supabase
    .from('tripulantes')
    .update({ status: 'ativo' })
    .eq('id', tripulante.id)
  
  console.log(`[mikrotik-sync] v6.9.10: Auto-activated user ${tripulante.nome} on first login`)
}
```

### 4. Buscar Status do Tripulante na Query

**Atualizar a query de tripulante (linha ~441-449):**

```typescript
const { data: tripulante } = await supabase
  .from('tripulantes')
  .select(`
    id, bytes_consumidos, perfil_id, nome, login_wifi, quota_reset_at, status,
    perfis_velocidade(id, nome, max_dispositivos, limite_dados_mb, quota_periodo)
  `)
  .eq('login_wifi', activeUser.user)
  .eq('embarcacao_id', hotspot.embarcacao_id)
  .single()
```

---

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `mikrotik-sync/index.ts` | Adicionar função `parseActiveUsersCsv()` | Crítica |
| `mikrotik-sync/index.ts` | Invocar parsing após receber payload | Crítica |
| `mikrotik-sync/index.ts` | Buscar `status` na query de tripulante | Alta |
| `mikrotik-sync/index.ts` | Auto-ativar usuário em primeiro login | Alta |

---

## Fluxo Corrigido

```text
Sync recebido:
├── active_users_csv: "alexandre.silva,04:BF:1B:6E:9F:E9,753628,438498;"
├── v6.9.10: Parse CSV → active_users: [{user: "alexandre.silva", mac: "...", bytes_in: 753628, ...}]
├── Bloco de processamento EXECUTA:
│   ├── Busca tripulante no banco ✓
│   ├── Atualiza bytes_consumidos ✓
│   ├── Atualiza ultimo_login ✓
│   ├── Registra dispositivo (auto-register) ✓
│   ├── Cria/atualiza sessão WiFi ✓
│   └── v6.9.10: Se pendente_cadastro → ativo ✓
└── Dashboard reflete dados reais ✓
```

---

## Resumo das Correções

| Antes | Depois |
|-------|--------|
| `active_users_csv` ignorado | Parseado para `active_users[]` |
| Sessões nunca criadas | Sessões WiFi registradas |
| Dispositivos não registrados | Auto-registro de dispositivos |
| Consumo sempre zero | Bytes acumulados corretamente |
| `pendente_cadastro` permanente | Auto-ativa em primeiro login |
| `ultimo_login` sempre null | Atualizado a cada sync |

---

## Impacto

- **Criticidade:** Urgente (funcionalidade core quebrada)
- **Risco:** Baixo (adiciona parsing, não muda formato)
- **Dependência:** Nenhuma - não requer atualização do script MikroTik

---

## Testes Esperados

Após a correção, o próximo sync deve:

1. Logar: `"Parsed 1 active users from CSV"`
2. Criar registro em `dispositivos_registrados` para MAC `04:BF:1B:6E:9F:E9`
3. Criar registro em `sessoes_wifi` com status `ativa`
4. Atualizar `tripulantes.ultimo_login` e `bytes_consumidos`
5. Mudar status de `pendente_cadastro` para `ativo`
