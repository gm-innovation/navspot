
# Plano: Sistema de Relatorios Gerenciais Completo

## Visao Geral

Este plano implementa um sistema completo de relatorios gerenciais com dashboards personalizados por nivel de acesso (Super Admin, Empresa Admin e Gerente de Embarcacao), incluindo graficos de consumo, exportacao em CSV/PDF e filtros por periodo.

---

## Arquitetura do Sistema

```text
+------------------------------------------+
|           PAGINA DE RELATORIOS           |
+------------------------------------------+
|  Filtros: Periodo | Empresa | Embarcacao |
+------------------------------------------+
|                                          |
|  +----------------------------------+    |
|  |     GRAFICOS INTERATIVOS        |    |
|  |  (Recharts - AreaChart, PieChart)|    |
|  +----------------------------------+    |
|                                          |
|  +----------------------------------+    |
|  |     TABELAS DE DADOS            |    |
|  |  (Consumo, Sessoes, Alertas)    |    |
|  +----------------------------------+    |
|                                          |
|  [Exportar CSV] [Exportar PDF]           |
+------------------------------------------+
```

---

## 1. Nova Pagina de Relatorios

### Arquivo: `src/pages/Relatorios.tsx`

Criar pagina dedicada para relatorios com renderizacao condicional baseada no papel do usuario:

- **Super Admin**: Visao global de todas as empresas e embarcacoes
- **Empresa Admin**: Visao das embarcacoes e tripulantes da empresa
- **Gerente Embarcacao**: Visao detalhada da sua embarcacao

---

## 2. Hooks para Dados de Relatorios

### Arquivo: `src/hooks/useRelatorios.ts`

Criar hooks especificos para buscar dados agregados:

```text
useRelatorioConsumo(filtros)
- Retorna consumo agregado por tripulante/dispositivo/periodo
- Agrupa bytes_consumidos de tripulantes e dispositivos_registrados

useRelatorioSessoes(filtros)
- Retorna sessoes_wifi agrupadas por periodo
- Calcula duracao media, bytes in/out

useRelatorioAlertas(filtros)
- Retorna alertas agrupados por tipo/severidade/periodo
- Estatisticas de resolucao

useRelatorioEmpresas(filtros) [Super Admin]
- Retorna metricas agregadas por empresa
- Total embarcacoes, tripulantes, consumo

useRelatorioEmbarcacoes(filtros) [Super Admin / Empresa Admin]
- Retorna metricas agregadas por embarcacao
- Total tripulantes, hotspots, consumo
```

---

## 3. Componentes de Graficos

### Arquivo: `src/components/reports/ConsumoChart.tsx`

Grafico de area mostrando consumo de dados ao longo do tempo:
- Eixo X: Periodo (dias/semanas/meses)
- Eixo Y: Bytes consumidos
- Linhas: Download vs Upload

### Arquivo: `src/components/reports/SessoesChart.tsx`

Grafico de barras mostrando quantidade de sessoes:
- Agrupado por dia/semana
- Colorido por status (ativa, encerrada)

### Arquivo: `src/components/reports/AlertasChart.tsx`

Grafico de pizza mostrando distribuicao de alertas:
- Por severidade (critico, aviso, info)
- Por tipo (quota, offline, device_sharing)

### Arquivo: `src/components/reports/TopConsumidoresChart.tsx`

Grafico de barras horizontais:
- Top 10 tripulantes/equipamentos por consumo
- Mostra nome e bytes consumidos

---

## 4. Dashboards por Papel

### 4.1 Super Admin Dashboard de Relatorios

