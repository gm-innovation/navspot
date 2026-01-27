

# Plano: Corrigir Links do Menu de Usuário

## Problema

Os itens "Perfil" e "Configurações" no dropdown do header não funcionam - são apenas `<DropdownMenuItem>` sem ações.

## Solução

### Opção escolhida

| Item | Ação |
|------|------|
| **Perfil** | Remover - as informações de perfil já estão no card "Conta e Segurança" dentro de Configurações |
| **Configurações** | Navegar para `/configuracoes` |

### Alternativa considerada

Manter "Perfil" e navegar para `/configuracoes#perfil`, mas isso adiciona complexidade desnecessária já que a página de Configurações é compacta.

---

## Mudança Técnica

### Arquivo a modificar
`src/components/AppLayout.tsx`

### Alterações

1. Importar `useNavigate` do react-router-dom
2. Adicionar `onClick` ao item "Configurações" para navegar
3. Remover item "Perfil" (redundante)

### Código atual (linhas 63-64)

```tsx
<DropdownMenuItem>Perfil</DropdownMenuItem>
<DropdownMenuItem>Configurações</DropdownMenuItem>
```

### Código novo

```tsx
<DropdownMenuItem onClick={() => navigate('/configuracoes')}>
  <Settings className="h-4 w-4 mr-2" />
  Configurações
</DropdownMenuItem>
```

---

## Resultado esperado

| Antes | Depois |
|-------|--------|
| Clique em "Perfil" → nada acontece | Item removido |
| Clique em "Configurações" → nada acontece | Navega para /configuracoes |

O dropdown ficará mais limpo e funcional:

```text
+---------------------------+
| [avatar] engenharia       |
|  engenharia@googlemarine  |
+---------------------------+
| ⚙️ Configurações          |  ← clicável
+---------------------------+
| 🔴 Sair                   |  ← já funciona
+---------------------------+
```

---

## Seção Técnica

```typescript
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // ... resto do código
  
  return (
    // ... header
    <DropdownMenuContent align="end" className="w-56">
      {/* Info do usuário */}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => navigate('/configuracoes')}>
        <Settings className="h-4 w-4 mr-2" />
        Configurações
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-red-600" onClick={logout}>
        Sair
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
```

