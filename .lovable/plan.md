
# Plano: Painel de Status de Servico (Uptime Monitor) para Hotspots

## Visao Geral

Implementar um painel de status estilo "Status Page" que exibe o historico de disponibilidade (uptime) de cada hotspot/embarcacao, com barras visuais de 90 dias, metricas de disponibilidade e timeline de incidentes.

---

## Arquitetura do Sistema

```text
+------------------------------------------------------------------+
|                  STATUS DO SERVICO NAVSPOT                        |
|      Ultima Atualizacao: 14:53:33 | Atualizando em 34 segundos   |
+------------------------------------------------------------------+
|                                                                  |
|  [●] Todos os Sistemas Operacionais                              |
|      Ultima Interrupcao: Detectada ha 5 dias                     |
|                                                                  |
+------------------------------------------------------------------+
|  TEMPO DE ATIVIDADE - Ultimos 90 Dias                            |
|                                                                  |
|  Hotspot - Navio Aurora    99.98%  [██████████████████████] Ativo|
|  Hotspot - Rebocador Norte 99.89%  [████████████████████░░] Ativo|
|  Hotspot - Plataforma Alfa 99.95%  [█████████████████████░] Ativo|
|  Hotspot - Balsa Central   100%    [██████████████████████] Ativo|
|                                                                  |
+------------------------------------------------------------------+
|  TEMPO DE ATIVIDADE GERAL                                        |
|                                                                  |
|  +----------+  +----------+  +----------+  +----------+          |
|  | 100.00%  |  | 99.967%  |  | 99.965%  |  | 99.980%  |          |
|  | Ultimas  |  | Ultimos  |  | Ultimos  |  | Ultimos  |          |
|  | 24 Horas |  | 7 Dias   |  | 30 Dias  |  | 90 Dias  |          |
|  +----------+  +----------+  +----------+  +----------+          |
|                                                                  |
+------------------------------------------------------------------+
|  ATUALIZACOES DE STATUS - Ultimos 7 Dias                         |
|                                                                  |
|  Jan 21, 2026                                                    |
|  (!) Hotspot - Navio Aurora ficou offline por 11 minutos         |
|      Houve 3 interrupcoes naquele dia.                           |
|      Ver Detalhes > | Atualizado em 09:35 GMT-03:00              |
|                                                                  |
|  Jan 21, 2026                                                    |
|  (!) Hotspot - Rebocador Norte ficou offline por 5 minutos       |
|      Houve apenas uma interrupcao naquele dia.                   |
|      Ver Detalhes > | Atualizado em 09:09 GMT-03:00              |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 1. Nova Tabela para Historico de Status

### Migracao: `hotspot_status_history`

Criar tabela para registrar mudancas de status dos hotspots:

```sql
CREATE TABLE public.hotspot_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'online', 'offline', 'alert'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER, -- calculado ao fechar
  reason TEXT, -- motivo da mudanca
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_hotspot_status_history_hotspot ON hotspot_status_history(hotspot_id);
CREATE INDEX idx_hotspot_status_history_dates ON hotspot_status_history(started_at, ended_at);

-- RLS policies seguindo padrao existente
```

### Trigger para Registrar Mudancas

Criar trigger que registra automaticamente quando o status de um hotspot muda:

```sql
CREATE OR REPLACE FUNCTION log_hotspot_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Fechar registro anterior
    UPDATE hotspot_status_history
    SET ended_at = now(),
        duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))
    WHERE hotspot_id = NEW.id AND ended_at IS NULL;
    
    -- Criar novo registro
    INSERT INTO hotspot_status_history (hotspot_id, status, started_at)
    VALUES (NEW.id, NEW.status, now());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hotspot_status_change_trigger
  AFTER UPDATE OF status ON hotspots
  FOR EACH ROW
  EXECUTE FUNCTION log_hotspot_status_change();
```

---

## 2. Hooks para Dados de Uptime

### Arquivo: `src/hooks/useUptimeMonitor.ts`

```typescript
// Interfaces
interface UptimeData {
  hotspot_id: string;
  hotspot_nome: string;
  embarcacao_nome: string;
  status_atual: 'online' | 'offline' | 'alert';
  uptime_24h: number;      // percentual
  uptime_7d: number;
  uptime_30d: number;
  uptime_90d: number;
  daily_status: DayStatus[]; // 90 dias para barra visual
  ultima_interrupcao: Date | null;
}