```text
+------------------------------------------+
| RELATORIOS - SUPER ADMIN                 |
+------------------------------------------+
| [Periodo: v] [Empresa: v] [Exportar v]   |
+------------------------------------------+
|                                          |
| METRICAS GLOBAIS                         |
| +--------+ +--------+ +--------+         |
| |Empresas| |Embarc. | |Consumo |         |
| |   15   | |   42   | | 1.2 TB |         |
| +--------+ +--------+ +--------+         |
|                                          |
| CONSUMO POR EMPRESA (Grafico de Barras)  |
| [================================]       |
|                                          |
| TOP 5 EMBARCACOES (Tabela)               |
| | Embarcacao | Empresa | Consumo |       |
| |------------|---------|---------|       |
| | Navio A    | Emp X   | 120 GB  |       |
|                                          |
| ALERTAS POR EMPRESA (Pizza)              |
| [Grafico circular por severidade]        |
+------------------------------------------+
```

### 4.2 Empresa Admin Dashboard de Relatorios

```text
+------------------------------------------+
| RELATORIOS - MINHA EMPRESA               |
+------------------------------------------+
| [Periodo: v] [Embarcacao: v] [Exportar]  |
+------------------------------------------+
|                                          |
| METRICAS DA EMPRESA                      |
| +--------+ +--------+ +--------+         |
| |Embarc. | |Tripul. | |Consumo |         |
| |   8    | |  156   | | 450 GB |         |
| +--------+ +--------+ +--------+         |
|                                          |
| CONSUMO AO LONGO DO TEMPO (Area Chart)   |
| [Grafico de area com download/upload]    |
|                                          |
| TOP CONSUMIDORES (Barras Horizontais)    |
| [Tripulante/Equipamento vs Consumo]      |
|                                          |
| SESSOES POR EMBARCACAO (Tabela)          |
| | Embarcacao | Sessoes | Duracao Media | |
+------------------------------------------+
```

### 4.3 Gerente Embarcacao Dashboard de Relatorios

```text
+------------------------------------------+
| RELATORIOS - MINHA EMBARCACAO            |
+------------------------------------------+
| [Periodo: v] [Exportar CSV] [Exportar PDF]|
+------------------------------------------+
|                                          |
| METRICAS DA EMBARCACAO                   |
| +--------+ +--------+ +--------+         |
| |Tripul. | |Sessoes | |Consumo |         |
| |   24   | |  1,234 | | 85 GB  |         |
| +--------+ +--------+ +--------+         |
|                                          |
| CONSUMO DIARIO (Area Chart)              |
| [Ultimos 7/30 dias]                      |
|                                          |
| TOP 10 TRIPULANTES (Tabela)              |
| | Nome | Cargo | Consumo | Quota |       |
|                                          |
| ALERTAS RECENTES (Lista)                 |
| [Alertas filtrados por embarcacao]       |
+------------------------------------------+
```

---

## 5. Funcionalidade de Exportacao

### Arquivo: `src/utils/exportUtils.ts`

Funcoes utilitarias para exportacao:

```text
exportToCSV(data, filename)
- Converte array de objetos para CSV
- Trigger download automatico

exportToPDF(data, titulo, colunas)
- Usa biblioteca para gerar PDF
- Inclui cabecalho com logo e data
- Formata tabelas automaticamente
```

### Implementacao de PDF

Adicionar dependencia `jspdf` e `jspdf-autotable` para geracao de PDF no cliente.

---

## 6. Filtros Avancados

### Componente: `src/components/reports/ReportFilters.tsx`

Filtros disponiveis:
- **Periodo**: Hoje, Ultimos 7 dias, Ultimos 30 dias, Personalizado
- **Empresa**: Dropdown (apenas Super Admin)
- **Embarcacao**: Dropdown (Super Admin e Empresa Admin)
- **Tipo de Relatorio**: Consumo, Sessoes, Alertas

### Seletor de Datas Personalizado

Usar componente DatePicker existente do shadcn para selecao de intervalo customizado.

---

## 7. Integracao com Menu

### Arquivo: `src/components/AppSidebar.tsx`

Adicionar item de menu "Relatorios" com icone `FileBarChart`:

```text
{ title: "Relatorios", url: "/relatorios", icon: FileBarChart, 
  roles: ['super_admin', 'empresa_admin', 'gerente_embarcacao'] }
```

### Arquivo: `src/App.tsx`

Adicionar rota protegida para `/relatorios`.

---

