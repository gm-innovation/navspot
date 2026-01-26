
# Plano: Painel de Monitoramento em Tempo Real

## Visao Geral

Este plano implementa um painel de monitoramento dedicado com atualizacao automatica via WebSocket (Supabase Realtime) para exibir sessoes ativas, consumo ao vivo e status dos hotspots em tempo real.

---

## Arquitetura do Sistema

```text
+----------------------------------------------------------+
|              PAINEL DE MONITORAMENTO EM TEMPO REAL        |
+----------------------------------------------------------+
|  [Auto-refresh: ON/OFF]  [Ultima atualizacao: 14:32:05]  |
+----------------------------------------------------------+
|                                                          |
|  METRICAS AO VIVO                                        |
|  +--------+ +--------+ +--------+ +--------+             |
|  |Sessoes | |Consumo | |Hotspots| |Banda   |             |
|  |Ativas  | |Atual   | |Online  | |Atual   |             |
|  |  156   | | 2.3 GB | |  12/15 | | 45 Mb/s|             |
|  +--------+ +--------+ +--------+ +--------+             |
|                                                          |
|  +--------------------------------------------------+   |
|  |          GRAFICO DE CONSUMO EM TEMPO REAL         |   |
|  |  [Linha fluindo com ultimos 60 segundos]          |   |
|  +--------------------------------------------------+   |
|                                                          |
|  +--------------------------------------------------+   |
|  |               SESSOES ATIVAS                      |   |
|  | Tripulante | Dispositivo | Hotspot | Duracao | Consumo
|  |------------|-------------|---------|---------|--------
|  | Joao Silva | iPhone 14   | WiFi-01 | 2h 15m  | 1.2 GB
|  | Maria...   | Samsung...  | WiFi-02 | 45m     | 350 MB
|  | [Atualizacao automatica a cada mudanca]           |   |
|  +--------------------------------------------------+   |
|                                                          |
|  +-------------------------+ +-------------------------+ |
|  |   HOTSPOTS ATIVOS       | |   EVENTOS RECENTES      | |
|  | Nome    | Status | Sync | | [Evento] [Hora] [Tipo]  | |
|  | WiFi-01 | Online | 5s   | | Sessao iniciada  14:32  | |
|  | WiFi-02 | Online | 3s   | | Hotspot offline  14:30  | |
|  | WiFi-03 | Alerta | 45s  | | Quota atingida   14:28  | |
|  +-------------------------+ +-------------------------+ |
+----------------------------------------------------------+
```

---

## 1. Nova Pagina de Monitoramento

### Arquivo: `src/pages/Monitoramento.tsx`

Criar pagina dedicada para monitoramento em tempo real com:
- Header com toggle de auto-refresh e indicador de ultima atualizacao
- Grid de metricas ao vivo (sessoes ativas, consumo atual, hotspots online)
- Grafico de consumo em tempo real (ultimos 60 segundos)
- Tabela de sessoes ativas com atualizacao automatica
- Lista de hotspots com status e tempo desde ultima sincronizacao
- Feed de eventos recentes (sessoes iniciadas/encerradas, alertas)

---

## 2. Hooks para Dados em Tempo Real

### Arquivo: `src/hooks/useMonitoramento.ts`

Criar hooks especificos para monitoramento:

```text
useSessoesAtivas()
- Retorna sessoes_wifi onde status = 'ativa'
- Inclui dados do tripulante, dispositivo e hotspot
- Subscreve a tabela sessoes_wifi via Realtime

useConsumoAoVivo()
- Calcula consumo agregado em tempo real
- Agrupa bytes_in/bytes_out por periodo
- Atualiza a cada mudanca em sessoes_wifi

useHotspotsStatus()
- Retorna status de todos os hotspots
- Calcula tempo desde ultima sincronizacao
- Subscreve a tabela hotspots via Realtime

useEventosFeed()
- Combina alertas e mudancas em sessoes
- Ordena por timestamp descendente
- Limita aos ultimos 20 eventos
```

---

## 3. Hook de Subscricao Realtime Especializado

### Arquivo: `src/hooks/useMonitoramentoRealtime.ts`

Expandir o padrao existente para monitoramento:

```typescript
export function useMonitoramentoRealtime() {
  // Subscreve a multiplas tabelas simultaneamente
  // com callbacks especificos para cada evento
  
  // sessoes_wifi: INSERT (nova sessao), UPDATE (consumo), DELETE (encerrada)
  // hotspots: UPDATE (status, ultima_sincronizacao)
  // alertas: INSERT (novo alerta)
  // tripulantes: UPDATE (bytes_consumidos)
}
```

---

## 4. Componentes do Painel

### 4.1 Metricas ao Vivo

**Arquivo:** `src/components/monitoring/LiveMetricsGrid.tsx`

Cards com animacao de "pulso" quando atualizados:
- Sessoes Ativas (contador)
- Consumo Atual (bytes/segundo estimado)
- Hotspots Online (X de Y)
- Banda Total (Mb/s)

### 4.2 Grafico de Consumo em Tempo Real

**Arquivo:** `src/components/monitoring/LiveConsumptionChart.tsx`

Grafico de linha que mostra:
- Ultimos 60 segundos de consumo
- Download vs Upload
- Animacao suave de transicao
- Usa recharts com dados em buffer circular

### 4.3 Tabela de Sessoes Ativas

**Arquivo:** `src/components/monitoring/ActiveSessionsTable.tsx`

Tabela com atualizacao automatica:
- Tripulante (nome, cargo)
- Dispositivo (nome, MAC)
- Hotspot
- Duracao (contador ao vivo)
- Consumo (bytes_in + bytes_out)
- Indicador visual de atividade recente

### 4.4 Status dos Hotspots

**Arquivo:** `src/components/monitoring/HotspotsStatusPanel.tsx`

Lista compacta com:
- Nome do hotspot
- Badge de status (online/offline/alerta)
- Tempo desde ultima sincronizacao (atualiza a cada segundo)
- Contador de sessoes ativas no hotspot

### 4.5 Feed de Eventos

**Arquivo:** `src/components/monitoring/EventsFeed.tsx`

Lista de eventos em tempo real:
- Novas sessoes iniciadas
- Sessoes encerradas
- Alertas gerados
- Mudancas de status de hotspots
- Timestamp relativo ("ha 2 segundos")

---

## 5. Integracao com Supabase Realtime

### Estrategia de Subscricao

O sistema utilizara o Supabase Realtime ja configurado, expandindo o padrao existente em `useRealtimeSubscription.ts`:

```text
Canal: 'monitoramento'
Tabelas subscritas:
1. sessoes_wifi
   - INSERT: Adicionar sessao a lista
   - UPDATE: Atualizar consumo/duracao
   - DELETE: Remover da lista

2. hotspots
   - UPDATE: Atualizar status e ultima_sincronizacao

3. alertas
   - INSERT: Adicionar ao feed de eventos

4. tripulantes
   - UPDATE: Atualizar bytes_consumidos
```

### Gerenciamento de Estado

Usar React Query para cache e invalidacao automatica, combinado com subscricoes Realtime para updates instantaneos.

---

## 6. Integracao com Menu e Rotas

### Arquivo: `src/components/AppSidebar.tsx`

Adicionar item de menu "Monitoramento" com icone `Activity`:

```text
{ title: "Monitoramento", url: "/monitoramento", icon: Activity, 
  roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] }
```

### Arquivo: `src/App.tsx`

Adicionar rota protegida para `/monitoramento`.

---

## 7. Resumo de Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/pages/Monitoramento.tsx` | Criar | Pagina principal de monitoramento |
| `src/hooks/useMonitoramento.ts` | Criar | Hooks para dados ao vivo |
| `src/hooks/useMonitoramentoRealtime.ts` | Criar | Subscricoes Realtime especializadas |
| `src/components/monitoring/LiveMetricsGrid.tsx` | Criar | Cards de metricas ao vivo |
| `src/components/monitoring/LiveConsumptionChart.tsx` | Criar | Grafico de consumo em tempo real |
| `src/components/monitoring/ActiveSessionsTable.tsx` | Criar | Tabela de sessoes ativas |
| `src/components/monitoring/HotspotsStatusPanel.tsx` | Criar | Status dos hotspots |
| `src/components/monitoring/EventsFeed.tsx` | Criar | Feed de eventos recentes |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar menu Monitoramento |
| `src/App.tsx` | Modificar | Adicionar rota /monitoramento |

