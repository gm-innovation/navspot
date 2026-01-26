
# Correção: Sidebar Abaixo do Header

## Problema Identificado

A sidebar está usando `position: fixed` com `inset-y-0`, o que faz ela ocupar toda a altura da viewport (de cima para baixo). Como o header tem altura de `h-14` (3.5rem/56px), a sidebar está começando por trás do header, causando o primeiro item "Dashboard" a ficar cortado.

## Causa Raiz

No componente `Sidebar` (sidebar.tsx, linha 235):
```tsx
className="duration-200 fixed inset-y-0 z-10 hidden h-svh..."
```

O `inset-y-0` significa `top: 0` e `bottom: 0`, fazendo a sidebar começar do topo da tela.

## Solução

Modificar o `AppLayout.tsx` para ajustar a sidebar:

1. Adicionar `pt-14` (padding-top) no container flex para compensar o header
2. Ou ajustar a sidebar para começar depois do header usando `top-14` em vez de `inset-y-0`

A solução mais limpa é ajustar o container principal para que a sidebar comece abaixo do header fixo.

## Mudanças Necessárias

### Arquivo: `src/components/AppLayout.tsx`

Alterar a estrutura do layout para que o container da sidebar e main comece abaixo do header:

```tsx
// Antes (linha 87):
<div className="flex w-full">

// Depois:
<div className="flex w-full pt-14">
```

E ajustar a sidebar para não usar altura total da viewport:

### Alternativa melhor: Modificar `src/components/AppSidebar.tsx`

Adicionar classe `top-14` para a sidebar começar abaixo do header:

```tsx
<Sidebar className="border-r top-14 h-[calc(100vh-3.5rem)]">
```

## Detalhes Técnicos

| Mudança | Arquivo | Descrição |
|---------|---------|-----------|
| Ajustar altura sidebar | `AppSidebar.tsx` | Adicionar `top-14 h-[calc(100vh-3.5rem)]` |
| Ajustar container principal | `AppLayout.tsx` | Adicionar `pt-14` ao flex container |

## Resultado Esperado

- Header permanece fixo no topo com z-50
- Sidebar começa imediatamente abaixo do header (56px do topo)
- Primeiro item "Dashboard" totalmente visível
- Scroll da sidebar funciona corretamente dentro da área disponível
