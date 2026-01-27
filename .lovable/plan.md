

# Filtros e Acesso Multi-Embarcacao no Dashboard

## Resumo

Este plano adiciona:
1. Suporte para gerentes gerenciarem multiplas embarcacoes (nova tabela de associacao)
2. Filtros de periodo e busca em todos os componentes
3. Seletor de embarcacao para todos os perfis (incluindo gerente)

## Alteracoes no Banco de Dados

### Nova Tabela: gerente_embarcacoes

Tabela para associar um gerente a multiplas embarcacoes:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | Primary key |
| user_id | uuid | FK para auth.users |
| embarcacao_id | uuid | FK para embarcacoes |
| created_at | timestamp | Data de criacao |

### Nova Funcao: get_user_embarcacao_ids

Funcao que retorna todas as embarcacoes do usuario:

```sql
CREATE OR REPLACE FUNCTION public.get_user_embarcacao_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT embarcacao_id
  FROM public.gerente_embarcacoes
  WHERE user_id = _user_id
$$;
```

### Atualizacao das RLS Policies

Atualizar policies que usam `get_user_embarcacao_id()` para usar a nova funcao:

```sql
-- Exemplo: tripulantes
embarcacao_id IN (SELECT get_user_embarcacao_ids(auth.uid()))
```

## Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/dashboards/EmbarcacaoDashboardFilters.tsx` | Componente de filtros (embarcacao, periodo, busca) |
| `src/hooks/useGerenteEmbarcacoes.ts` | Hook para buscar embarcacoes do gerente |

## Arquivos a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `src/hooks/useEmbarcacaoDashboard.ts` | Adicionar parametro periodoDias nos hooks |
| `src/components/dashboards/EmbarcacaoOnlineUsers.tsx` | Adicionar campo de busca |
| `src/components/dashboards/EmbarcacaoConsumptionChart.tsx` | Receber periodo dinamico |
| `src/components/dashboards/EmbarcacaoTopConsumers.tsx` | Receber periodo dinamico |
| `src/components/dashboards/EmbarcacaoTopDuration.tsx` | Receber periodo dinamico |
| `src/components/dashboards/GerenteEmbarcacaoDashboard.tsx` | Integrar filtros e seletor |
| `src/contexts/AuthContext.tsx` | Adicionar embarcacao_ids (array) ao AppUser |

## Detalhes Tecnicos

### 1. Hook useGerenteEmbarcacoes

Busca as embarcacoes que o usuario pode acessar:

```typescript
export function useGerenteEmbarcacoes() {
  const { user, hasRole } = useAuth();
  
  return useQuery({
    queryKey: ['gerente-embarcacoes', user?.id],
    queryFn: async () => {
      if (hasRole(['super_admin'])) {
        // Super admin: todas as embarcacoes
        return supabase.from('embarcacoes').select('*').order('nome');
      } else if (hasRole(['empresa_admin'])) {
        // Empresa admin: embarcacoes da empresa
        return supabase.from('embarcacoes')
          .select('*')
          .eq('empresa_id', user?.empresa_id)
          .order('nome');
      } else {
        // Gerente: buscar da tabela gerente_embarcacoes
        return supabase.from('gerente_embarcacoes')
          .select('embarcacoes(*)')
          .eq('user_id', user?.id);
      }
    },
    enabled: !!user?.id,
  });
}
```

### 2. Componente EmbarcacaoDashboardFilters

Layout visual:

```text
+------------------------------------------------------------------+
| [Embarcacao: Sonda NS-01 v]  [Periodo: 7 dias] [15d] [30d]       |
+------------------------------------------------------------------+
```

Props:
```typescript
interface Props {
  embarcacoes: Embarcacao[];
  selectedEmbarcacaoId: string | undefined;
  onEmbarcacaoChange: (id: string) => void;
  periodo: number;
  onPeriodoChange: (dias: number) => void;
}
```

### 3. Modificacoes nos Hooks

Adicionar parametro `periodoDias` com valor padrao 7:

```typescript
// useConsumoHistoricoEmbarcacao
export function useConsumoHistoricoEmbarcacao(
  embarcacaoId?: string, 
  periodoDias: number = 7
) {
  // ...
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - periodoDias);
  // ...
}

// useTopConsumidoresEmbarcacao  
export function useTopConsumidoresEmbarcacao(
  embarcacaoId?: string,
  periodoDias: number = 7,
  limit: number = 5
)

// useTopDuracaoEmbarcacao
export function useTopDuracaoEmbarcacao(
  embarcacaoId?: string,
  periodoDias: number = 7, 
  limit: number = 5
)
```

### 4. Filtro de Busca em EmbarcacaoOnlineUsers

Adicionar prop de busca:

