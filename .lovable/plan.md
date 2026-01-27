
# Plano: Melhorar Modal de Regras de Acesso com Seleção Múltipla de Listas

## Problema Atual

O modal de "Nova Regra de Acesso" permite selecionar apenas uma lista por vez, mas o usuário pode querer aplicar várias listas (ex: "Email + WhatsApp") ao mesmo tripulante/perfil. Atualmente, seria necessário criar várias regras manualmente.

## Análise do Schema

A tabela `regras_acesso` tem:
- `lista_id: string` (FK para uma única lista)
- Cada regra = 1 lista + 1 alvo (perfil/tripulante/MAC)

**Conclusão**: O schema atual é 1:1 (uma lista por regra), mas a UX pode permitir criar múltiplas regras de uma vez.

## Solução Proposta

Modificar o modal para permitir **seleção múltipla de listas**, onde cada lista selecionada cria uma regra separada com os mesmos parâmetros (alvo, horário, dias).

### Mudanças na UI

| Antes | Depois |
|-------|--------|
| Select único para lista | Checkboxes com listas agrupadas por tipo |
| Uma lista por submit | Múltiplas listas, cria N regras |
| Confuso sobre conflitos | Badges visuais (whitelist/blacklist) |

### Nova UI do Seletor de Listas

```
┌─────────────────────────────────────────────────┐
│  Listas de Acesso *                             │
│  ┌─────────────────────────────────────────┐    │
│  │  Selecione uma ou mais listas           │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ▼ Whitelists (permitir acesso)                 │
│    ☑ Comunicação - Email                        │
│    ☑ Comunicação - WhatsApp                     │
│    ☐ Trabalho - Google Workspace                │
│                                                 │
│  ▼ Blacklists (bloquear acesso)                 │
│    ☐ Redes Sociais                              │
│    ☐ Streaming de Vídeo                         │
│                                                 │
│  Selecionadas: 2 listas (2 regras serão criadas)│
└─────────────────────────────────────────────────┘
```

### Validação de Conflitos

Quando o usuário seleciona listas de tipos diferentes (whitelist + blacklist), exibir um alerta informativo:

```
⚠️ Atenção: Você selecionou listas de tipos diferentes.
   - Whitelists: permitem APENAS os domínios listados
   - Blacklists: bloqueiam os domínios listados

   A prioridade definirá qual regra é aplicada primeiro.
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/RegrasAcesso.tsx` | Novo componente de seleção múltipla, lógica de submit batch |
| `src/hooks/useRegrasAcesso.ts` | Novo hook `useCreateMultipleRegras` para inserção em lote |

## Detalhes Técnicos

### 1. Novo Estado do Formulário

```typescript
const [formData, setFormData] = useState({
  lista_ids: [] as string[],  // Array em vez de string única
  // ... resto igual
});
```

### 2. Componente de Seleção Múltipla

Novo componente `ListaMultiSelect` com:
- Agrupamento por tipo (whitelist/blacklist)
- Checkboxes para cada lista
- Badge com contagem de selecionadas
- Popover com scroll para muitas listas

### 3. Submit em Lote

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (formData.lista_ids.length === 0) {
    toast({ title: "Erro", description: "Selecione ao menos uma lista." });
    return;
  }

  // Criar uma regra para cada lista selecionada
  const basePrioridade = formData.prioridade;
  const regras = formData.lista_ids.map((lista_id, index) => ({
    ...dataToSubmit,
    lista_id,
    prioridade: basePrioridade + index, // Incrementar prioridade
  }));

  await createMultipleRegras.mutateAsync(regras);
  setFormOpen(false);
};
```

### 4. Hook para Inserção em Lote

```typescript
export function useCreateMultipleRegras() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (regras: RegraAcessoInsert[]) => {
      const { data, error } = await supabase
        .from('regras_acesso')
        .insert(regras)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['regras_acesso'] });
      toast({
        title: 'Regras criadas',
        description: `${data.length} regra(s) de acesso foram cadastradas.`,
      });
    },
  });
}
```

## Fluxo do Usuário

```text
1. Usuário abre modal "Nova Regra"
2. Clica em "Selecione listas"
3. Popover abre com listas agrupadas
4. Marca "Email" e "WhatsApp" (ambas whitelist)
5. Vê badge "2 listas selecionadas"
6. Preenche resto do formulário
7. Clica "Cadastrar"
8. Sistema cria 2 regras com prioridades 100 e 101
9. Toast: "2 regras de acesso foram cadastradas"
```

## Comportamento na Edição

Quando editando uma regra existente:
- Manter o comportamento atual (edita apenas aquela regra)
- Não permitir alterar para múltiplas listas
- Exibir seletor simples (modo edição)

## Resumo Visual das Mudanças

| Elemento | Antes | Depois |
|----------|-------|--------|
| Seletor de lista | Select dropdown único | Multi-select com checkboxes |
| Agrupamento | Nenhum | Por tipo (whitelist/blacklist) |
| Validação | Lista obrigatória | Ao menos 1 lista |
| Submit | 1 regra | N regras (uma por lista) |
| Feedback | "Regra criada" | "N regras criadas" |
| Modo edição | - | Mantém seletor simples |