interface DayStatus {
  date: string;
  uptime_percent: number;
  status: 'full' | 'partial' | 'down' | 'no_data';
  incidents: number;
  downtime_minutes: number;
}

interface Incident {
  id: string;
  hotspot_nome: string;
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number;
  status: 'offline' | 'alert';
  incidents_count: number;
}

// Hooks
useHotspotsUptime()
- Retorna UptimeData[] para todos os hotspots
- Calcula percentuais baseado em hotspot_status_history
- Agrupa por dia para gerar barra visual

useOverallUptime()
- Calcula uptime agregado de todos os hotspots
- Retorna metricas 24h, 7d, 30d, 90d

useIncidentsTimeline(days: number)
- Retorna lista de incidentes agrupados por data
- Calcula duracao e quantidade por hotspot/dia
```

---

## 3. Componentes do Painel

### 3.1 Barra de Uptime Visual

**Arquivo:** `src/components/uptime/UptimeBar.tsx`

Componente que renderiza barra de 90 dias com cores:
- Verde escuro: 100% uptime no dia
- Verde claro: 99-99.9% uptime
- Amarelo: 95-99% uptime
- Vermelho: < 95% uptime
- Cinza: sem dados

```typescript
interface UptimeBarProps {
  days: DayStatus[];
  height?: number;
}
```

### 3.2 Card de Hotspot com Uptime

**Arquivo:** `src/components/uptime/HotspotUptimeCard.tsx`

Linha mostrando:
- Nome do hotspot
- Percentual de uptime
- Barra visual de 90 dias
- Badge de status atual

### 3.3 Metricas Gerais de Uptime

**Arquivo:** `src/components/uptime/OverallUptimeMetrics.tsx`

Grid com 4 cards mostrando:
- Uptime ultimas 24 horas
- Uptime ultimos 7 dias
- Uptime ultimos 30 dias
- Uptime ultimos 90 dias

### 3.4 Timeline de Incidentes

**Arquivo:** `src/components/uptime/IncidentsTimeline.tsx`

Lista de incidentes agrupados por data:
- Data do incidente
- Hotspot afetado
- Duracao total do dia
- Quantidade de interrupcoes
- Link para detalhes
- Timestamp da ultima atualizacao

### 3.5 Header de Status Geral

**Arquivo:** `src/components/uptime/StatusHeader.tsx`

Banner mostrando:
- Icone de status geral (verde = todos online)
- Texto "Todos os Sistemas Operacionais" ou "Problemas Detectados"
- Ultima interrupcao detectada

---

## 4. Nova Pagina de Status

### Arquivo: `src/pages/StatusServico.tsx`

Pagina dedicada para visualizacao de uptime:
- Header com status geral
- Secao de barras de uptime por hotspot
- Cards de metricas gerais
- Timeline de incidentes recentes
- Filtro por periodo (7d, 30d, 90d)
- Link para historico completo

---

## 5. Integracao com Sistema Existente

### Modificar HotspotsStatusPanel

Adicionar link "Ver Historico" que abre a pagina de status:

```typescript
// Em HotspotsStatusPanel.tsx
<Button variant="link" asChild>
  <Link to="/status-servico">Ver Histórico Completo</Link>
