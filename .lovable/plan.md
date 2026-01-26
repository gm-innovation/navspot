

# Página de Empresas e Correção do Fuso Horário

## Entendimento do Problema

O fuso horário da **empresa** não tem relação com o fuso da **embarcação**. Uma empresa pode estar sediada em São Paulo, mas suas embarcações operarem em Manaus ou até em águas internacionais. Por isso:

- O timezone da empresa não deve ser usado como fallback
- O timezone deve ser definido **apenas na embarcação** como campo obrigatório
- O formulário de empresa deve ser simples: apenas dados cadastrais

## Mudanças Propostas

### 1. Página de Gerenciamento de Empresas

Criar uma página completa para o super_admin gerenciar empresas:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Empresas                                           │
│  Gerencie as empresas cadastradas no sistema                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────┬─────────┬─────────┬─────────┐     [+ Nova Empresa]                │
│  │  Total  │ Ativas  │Inativas │Embarc.  │                                     │
│  │    5    │    4    │    1    │   12    │                                     │
│  └─────────┴─────────┴─────────┴─────────┘                                     │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │ Empresa              │ CNPJ           │ Email           │ Status │ Ações  │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │ Navegação Alpha      │ 12.345.678/... │ contato@...     │ Ativo  │ [···]  │ │
│  │ Transporte Beta      │ 98.765.432/... │ admin@...       │ Ativo  │ [···]  │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Formulário de Empresa (Simplificado)

Sem campo de fuso horário - apenas dados cadastrais:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                          Nova Empresa                                           │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Nome *              [Navegação Alpha                     ]                    │
│  CNPJ                [12.345.678/0001-99                  ]                    │
│  Email               [contato@navegacao.com.br            ]                    │
│  Telefone            [(11) 99999-9999                     ]                    │
│  Endereço            [Av. Paulista, 1000 - São Paulo      ]                    │
│  Status              [▼ Ativo                             ]                    │
│                                                                                 │
│                      [Cancelar]  [Salvar]                                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Correção do Fuso Horário no Sistema

**Formulário de Embarcação:**
- Tornar o fuso horário **obrigatório** (não pode ficar vazio)
- Remover qualquer menção a "herdar da empresa"
- Manter o tooltip explicando que é o fuso predominante

**Edge Function (mikrotik-sync):**
- Remover o fallback para timezone da empresa
- Usar apenas o timezone da embarcação
- Se a embarcação não tiver timezone configurado, usar `America/Sao_Paulo` como default de emergência

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/pages/Empresas.tsx` | Criar | Página de listagem e gerenciamento |
| `src/components/forms/EmpresaForm.tsx` | Criar | Formulário modal (sem timezone) |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar "Empresas" no menu (super_admin) |
| `src/App.tsx` | Modificar | Adicionar rota `/empresas` |
| `src/components/forms/EmbarcacaoForm.tsx` | Modificar | Tornar timezone obrigatório |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Remover fallback para empresa timezone |

## Campos do Formulário de Empresa

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| nome | TEXT | Sim | Nome da empresa |
| cnpj | TEXT | Não | CNPJ formatado |
| email | TEXT | Não | Email de contato |
| telefone | TEXT | Não | Telefone de contato |
| endereco | TEXT | Não | Endereço da sede |
| status | TEXT | Sim | 'ativo' ou 'inativo' |

**Nota:** O campo `timezone` já existe na tabela `empresas` no banco, mas não será exibido nem utilizado. Isso evita a necessidade de uma migração para removê-lo.

## Permissões de Acesso

| Role | Empresas |
|------|----------|
| super_admin | CRUD completo |
| empresa_admin | Não vê no menu |
| gerente_embarcacao | Não vê no menu |

## Mudança no mikrotik-sync

Antes (com fallback para empresa):
```typescript
let effectiveTimezone = 'America/Sao_Paulo'
if (embarcacao?.timezone) {
  effectiveTimezone = embarcacao.timezone
} else if (embarcacao?.empresa_id) {
  // Busca timezone da empresa como fallback
  const { data: empresa } = await supabase...
  if (empresa?.timezone) {
    effectiveTimezone = empresa.timezone
  }
}
```

Depois (apenas embarcação):
```typescript
// Usa timezone da embarcação ou default
const effectiveTimezone = embarcacao?.timezone || 'America/Sao_Paulo'
```

## Ordem de Implementação

1. Criar `EmpresaForm.tsx` - Formulário simples
2. Criar `Empresas.tsx` - Página completa
3. Modificar `AppSidebar.tsx` - Adicionar menu
4. Modificar `App.tsx` - Adicionar rota
5. Modificar `EmbarcacaoForm.tsx` - Tornar timezone obrigatório
6. Modificar `mikrotik-sync` - Remover fallback empresa

## Benefícios

| Mudança | Benefício |
|---------|-----------|
| Página de Empresas | Super admin pode gerenciar todas as empresas |
| Formulário simplificado | Sem campos confusos (timezone) |
| Timezone só na embarcação | Modelo de dados mais correto |
| Timezone obrigatório | Evita erros de configuração |

