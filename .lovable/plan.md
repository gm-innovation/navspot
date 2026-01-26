
# Adicionar Espaçamento na Página de Empresas

## Problema Identificado

O conteúdo da página de Empresas está colado diretamente na sidebar, sem nenhum espaçamento. Isso acontece porque o container principal da página não possui padding.

## Comparação com Outras Páginas

| Página | Container | Padding |
|--------|-----------|---------|
| Dashboard.tsx | `<div className="flex-1 p-6">` | `p-6` |
| Embarcacoes.tsx | `<div className="flex-1 space-y-6 p-6">` | `p-6` |
| **Empresas.tsx** | `<div className="space-y-6">` | **Faltando** |

## Solução

Adicionar `flex-1` e `p-6` ao container principal da página Empresas para manter consistência visual com as demais páginas do sistema.

## Mudança

**Arquivo:** `src/pages/Empresas.tsx`

**Linha 105 - De:**
```tsx
<div className="space-y-6">
```

**Para:**
```tsx
<div className="flex-1 space-y-6 p-6">
```

Isso adiciona:
- `p-6` - Padding de 24px em todos os lados, criando o espaçamento necessário
- `flex-1` - Garante que o conteúdo preencha o espaço disponível
