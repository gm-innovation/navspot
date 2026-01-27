

# Melhoria do Dashboard da Embarcacao

## Objetivo
Adicionar ao dashboard do Gerente de Embarcacao (`GerenteEmbarcacaoDashboard.tsx`) uma visualizacao completa com lista de usuarios online, informacoes de consumo individual e global, e graficos de uso.

## Novas Funcionalidades

### 1. Lista de Usuarios Online (Sessoes Ativas)
Tabela em tempo real mostrando:
- Nome do tripulante e cargo
- Dispositivo conectado (nome/MAC)
- Duracao da sessao (atualiza ao vivo)
- Consumo atual (download + upload)
- IP do dispositivo

### 2. Metricas de Consumo
Cards com informacoes:
- Consumo total da embarcacao (bytes)
- Total de sessoes hoje
- Tempo medio de conexao
- Dispositivos conectados agora

### 3. Graficos de Uso
- **Grafico de consumo ao longo do tempo** (ultimos 7 dias)
- **Top consumidores de dados** (ranking horizontal)
- **Top usuarios por tempo de uso** (ranking por duracao)

### 4. Ranking de Tripulantes
Tabela mostrando:
- Maiores consumidores de dados (bytes)
- Maior tempo de uso acumulado
- Sessoes por tripulante

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/hooks/useEmbarcacaoDashboard.ts` | Hooks especificos para dados da embarcacao (sessoes ativas, consumo, rankings) |
| `src/components/dashboards/EmbarcacaoOnlineUsers.tsx` | Componente de lista de usuarios online |
| `src/components/dashboards/EmbarcacaoConsumptionChart.tsx` | Grafico de consumo da embarcacao |
| `src/components/dashboards/EmbarcacaoTopConsumers.tsx` | Ranking de maiores consumidores |
| `src/components/dashboards/EmbarcacaoTopDuration.tsx` | Ranking por tempo de uso |

## Arquivo a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `src/components/dashboards/GerenteEmbarcacaoDashboard.tsx` | Integrar novos componentes e reorganizar layout |

## Detalhes Tecnicos

### Hook useEmbarcacaoDashboard.ts

```typescript
// Sessoes ativas da embarcacao
export function useSessoesAtivasEmbarcacao(embarcacaoId?: string)

// Consumo total da embarcacao (ultimos 7 dias)
export function useConsumoEmbarcacao(embarcacaoId?: string)

// Top consumidores da embarcacao
export function useTopConsumidoresEmbarcacao(embarcacaoId?: string, limit?: number)

// Top por duracao de uso
export function useTopDuracaoEmbarcacao(embarcacaoId?: string, limit?: number)