</Button>
```

### Adicionar ao Menu

```typescript
// Em AppSidebar.tsx
{ title: "Status do Serviço", url: "/status-servico", icon: Activity2 }
```

### Adicionar Rota

```typescript
// Em App.tsx
<Route path="/status-servico" element={<StatusServico />} />
```

---

## 6. Calculo de Uptime

### Logica de Calculo

Para cada hotspot e periodo:

```typescript
function calculateUptime(history: StatusHistory[], startDate: Date, endDate: Date): number {
  const totalPeriodSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
  
  // Somar tempo em status 'online'
  const onlineSeconds = history
    .filter(h => h.status === 'online')
    .reduce((sum, h) => {
      const start = Math.max(h.started_at.getTime(), startDate.getTime());
      const end = Math.min(h.ended_at?.getTime() || Date.now(), endDate.getTime());
      return sum + Math.max(0, end - start) / 1000;
    }, 0);
  
  return (onlineSeconds / totalPeriodSeconds) * 100;
}
```

### Geracao de Barra de 90 Dias

```typescript
function generateDailyStatus(history: StatusHistory[]): DayStatus[] {
  const days: DayStatus[] = [];
  
  for (let i = 89; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    const dayHistory = history.filter(h => 
      h.started_at <= dayEnd && (!h.ended_at || h.ended_at >= dayStart)
    );
    
    const uptime = calculateUptime(dayHistory, dayStart, dayEnd);
    const incidents = dayHistory.filter(h => h.status === 'offline').length;
    
    days.push({
      date: format(date, 'yyyy-MM-dd'),
      uptime_percent: uptime,
      status: uptime === 100 ? 'full' : uptime >= 99 ? 'partial' : 'down',
      incidents,
      downtime_minutes: ((100 - uptime) / 100) * 24 * 60,
    });
  }
  
  return days;
}
```

---

## 7. Resumo de Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `migrations/hotspot_status_history.sql` | Criar | Tabela e trigger para historico |
| `src/hooks/useUptimeMonitor.ts` | Criar | Hooks para dados de uptime |
| `src/components/uptime/UptimeBar.tsx` | Criar | Barra visual de 90 dias |
| `src/components/uptime/HotspotUptimeCard.tsx` | Criar | Card de hotspot com uptime |
| `src/components/uptime/OverallUptimeMetrics.tsx` | Criar | Metricas gerais |
| `src/components/uptime/IncidentsTimeline.tsx` | Criar | Timeline de incidentes |
| `src/components/uptime/StatusHeader.tsx` | Criar | Header de status geral |
| `src/pages/StatusServico.tsx` | Criar | Pagina principal |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar menu |
| `src/App.tsx` | Modificar | Adicionar rota |
| `src/components/monitoring/HotspotsStatusPanel.tsx` | Modificar | Link para historico |

---

## 8. Estilos da Barra de Uptime

### Cores por Status

```typescript
const getBarColor = (uptime: number): string => {
  if (uptime === 100) return 'bg-green-500';
  if (uptime >= 99) return 'bg-green-400';
  if (uptime >= 95) return 'bg-yellow-500';
  if (uptime >= 90) return 'bg-orange-500';
  return 'bg-red-500';
};
```

### Tooltip com Detalhes

Ao passar o mouse sobre cada dia da barra:
- Data
- Percentual de uptime
- Tempo offline
- Numero de incidentes

---

## 9. Atualizacao em Tempo Real

### Subscricao Realtime

Subscrever a tabela `hotspot_status_history` para atualizar automaticamente quando houver mudancas:

```typescript
useEffect(() => {
  const channel = supabase
    .channel('uptime-monitor')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'hotspot_status_history',
    }, () => {
      queryClient.invalidateQueries(['uptime']);
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, []);
```

---

## 10. Ordem de Implementacao

1. **Criar migracao de banco** (tabela + trigger)
   - Estrutura para armazenar historico

2. **Criar hooks de dados** (`useUptimeMonitor.ts`)
   - Logica de calculo de uptime

3. **Criar componente de barra** (`UptimeBar.tsx`)
   - Visualizacao principal

4. **Criar demais componentes**
   - HotspotUptimeCard, OverallUptimeMetrics, IncidentsTimeline, StatusHeader

5. **Criar pagina principal** (`StatusServico.tsx`)
   - Integrar todos os componentes

6. **Integrar no menu e rotas**
   - AppSidebar.tsx, App.tsx

7. **Adicionar link no HotspotsStatusPanel**
   - Conectar com painel de monitoramento

---

## 11. Consideracoes

### Dados Historicos

Para hotspots existentes sem historico, criar registro inicial:

```sql
INSERT INTO hotspot_status_history (hotspot_id, status, started_at)
SELECT id, status, created_at FROM hotspots
WHERE id NOT IN (SELECT DISTINCT hotspot_id FROM hotspot_status_history);
```

### Performance

- Indices otimizados para queries por data
- Cache de calculos por periodo
- Atualizacao incremental (nao recalcular tudo)

### Responsividade

- Barra de 90 dias adaptativa para telas menores
- Exibir menos dias em mobile (30 dias)
- Cards empilhados verticalmente

