

# Plano v6.9.11: Correção Crítica do Cálculo de Consumo

## Problemas Identificados

### 1. Bug de Acumulação Infinita (Linha 576)
```typescript
// CÓDIGO ATUAL (BUGADO)
bytes_consumidos: tripulante.bytes_consumidos + totalBytes
```

O MikroTik envia **valores absolutos** (total desde início da sessão). O código **soma** esse valor a cada sync:

| Sync | MikroTik envia | Código faz | Resultado |
|------|----------------|------------|-----------|
| 1 | 1 MB | 0 + 1 MB | 1 MB ✓ |
| 2 | 1 MB | 1 MB + 1 MB | 2 MB ✗ |
| 3 | 1 MB | 2 MB + 1 MB | 3 MB ✗ |

**Evidência atual:**
- `sessoes_wifi.bytes_in + bytes_out` = ~1 MB (correto)
- `tripulantes.bytes_consumidos` = **6.6 MB** (inflado ~6x)

### 2. Dashboard Usa Fontes Diferentes
| Componente | Fonte de Dados | Estado |
|------------|----------------|--------|
| Consumo Total (dashboard) | `sessoes_wifi` | ✓ Correto |
| Top Consumidores | `tripulantes.bytes_consumidos` | ✗ Inflado |
| Detalhes Tripulante | `tripulantes.bytes_consumidos` | ✗ Inflado |

### 3. Quota Não Bloqueando Usuário
O perfil tem limite de 100 MB, mas o usuário baixou 100 MB e não foi bloqueado. Isso ocorre porque:
- O sistema gera **alertas** quando a quota é excedida
- **NÃO existe ação de desconexão** quando quota >= 100%
- O usuário continua navegando mesmo após exceder a quota

---

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `mikrotik-sync/index.ts` | Calcular DELTA de bytes em vez de somar absolutos | Crítica |
| `mikrotik-sync/index.ts` | Desconectar usuário quando quota >= 100% | Alta |
| `mikrotik-sync/index.ts` | Corrigir bug na linha 645 (dispositivos) | Crítica |

---

## Solução 1: Calcular Delta de Consumo

### Mudança no Fluxo

Reorganizar para buscar a sessão ativa ANTES de atualizar o consumo:

```typescript
// NOVO CÓDIGO (linhas ~571-590)

// v6.9.11: Buscar sessão ativa para calcular delta
const { data: activeSession } = await supabase
  .from('sessoes_wifi')
  .select('id, bytes_in, bytes_out')
  .eq('tripulante_id', tripulante.id)
  .eq('hotspot_id', hotspot.id)
  .eq('mac_address', activeUser.mac)
  .eq('status', 'ativa')
  .maybeSingle()

// v6.9.11: Calcular DELTA (diferença) desde último sync
const previousBytesIn = activeSession?.bytes_in || 0
const previousBytesOut = activeSession?.bytes_out || 0

// Detectar reset de sessão (reconexão): se valor atual < anterior
const deltaIn = activeUser.bytes_in < previousBytesIn 
  ? activeUser.bytes_in  // Nova sessão
  : activeUser.bytes_in - previousBytesIn

const deltaOut = activeUser.bytes_out < previousBytesOut
  ? activeUser.bytes_out
  : activeUser.bytes_out - previousBytesOut

const deltaBytes = deltaIn + deltaOut

console.log(`[mikrotik-sync] v6.9.11: Delta for ${activeUser.user}: ${deltaBytes} bytes (in: ${deltaIn}, out: ${deltaOut})`)

// Atualizar consumo com DELTA (não absoluto)
await supabase
  .from('tripulantes')
  .update({
    bytes_consumidos: tripulante.bytes_consumidos + deltaBytes,
    ultimo_login: new Date().toISOString()
  })
  .eq('id', tripulante.id)
```

---

## Solução 2: Desconectar Usuário Quando Quota >= 100%