// Metricas gerais da embarcacao
export function useMetricasEmbarcacao(embarcacaoId?: string)
```

### Componente EmbarcacaoOnlineUsers

Exibe tabela de usuarios conectados com atualizacao em tempo real:

```text
+------------------------------------------------------------+
| Usuarios Online                              [3 conectados] |
+------------------------------------------------------------+
| Tripulante      | Dispositivo    | Duracao | Consumo | IP   |
+-----------------+----------------+---------+---------+------+
| Joao Silva      | iPhone 14      | 1h 23m  | 245 MB  | .101 |
|   Marinheiro    | A1:B2:C3:D4... |         |         |      |
+-----------------+----------------+---------+---------+------+
| Maria Santos    | Samsung S23    | 45m 12s | 128 MB  | .102 |
|   Comandante    | E5:F6:G7:H8... |         |         |      |
+-----------------+----------------+---------+---------+------+
```

### Componente EmbarcacaoConsumptionChart

Grafico de area mostrando consumo dos ultimos 7 dias (reutilizando logica do ConsumoChart existente).

### Componente EmbarcacaoTopConsumers

Grafico de barras horizontais (similar ao TopConsumidoresChart existente) filtrado para a embarcacao.

### Componente EmbarcacaoTopDuration

Novo grafico de barras horizontais mostrando tempo total de uso por tripulante:

```text
+------------------------------------------+
| Maior Tempo de Uso                       |
+------------------------------------------+
| Joao Silva    ███████████████████  12h   |
| Maria Santos  ████████████████     10h   |
| Pedro Lima    ██████████████       8h    |
| Ana Costa     ████████             5h    |
| Carlos Souza  █████                3h    |
+------------------------------------------+
```

## Layout Final do Dashboard

```text
+------------------------------------------------------------------+
| Minha Embarcacao                        [Cadastrar Tripulante]   |
| Bem-vindo, usuario - Gerencie sua embarcacao                     |
+------------------------------------------------------------------+
|                                                                   |
| [Tripulantes] [Status Hotspot] [Consumo Hoje] [Sessoes Ativas]   |
| [  Ativos   ] [   Online     ] [   245 MB   ] [      3       ]   |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
| Usuarios Online                                   [3 conectados] |
| +--------------------------------------------------------------+ |
| | Tripulante | Dispositivo | Duracao | Consumo | IP            | |
| +--------------------------------------------------------------+ |
| | Joao Silva | iPhone 14   | 1h 23m  | 245 MB  | 192.168.1.101 | |
| | Maria ...  | Samsung...  | 45m 12s | 128 MB  | 192.168.1.102 | |
| +--------------------------------------------------------------+ |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
| [   Consumo Ultimos 7 Dias   ] [   Top Consumidores de Dados   ] |
| |   Grafico de Area          | |  Ranking Horizontal          | |
| |   Download / Upload        | |  Por bytes consumidos        | |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
| [    Top Tempo de Uso        ] [   Informacoes da Embarcacao   ] |
| |  Ranking por duracao       | |  Nome, tipo, status, etc     | |
| |  total de conexao          | |                              | |
|                                                                   |
+------------------------------------------------------------------+
```

## Queries SQL Necessarias

### Sessoes Ativas da Embarcacao
```sql
SELECT sw.*, t.nome, t.cargo, d.nome as disp_nome, d.mac_address
FROM sessoes_wifi sw
JOIN tripulantes t ON sw.tripulante_id = t.id
JOIN hotspots h ON sw.hotspot_id = h.id
LEFT JOIN dispositivos_registrados d ON sw.dispositivo_id = d.id
WHERE h.embarcacao_id = :embarcacao_id
AND sw.status = 'ativa'
```

### Top Consumidores da Embarcacao
```sql
SELECT t.id, t.nome, t.cargo, t.bytes_consumidos
FROM tripulantes t
WHERE t.embarcacao_id = :embarcacao_id
AND t.bytes_consumidos > 0
ORDER BY t.bytes_consumidos DESC
LIMIT 10
```

### Top por Duracao (calculado das sessoes)
```sql
SELECT 
  t.id, 
  t.nome, 
  t.cargo,
  SUM(
    EXTRACT(EPOCH FROM (COALESCE(sw.fim, now()) - sw.inicio))
  ) as duracao_total_segundos
FROM sessoes_wifi sw
JOIN tripulantes t ON sw.tripulante_id = t.id
JOIN hotspots h ON sw.hotspot_id = h.id
WHERE h.embarcacao_id = :embarcacao_id
GROUP BY t.id, t.nome, t.cargo
ORDER BY duracao_total_segundos DESC
LIMIT 10
```

## Dependencias Utilizadas

- Recharts (ja instalado) - para graficos
- date-fns (ja instalado) - formatacao de datas e duracao
- Supabase Realtime (ja configurado) - atualizacao em tempo real
- TanStack Query (ja instalado) - gerenciamento de estado e cache

## Consideracoes

1. **Performance**: Os hooks usarao `refetchInterval` de 5-10 segundos para manter dados atualizados
2. **Realtime**: Aproveitar subscricoes ja existentes em `useMonitoramentoRealtime`
3. **Responsividade**: Layout adaptavel para mobile com cards empilhados
4. **Reuso**: Aproveitar componentes de graficos existentes (ConsumoChart, TopConsumidoresChart)