## 8. Resumo de Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/pages/Relatorios.tsx` | Criar | Pagina principal de relatorios |
| `src/hooks/useRelatorios.ts` | Criar | Hooks para dados agregados |
| `src/components/reports/ConsumoChart.tsx` | Criar | Grafico de consumo |
| `src/components/reports/SessoesChart.tsx` | Criar | Grafico de sessoes |
| `src/components/reports/AlertasChart.tsx` | Criar | Grafico de alertas |
| `src/components/reports/TopConsumidoresChart.tsx` | Criar | Top consumidores |
| `src/components/reports/ReportFilters.tsx` | Criar | Filtros de relatorio |
| `src/components/reports/ReportCard.tsx` | Criar | Card de metrica |
| `src/components/reports/ExportButtons.tsx` | Criar | Botoes de exportacao |
| `src/utils/exportUtils.ts` | Criar | Funcoes de exportacao |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar menu Relatorios |
| `src/App.tsx` | Modificar | Adicionar rota /relatorios |

---

## 9. Detalhes Tecnicos

### Hook useRelatorioConsumo

```typescript
interface ConsumoFilters {
  dataInicio: Date;
  dataFim: Date;
  empresaId?: string;
  embarcacaoId?: string;
  agruparPor: 'dia' | 'semana' | 'mes';
}

interface ConsumoData {
  periodo: string;
  bytes_download: number;
  bytes_upload: number;
  total_bytes: number;
}
```

### Calculo de Consumo Agregado

Os dados de consumo vem de duas fontes:
1. `tripulantes.bytes_consumidos` - consumo individual
2. `dispositivos_registrados.bytes_consumidos` - consumo por dispositivo
3. `sessoes_wifi.bytes_in / bytes_out` - consumo por sessao

### Graficos com Recharts

Utilizar componentes ja existentes em `src/components/ui/chart.tsx`:
- `ChartContainer`
- `ChartTooltip`
- `ChartLegend`

### Formatacao de Bytes

Funcao utilitaria para converter bytes em unidades legiveis:

```typescript
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
```

---

## 10. Ordem de Implementacao

1. **Criar hooks de dados** (`useRelatorios.ts`)
   - Base para todos os componentes

2. **Criar utilitarios** (`exportUtils.ts`, formatacao)
   - Funcoes reutilizaveis

3. **Criar componentes de graficos**
   - ConsumoChart, SessoesChart, AlertasChart, TopConsumidoresChart

4. **Criar componentes de UI**
   - ReportFilters, ReportCard, ExportButtons

5. **Criar pagina principal** (`Relatorios.tsx`)
   - Integrar todos os componentes

6. **Integrar no menu e rotas**
   - AppSidebar.tsx, App.tsx

---

## 11. Permissoes e Seguranca

Os dados serao filtrados automaticamente pelas politicas RLS existentes:
- Super Admin: ve todos os dados
- Empresa Admin: ve apenas dados da sua empresa
- Gerente: ve apenas dados da sua embarcacao

Nao e necessario implementar filtragem adicional no frontend, pois o Supabase ja aplica as restricoes.

---

## 12. Dependencias Adicionais

```text
jspdf: ^2.5.1 - Geracao de PDF
jspdf-autotable: ^3.8.1 - Tabelas em PDF
```

Recharts ja esta instalado (^2.12.7).

---

## 13. Exemplos de Queries SQL (para referencia)

### Consumo por Periodo
```sql
SELECT 
  DATE_TRUNC('day', created_at) as periodo,
  SUM(bytes_in) as download,
  SUM(bytes_out) as upload
FROM sessoes_wifi
WHERE inicio BETWEEN :dataInicio AND :dataFim
GROUP BY periodo
ORDER BY periodo;
```

### Top Consumidores
```sql
SELECT 
  t.nome,
  t.cargo,
  t.bytes_consumidos
FROM tripulantes t
WHERE t.embarcacao_id = :embarcacaoId
ORDER BY t.bytes_consumidos DESC
LIMIT 10;
```

Estas queries serao implementadas usando o SDK do Supabase no hook.

