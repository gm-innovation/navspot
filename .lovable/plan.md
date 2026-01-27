

# Plano: Permitir Admins Registrarem Solicitações LGPD em Nome de Tripulantes

## Contexto

O tripulante não tem acesso ao sistema. Quando um tripulante faz uma solicitação LGPD (ex: pedir seus dados, solicitar exclusão), ele comunica verbalmente ou por escrito ao administrador da empresa/embarcação, que então registra essa solicitação no sistema.

---

## Solução Proposta

### Opção 1: Botão na Aba de Solicitações (Recomendado)

Adicionar um botão "Nova Solicitação" na aba de Solicitações da página LGPD que abre um modal para registrar a solicitação.

| Campo | Descrição |
|-------|-----------|
| Tripulante | Select com lista de tripulantes da empresa |
| Tipo | Acesso, Retificação, Exclusão, Portabilidade, Oposição |
| Descrição | Texto livre descrevendo o pedido |

### Opção 2: Ação no Menu de Tripulantes

Adicionar item "Registrar Solicitação LGPD" no dropdown de ações da tabela de tripulantes. Essa opção já vem com o tripulante pré-selecionado.

**Implementação**: Faremos **ambas as opções** para flexibilidade.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/hooks/useLGPD.ts` | Adicionar hook `useCreateSolicitacao` |
| `src/components/lgpd/EmpresaLGPDView.tsx` | Adicionar botão e modal na aba Solicitações |
| `src/pages/Tripulantes.tsx` | Adicionar item no dropdown de ações |

---

## Detalhes Técnicos

### Hook useCreateSolicitacao

```typescript
export function useCreateSolicitacao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      tripulante_id,
      tipo,
      descricao,
    }: {
      tripulante_id: string;
      tipo: 'acesso' | 'retificacao' | 'exclusao' | 'portabilidade' | 'oposicao';
      descricao?: string;
    }) => {
      const { data, error } = await supabase
        .from("solicitacoes_lgpd")
        .insert({
          tripulante_id,
          tipo,
          descricao,
          status: 'pendente',
          // prazo_legal é calculado automaticamente pelo default do banco (15 dias)
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-lgpd"] });
      toast({
        title: "Solicitação registrada",
        description: "A solicitação LGPD foi registrada com sucesso.",
      });
    },
  });
}
```

### Modal de Nova Solicitação

```tsx
// Dentro de EmpresaLGPDView.tsx
const [novaSolicitacaoOpen, setNovaSolicitacaoOpen] = useState(false);
const [novaForm, setNovaForm] = useState({
  tripulante_id: '',
  tipo: 'acesso' as const,
  descricao: '',
});

// Buscar tripulantes para o select
const { data: tripulantes } = useTripulantes();

// No JSX da aba Solicitações
<CardHeader>
  <div className="flex items-center justify-between">
    <div>
      <CardTitle>Solicitações de Titulares</CardTitle>
      <CardDescription>...</CardDescription>
    </div>
    <Button onClick={() => setNovaSolicitacaoOpen(true)}>
      <Plus className="h-4 w-4 mr-2" />
      Nova Solicitação
    </Button>
  </div>
</CardHeader>
```

### Ação no Dropdown de Tripulantes

```tsx
// Em Tripulantes.tsx, adicionar no DropdownMenuContent
<DropdownMenuItem onClick={() => handleOpenLGPDSolicitacao(tripulante)}>
  <Shield className="h-4 w-4 mr-2" />
  Solicitação LGPD
</DropdownMenuItem>
```

---

## Fluxo Visual: Modal de Nova Solicitação

```text
+-------------------------------------------+
|         NOVA SOLICITAÇÃO LGPD             |
+-------------------------------------------+
|                                           |
|  Tripulante                               |
|  ┌─────────────────────────────────────┐  |
|  │ ▼ Selecione um tripulante...       │  |
|  └─────────────────────────────────────┘  |
|                                           |
|  Tipo de Solicitação                      |
|  ┌─────────────────────────────────────┐  |
|  │ ○ Acesso aos dados                 │  |
|  │ ○ Retificação de dados             │  |
|  │ ○ Exclusão de dados                │  |
|  │ ○ Portabilidade                    │  |
|  │ ○ Oposição ao tratamento           │  |
|  └─────────────────────────────────────┘  |
|                                           |
|  Descrição (opcional)                     |
|  ┌─────────────────────────────────────┐  |
|  │ Descreva o pedido do tripulante... │  |
|  │                                     │  |
|  └─────────────────────────────────────┘  |
|                                           |
|  ⚠️ Prazo legal: 15 dias para resposta    |
|                                           |
|  [Cancelar]              [Registrar]      |
+-------------------------------------------+
```

---

## Fluxo Visual: Aba Solicitações Atualizada

```text
+-------------------------------------------------------------------+
| Solicitações de Titulares                    [+ Nova Solicitação] |
| Gerencie solicitações de acesso, retificação, exclusão...         |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
| Titular       | Tipo        | Status    | Data     | Prazo | Ações|
+-------------------------------------------------------------------+
| João Silva    | Acesso      | Pendente  | 27/01    | 3d    | [👁️] |
| Maria Santos  | Exclusão    | Em Análise| 25/01    | 1d    | [👁️] |
+-------------------------------------------------------------------+
```

---

## Tipos de Solicitação LGPD

| Tipo | Descrição | Art. LGPD |
|------|-----------|-----------|
| **Acesso** | Tripulante quer saber quais dados temos sobre ele | Art. 18, II |
| **Retificação** | Tripulante quer corrigir dados incorretos | Art. 18, III |
| **Exclusão** | Tripulante quer que seus dados sejam apagados | Art. 18, VI |
| **Portabilidade** | Tripulante quer receber seus dados em formato estruturado | Art. 18, V |
| **Oposição** | Tripulante se opõe a algum tratamento específico | Art. 18, IV |

---

## Resumo das Mudanças

| Mudança | Descrição |
|---------|-----------|
| Hook `useCreateSolicitacao` | Permite criar novas solicitações |
| Botão "Nova Solicitação" | Na aba Solicitações da página LGPD |
| Modal de cadastro | Com select de tripulante, tipo e descrição |
| Item no dropdown de tripulantes | Atalho para registrar solicitação diretamente |

