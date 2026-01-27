

# Alteração de Layout para Tabela na Página de Embarcações

## Objetivo

Alterar o layout da página de Embarcações de **cards** para **tabela** para todos os usuários, mantendo os botões de ação (criar, editar, excluir, gerar script) visíveis apenas para `super_admin`.

## Resumo das Permissões

| Papel | Visualizar | Layout | Criar | Editar | Excluir | Gerar Script |
|-------|------------|--------|-------|--------|---------|--------------|
| super_admin | Todas | Tabela | Sim | Sim | Sim | Sim |
| empresa_admin | Da empresa | Tabela | Nao | Nao | Nao | Nao |
| gerente_embarcacao | Que gerencia | Tabela | Nao | Nao | Nao | Nao |

## Arquivo a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `src/pages/Embarcacoes.tsx` | Substituir cards por tabela, adicionar verificacao de role para acoes |

## Alteracoes Detalhadas

### 1. Novos Imports Necessarios

```typescript
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
```

### 2. Adicionar Verificacao de Papel e Estado de Busca

No inicio do componente:

```typescript
const { hasRole } = useAuth();
const isSuperAdmin = hasRole(['super_admin']);
const [searchTerm, setSearchTerm] = useState("");
```

### 3. Adicionar Filtro de Busca

```typescript
const filteredEmbarcacoes = embarcacoes?.filter(embarcacao =>
  embarcacao.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
  embarcacao.empresa_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  embarcacao.tipo.toLowerCase().includes(searchTerm.toLowerCase())
) || [];
```

### 4. Modificar Header

Condicionar botao "Nova Embarcacao" e descricao ao papel do usuario:

```typescript
<div className="flex items-center justify-between">
  <div>
    <h1>Embarcacoes</h1>
    <p className="text-muted-foreground">
      {isSuperAdmin 
        ? "Gerencie embarcacoes e suas configuracoes de rede"
        : "Visualize as embarcacoes e suas informacoes"}
    </p>
  </div>
  {isSuperAdmin && (
    <Button onClick={handleCreate}>
      <Plus /> Nova Embarcacao
    </Button>
  )}
</div>
```

### 5. Substituir Grid de Cards por Tabela

Estrutura da tabela com colunas:

| Nome | Tipo | Empresa | Status | Hotspot | Tripulantes | Acoes (so super_admin) |
|------|------|---------|--------|---------|-------------|------------------------|

### 6. Layout Visual da Tabela

```text
+------------------------------------------------------------------+
| Lista de Embarcacoes               [Buscar embarcacoes...]       |
+---------------+--------+---------+--------+---------+------+-----+
| Nome          | Tipo   | Empresa | Status | Hotspot | Trip | ... |
+---------------+--------+---------+--------+---------+------+-----+
| Sonda NS-01   | Sonda  | NavSA   | Ativo  | Online  | 12   | [E][S][X] (super_admin)
| PSV Aurora    | PSV    | NavSA   | Ativo  | Offline | 8    | [E][S][X] (super_admin)
| AHTS Titan    | AHTS   | NavSA   | Inativo| Sem cfg | 15   | [E][S][X] (super_admin)
+---------------+--------+---------+--------+---------+------+-----+

[E] = Editar    [S] = Script    [X] = Excluir
```

### 7. Coluna de Acoes (apenas super_admin)

```typescript
{isSuperAdmin && (
  <TableHead className="text-right">Acoes</TableHead>
)}

// Na linha:
{isSuperAdmin && (
  <TableCell className="text-right">
    <div className="flex justify-end gap-1">
      <Button size="sm" onClick={() => handleEdit(embarcacao)}>
        <Settings />
      </Button>
      <Button size="sm" onClick={() => handleGenerateScript(embarcacao)}>
        <Code />
      </Button>
      <Button size="sm" onClick={() => handleDelete(embarcacao)}>
        <Trash2 />
      </Button>
    </div>
  </TableCell>
)}
```

### 8. Ajustar Empty State

```typescript
<EmptyState
  icon={Ship}
  title="Nenhuma embarcacao cadastrada"
  description={isSuperAdmin 
    ? "Comece adicionando sua primeira embarcacao." 
    : "Nao ha embarcacoes disponiveis para visualizacao."}
  actionLabel={isSuperAdmin ? "Nova Embarcacao" : undefined}
  onAction={isSuperAdmin ? handleCreate : undefined}
/>
```

## Estrutura Final da Pagina

```text
+------------------------------------------------------------------+
| Embarcacoes                                                       |
| Gerencie/Visualize embarcacoes...     [Nova Embarcacao] (super)  |
+------------------------------------------------------------------+
| [Total: 10] [Ativas: 8] [Tripulantes: 120] [Hotspots Online: 7]  |
+------------------------------------------------------------------+
| Lista de Embarcacoes                   [Buscar embarcacoes...]   |
+------------------------------------------------------------------+
| Nome          | Tipo  | Empresa | Status | Hotspot | Trip | Acoes|
+---------------+-------+---------+--------+---------+------+------+
| Sonda NS-01   | Sonda | NavSA   | Ativo  | Online  | 12   | ...  |
| PSV Aurora    | PSV   | NavSA   | Ativo  | Offline | 8    | ...  |
+---------------+-------+---------+--------+---------+------+------+
```

## Resumo das Modificacoes por Linha

| Linhas Atuais | Modificacao |
|---------------|-------------|
| 1-30 | Adicionar imports (useAuth, Table, Input, Search) |
| ~35 | Adicionar estado searchTerm e verificacao isSuperAdmin |
| ~88 | Adicionar filteredEmbarcacoes |
| 186-188 | Condicionar descricao do header |
| 190-193 | Condicionar botao "Nova Embarcacao" |
| 239-354 | Substituir grid de cards por Card com tabela |
| 356-362 | Ajustar EmptyState para nao-admins |

## Seguranca

As RLS policies no banco de dados ja garantem a protecao:
- **super_admin**: Full access (SELECT, INSERT, UPDATE, DELETE)
- **empresa_admin**: SELECT apenas nas embarcacoes da propria empresa
- **gerente_embarcacao**: SELECT apenas na embarcacao que gerencia

A alteracao na UI melhora a experiencia mostrando apenas o que cada perfil pode fazer.

