
# Correção: Status de Hotspot Incorreto (Mostrando Online quando está Offline)

## Problema Identificado

O sistema mostra "Hotspot: Online" na lista de embarcações mesmo quando o hotspot não está sincronizando. Isso acontece porque:

| Fluxo Atual | Resultado |
|-------------|-----------|
| MikroTik envia sync | Status = online, ultima_sincronizacao = agora |
| MikroTik para de enviar | **Nada acontece** - status permanece "online" |

O banco de dados mostra:
- **Status**: online
- **Última sincronização**: 28/01/2026 às 20:56:13 (já faz tempo)
- **Intervalo configurado**: 1 minuto

O hotspot deveria estar "offline" pois não sincroniza há muito mais tempo que o intervalo configurado.

---

## Soluções Disponíveis

Existem duas abordagens para corrigir isso:

### Opção A: Cálculo Dinâmico no Frontend (Recomendada)

Em vez de confiar no campo `status` do banco, calcular dinamicamente se o hotspot está online baseado em:
- `ultima_sincronizacao` (quando foi a última vez que sincronizou)
- `sync_interval_minutes` (intervalo esperado entre sincronizações)

**Regra**: Se `ultima_sincronizacao` foi há mais de 2x o `sync_interval_minutes`, considerar offline.

**Vantagens**:
- Implementação imediata
- Não requer processos em background
- Sempre mostra estado real

### Opção B: Job Periódico no Backend

Criar uma Edge Function que roda periodicamente (cron) para verificar hotspots e marcar como offline aqueles que não sincronizam há tempo.

**Desvantagens**:
- Requer configuração de scheduler
- Pode haver atraso entre a detecção e a atualização

---

## Implementação Proposta (Opção A)

### 1. Criar Função de Cálculo de Status Real

```typescript
function getHotspotRealStatus(hotspot: {
  status: string;
  ultima_sincronizacao: string | null;
  sync_interval_minutes: number;
}): 'online' | 'offline' | 'alerta' {
  if (!hotspot.ultima_sincronizacao) {
    return 'offline';
  }
  
  const lastSync = new Date(hotspot.ultima_sincronizacao).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastSync) / (1000 * 60);
  
  // Se não sincronizou há mais de 2x o intervalo, está offline
  const threshold = hotspot.sync_interval_minutes * 2;
  
  if (diffMinutes > threshold) {
    return 'offline';
  }
  
  // Se está no limite (entre 1x e 2x), mostrar alerta
  if (diffMinutes > hotspot.sync_interval_minutes) {
    return 'alerta';
  }
  
  return 'online';
}
```

### 2. Atualizar a Página Embarcacoes.tsx

Modificar a função `getHotspotStatusInfo` para usar o cálculo dinâmico:

```typescript
const getHotspotStatusInfo = (embarcacaoId: string) => {
  const hotspot = getHotspotForEmbarcacao(embarcacaoId);
  if (!hotspot) {
    return { status: 'sem_config', label: 'Sem config', color: '...' };
  }
  
  // Calcular status real baseado na última sincronização
  const realStatus = getHotspotRealStatus({
    status: hotspot.status,
    ultima_sincronizacao: hotspot.ultima_sincronizacao,
    sync_interval_minutes: hotspot.sync_interval_minutes || 5
  });
  
  switch (realStatus) {
    case 'online':
      return { status: 'online', label: 'Online', color: 'bg-green-...' };
    case 'alerta':
      return { status: 'alerta', label: 'Alerta', color: 'bg-yellow-...' };
    case 'offline':
      return { status: 'offline', label: 'Offline', color: 'bg-red-...' };
  }
};
```

### 3. Atualizar Outros Componentes

Os seguintes componentes também precisam usar a mesma lógica:

| Componente | Arquivo | Uso Atual |
|------------|---------|-----------|
| HotspotsStatusPanel | `src/components/monitoring/HotspotsStatusPanel.tsx` | Usa `hotspot.status` diretamente |
| StatusHeader | `src/components/uptime/StatusHeader.tsx` | Usa status do banco |
| Dashboard | `src/hooks/useDashboard.ts` | Conta hotspots por status |
| useMonitoramento | `src/hooks/useMonitoramento.ts` | Usa status do banco |

### 4. Criar Utilitário Compartilhado

Criar um arquivo com a função de cálculo para reutilização:

**Arquivo**: `src/utils/hotspotStatus.ts`

```typescript
export interface HotspotStatusInput {
  status: string;
  ultima_sincronizacao: string | null;
  sync_interval_minutes: number;
}

export function getHotspotRealStatus(hotspot: HotspotStatusInput): 'online' | 'offline' | 'alerta' {
  if (!hotspot.ultima_sincronizacao) {
    return 'offline';
  }
  
  const lastSync = new Date(hotspot.ultima_sincronizacao).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastSync) / (1000 * 60);
  
  const threshold = (hotspot.sync_interval_minutes || 5) * 2;
  
  if (diffMinutes > threshold) {
    return 'offline';
  }
  
  if (diffMinutes > hotspot.sync_interval_minutes) {
    return 'alerta';
  }
  
  return 'online';
}
```

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/utils/hotspotStatus.ts` | Criar - função utilitária |
| `src/pages/Embarcacoes.tsx` | Modificar - usar cálculo dinâmico |
| `src/components/monitoring/HotspotsStatusPanel.tsx` | Modificar - usar cálculo dinâmico |
| `src/hooks/useMonitoramento.ts` | Modificar - calcular status real |
| `src/hooks/useDashboard.ts` | Modificar - contar por status real |

---

## Exemplo Visual

Antes (incorreto):
```
| Embarcação | Hotspot |
|------------|---------|
| Engenharia | Online ✓ | ← Errado! Última sync há 30min
```

Depois (correto):
```
| Embarcação | Hotspot |
|------------|---------|
| Engenharia | Offline | ← Correto! Não sincroniza há 30min (intervalo: 1min)
```

---

## Lógica de Cores

| Estado | Condição | Cor |
|--------|----------|-----|
| Online | Sincronizou há menos que o intervalo | Verde |
| Alerta | Sincronizou entre 1x e 2x o intervalo | Amarelo |
| Offline | Sincronizou há mais que 2x o intervalo | Vermelho |

---

## Seção Técnica

### Hook useHotspots Precisa Retornar sync_interval_minutes

Verificar se o hook `useHotspots` já retorna `sync_interval_minutes` e `ultima_sincronizacao`. Se não, adicionar à query:

```typescript
const { data, error } = await supabase
  .from('hotspots')
  .select(`
    *,
    embarcacoes(nome, empresas(nome))
  `)
  .order('nome');
```

O `*` já inclui todos os campos, então `sync_interval_minutes` e `ultima_sincronizacao` já estão disponíveis.

### Consideração sobre Relógio do Cliente

O cálculo depende do relógio do cliente estar correto. Em cenários corporativos, isso geralmente não é um problema, mas pode-se adicionar uma margem de tolerância se necessário.