Após gerar o alerta de quota excedida, adicionar ação de desconexão:

```typescript
// Após linha 558 (dentro do if percentage >= 100)
if (percentage >= 100) {
  // Criar alerta (já existe)
  await createAlertIfNotRecent(supabase, {...})
  
  // v6.9.11: Adicionar ação para desconectar usuário
  formattedActions.push({
    id: `kick-quota-${tripulante.id}`,
    type: 'kick_session',
    payload: { 
      user: activeUser.user, 
      reason: 'Quota de dados excedida' 
    }
  })
  
  console.log(`[mikrotik-sync] v6.9.11: Kicking user ${activeUser.user} - quota exceeded (${Math.round(percentage)}%)`)
}
```

---

## Solução 3: Corrigir Bug de Dispositivo (Linha 645)

```typescript
// CÓDIGO ATUAL (linha 645) - BUGADO
bytes_consumidos: (existingDevice as { bytes_consumidos?: number }).bytes_consumidos || 0 + totalBytes

// CORREÇÃO - usar delta e corrigir precedência de operadores
bytes_consumidos: ((existingDevice as { bytes_consumidos?: number }).bytes_consumidos || 0) + deltaBytes
```

---

## Fluxo Corrigido

```text
Sync 1 (sessão nova):
├── MikroTik: bytes_in=1MB, bytes_out=100KB
├── Sessão anterior: não existe (prevIn=0, prevOut=0)
├── Delta: 1MB + 100KB = 1.1MB
├── tripulante.bytes_consumidos: 0 + 1.1MB = 1.1MB ✓

Sync 2 (mesma sessão):
├── MikroTik: bytes_in=50MB, bytes_out=500KB
├── Sessão anterior: bytes_in=1MB, bytes_out=100KB
├── Delta: (50-1)MB + (500-100)KB = 49.4MB
├── tripulante.bytes_consumidos: 1.1MB + 49.4MB = 50.5MB ✓

Sync 3 (quota excedida):
├── MikroTik: bytes_in=100MB, bytes_out=1MB
├── Delta calculado: 50.5MB
├── bytes_consumidos: 50.5 + 50.5 = 101MB
├── percentage: 101% → QUOTA EXCEEDED
├── → Gera alerta ✓
├── → Adiciona ação kick_session ✓
└── Usuário desconectado no próximo sync do MikroTik ✓
```

---

## Reset de Dados Após Deploy

Após implementar, executar SQL para corrigir dados inflados:

```sql
-- Recalcular bytes_consumidos baseado em sessões ativas
UPDATE tripulantes t
SET bytes_consumidos = COALESCE((
  SELECT SUM(bytes_in + bytes_out)
  FROM sessoes_wifi s
  WHERE s.tripulante_id = t.id
), 0)
WHERE embarcacao_id = '5e5f8e0e-2f27-49ef-b104-e0b27ccdeca0';
```

---

## Impacto

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Consumo tripulante | Infla a cada sync | Delta correto |
| Dashboard | Inconsistente | Dados coerentes |
| Quota 100% | Apenas alerta | Desconecta usuário |
| Dispositivo | Consumo errado | Delta correto |

---

## Mudanças por Arquivo

### `supabase/functions/mikrotik-sync/index.ts`

1. **Linhas 570-580**: Substituir lógica de totalBytes por cálculo de delta
2. **Linhas 549-558**: Adicionar ação `kick_session` quando quota >= 100%
3. **Linha 645**: Corrigir precedência de operadores e usar delta

---

## Resumo Técnico

- **Bug crítico**: `tripulante.bytes_consumidos + totalBytes` → `tripulante.bytes_consumidos + deltaBytes`
- **Fórmula delta**: `delta = current - previous` (ou `current` se reset detectado)
- **Quota enforcement**: Adicionar `kick_session` quando `percentage >= 100`
- **Compatibilidade**: Requer regenerar script no MikroTik para suportar `kick_session` (já existe no protocolo)

