
# Correção de Padding na Página de Ações Pendentes

## Problema Identificado

O conteúdo da página `AcoesPendentes.tsx` está colado na sidebar porque falta padding no container principal. 

Comparando com outras páginas do sistema (como `Dashboard.tsx`), o padrão é usar a classe `p-6` para adicionar espaçamento interno.

## Solução

Modificar a linha 164 do arquivo `src/pages/AcoesPendentes.tsx`:

**Antes:**
```tsx
<div className="space-y-6">
```

**Depois:**
```tsx
<div className="flex-1 space-y-6 p-6">
```

## Detalhes Técnicos

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/AcoesPendentes.tsx` | Adicionar `p-6` e `flex-1` ao container raiz |

A classe `p-6` adiciona 24px (1.5rem) de padding em todos os lados, seguindo o padrão já estabelecido em outras páginas do sistema como Dashboard, Empresas, Embarcações, etc.