---

## 8. Detalhes Tecnicos

### Interface SessaoAtiva

```typescript
interface SessaoAtiva {
  id: string;
  tripulante: {
    id: string;
    nome: string;
    cargo: string | null;
  };
  dispositivo: {
    id: string | null;
    nome: string | null;
    mac_address: string | null;
  };
  hotspot: {
    id: string;
    nome: string;
    embarcacao_nome: string;
  };
  inicio: Date;
  duracao_segundos: number; // calculado
  bytes_in: number;
  bytes_out: number;
  ip_address: string | null;
}
```

### Buffer Circular para Grafico

```typescript
interface ConsumoSnapshot {
  timestamp: Date;
  bytes_download: number;
  bytes_upload: number;
}

// Manter ultimos 60 snapshots (1 por segundo)
const MAX_SNAPSHOTS = 60;
```

### Animacao de Atualizacao

Usar CSS transitions para indicar visualmente quando um dado foi atualizado:

```typescript
// Classe aplicada por 2 segundos apos atualizacao
.recently-updated {
  animation: pulse 0.5s ease-in-out;
  background-color: hsl(var(--primary) / 0.1);
}
```

### Contador de Duracao ao Vivo

Para exibir duracao que atualiza a cada segundo:

```typescript
function useLiveDuration(startTime: Date) {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  
  return duration;
}
```

---

## 9. Ordem de Implementacao

1. **Criar hooks de dados** (`useMonitoramento.ts`, `useMonitoramentoRealtime.ts`)
   - Base para todos os componentes

2. **Criar componentes de metricas**
   - LiveMetricsGrid (cards simples)

3. **Criar tabela de sessoes**
   - ActiveSessionsTable com duracao ao vivo

4. **Criar painel de hotspots**
   - HotspotsStatusPanel com tempo de sync

5. **Criar feed de eventos**
   - EventsFeed com updates em tempo real

6. **Criar grafico de consumo**
   - LiveConsumptionChart com buffer circular

7. **Criar pagina principal**
   - Monitoramento.tsx integrando todos os componentes

8. **Integrar no menu e rotas**
   - AppSidebar.tsx, App.tsx

---

## 10. Permissoes e Seguranca

Os dados serao filtrados automaticamente pelas politicas RLS existentes:
- Super Admin: ve todas as sessoes de todas as empresas
- Empresa Admin: ve apenas sessoes da sua empresa
- Gerente: ve apenas sessoes da sua embarcacao

Nao e necessario implementar filtragem adicional no frontend, pois o Supabase ja aplica as restricoes via RLS.

---

## 11. Consideracoes de Performance

### Otimizacoes Implementadas

1. **Debounce em atualizacoes**: Agrupar multiplas atualizacoes Realtime em um unico re-render

2. **Virtualizacao de lista**: Para embarcacoes com muitas sessoes ativas

3. **Buffer limitado**: Grafico mantem apenas ultimos 60 pontos

4. **Subscricao seletiva**: Subscrever apenas as tabelas necessarias baseado no role

5. **Cleanup de subscricoes**: Remover canais ao desmontar componentes

### Intervalo de Atualizacao

- Metricas: Instantaneo via Realtime
- Grafico: Snapshot a cada segundo
- Duracao: Contador local a cada segundo
- Tempo de sync: Calculo local a cada segundo

---

## 12. Estados Visuais

### Indicadores de Status

```text
Hotspot Online:  ● Verde + "Online"
Hotspot Offline: ● Vermelho + "Offline"
Hotspot Alerta:  ● Amarelo + "Alerta"

Sessao Recente:  Destaque por 5 segundos apos inicio
Consumo Alto:    Badge vermelho quando > threshold
```

### Animacoes

- Fade-in para novas sessoes
- Slide-out para sessoes encerradas
- Pulse para metricas atualizadas
- Transicao suave no grafico

---

## 13. Toggle de Auto-Refresh

Permitir ao usuario pausar as atualizacoes automaticas:

```typescript
const [autoRefresh, setAutoRefresh] = useState(true);

// Quando desativado:
// - Para de subscrever a Realtime
// - Para os intervalos de contador
// - Mostra indicador visual "Pausado"
```