```typescript
interface Props {
  sessoes: SessaoAtiva[] | undefined;
  isLoading: boolean;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
}

// Filtrar por nome/cargo
const filteredSessoes = sessoes?.filter(s =>
  s.tripulante_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
  s.tripulante_cargo?.toLowerCase().includes(searchTerm.toLowerCase())
) || [];
```

### 5. Periodo Dinamico nos Charts

Atualizar props dos componentes:

```typescript
// EmbarcacaoConsumptionChart
interface Props {
  data: ConsumoHistorico[] | undefined;
  isLoading: boolean;
  periodoDias?: number; // Novo - para titulo dinamico
}

// Titulo: "Consumo - Ultimos {periodoDias} Dias"
```

### 6. GerenteEmbarcacaoDashboard Atualizado

```typescript
export function GerenteEmbarcacaoDashboard() {
  const { user, hasRole } = useAuth();
  
  // Estados de filtro
  const [selectedEmbarcacaoId, setSelectedEmbarcacaoId] = useState<string>();
  const [periodoDias, setPeriodoDias] = useState(7);
  const [searchTerm, setSearchTerm] = useState("");

  // Buscar embarcacoes disponiveis
  const { data: embarcacoesDisponiveis } = useGerenteEmbarcacoes();
  
  // Selecionar primeira embarcacao por padrao
  useEffect(() => {
    if (!selectedEmbarcacaoId && embarcacoesDisponiveis?.length) {
      setSelectedEmbarcacaoId(embarcacoesDisponiveis[0].id);
    }
  }, [embarcacoesDisponiveis]);

  // Usar embarcacao selecionada nos hooks
  const { data: sessoesAtivas } = useSessoesAtivasEmbarcacao(selectedEmbarcacaoId);
  const { data: consumoHistorico } = useConsumoHistoricoEmbarcacao(
    selectedEmbarcacaoId, 
    periodoDias
  );
  // ...
}
```

## Layout Final

```text
+------------------------------------------------------------------+
| Dashboard da Embarcacao                                           |
| Monitoramento em tempo real                                       |
+------------------------------------------------------------------+
| FILTROS                                                           |
| [Embarcacao: Sonda NS-01 v]    [7 dias] [15 dias] [30 dias]      |
+------------------------------------------------------------------+
| [Tripulantes] [Status Hotspot] [Consumo Periodo] [Sessoes Ativas]|
+------------------------------------------------------------------+
| Usuarios Online                           [Buscar tripulante...] |
| +--------------------------------------------------------------+ |
| | Tripulante | Dispositivo | Duracao | Consumo | IP            | |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
| [  Consumo Ultimos X Dias  ] [    Top Consumidores de Dados    ] |
+------------------------------------------------------------------+
| [   Top Tempo de Uso       ] [   Informacoes da Embarcacao     ] |
+------------------------------------------------------------------+
```

## Fluxo de Acesso

```text
super_admin
    |
    +-> Todas embarcacoes (via SELECT na tabela embarcacoes)
    
empresa_admin  
    |
    +-> Embarcacoes da empresa (filtro por empresa_id)
    
gerente_embarcacao
    |
    +-> Embarcacoes associadas (via tabela gerente_embarcacoes)
```

## Seguranca

### RLS na tabela gerente_embarcacoes

```sql
-- Super admin: acesso total
CREATE POLICY "Super admin full access"
ON public.gerente_embarcacoes FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Empresa admin: gerentes da empresa
CREATE POLICY "Empresa admin access"
ON public.gerente_embarcacoes FOR ALL
USING (
  has_role(auth.uid(), 'empresa_admin') AND
  embarcacao_id IN (
    SELECT id FROM embarcacoes WHERE empresa_id = get_user_empresa_id(auth.uid())
  )
);

-- Gerente: apenas proprias associacoes
CREATE POLICY "Gerente view own"
ON public.gerente_embarcacoes FOR SELECT
USING (user_id = auth.uid());
```

### Migracao de Dados

Para gerentes existentes que tem `embarcacao_id` em `user_roles`:

```sql
INSERT INTO gerente_embarcacoes (user_id, embarcacao_id)
SELECT user_id, embarcacao_id 
FROM user_roles 
WHERE role = 'gerente_embarcacao' 
AND embarcacao_id IS NOT NULL;
```

## Ordem de Implementacao

1. Criar tabela `gerente_embarcacoes` com RLS
2. Migrar dados de user_roles para nova tabela
3. Criar funcao `get_user_embarcacao_ids`
4. Atualizar RLS policies das tabelas afetadas
5. Criar hook `useGerenteEmbarcacoes`
6. Criar componente `EmbarcacaoDashboardFilters`
7. Atualizar hooks com parametro periodoDias
8. Atualizar componentes de charts
9. Atualizar `EmbarcacaoOnlineUsers` com busca
10. Atualizar `GerenteEmbarcacaoDashboard`

