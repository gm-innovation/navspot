

# Plano: Funcionalidades Completas de Usuários e Perfil

## Problemas Identificados

### 1. Página de Usuários (`/usuarios`)
| Problema | Status atual |
|----------|--------------|
| Não exibe email | Mostra apenas "ID: abc123..." |
| Sem botão de editar | Só existe excluir |
| Não existe edge function | Apenas `create-user` e `delete-user` |

### 2. Dropdown do Header
| Problema | Status atual |
|----------|--------------|
| Item "Perfil" removido | Usuário não tem acesso rápido às suas informações |

---

## Solução Proposta

### Parte 1: Mostrar Email na Tabela de Usuários

O hook `useUsuarios` busca da tabela `user_roles`, que não tem email. Precisamos buscar os emails via edge function usando o admin client (que tem acesso à `auth.users`).

**Nova abordagem**: Criar uma edge function `list-users` que retorna usuários com emails.

### Parte 2: Funcionalidade de Editar Usuário

Criar modal de edição e edge function `update-user`:

| Campo editável | Descrição |
|----------------|-----------|
| Role | Mudar tipo de usuário |
| Empresa | Mudar empresa associada |
| Embarcação | Mudar embarcação associada |

**Nota**: O email não será editável (requer verificação).

### Parte 3: Restaurar Item "Perfil" no Header

Adicionar de volta o item "Perfil" que abre um dialog com informações do usuário logado (não navega para outra página).

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/list-users/index.ts` | Criar - lista usuários com emails |
| `supabase/functions/update-user/index.ts` | Criar - atualiza role/empresa/embarcação |
| `src/hooks/useUsuarios.ts` | Modificar - usar nova edge function |
| `src/pages/Usuarios.tsx` | Modificar - adicionar modal de edição |
| `src/components/AppLayout.tsx` | Modificar - adicionar item Perfil |
| `src/components/modals/UserProfileModal.tsx` | Criar - modal de perfil |

---

## Detalhes Técnicos

### Edge Function: `list-users`

```typescript
// Busca usuários com emails usando admin client
const { data: users } = await adminClient.auth.admin.listUsers()

// Junta com user_roles
const { data: roles } = await adminClient
  .from('user_roles')
  .select('*, empresas(nome), embarcacoes(nome)')

// Merge dos dados
return users.map(u => ({
  id: u.id,
  email: u.email,
  created_at: u.created_at,
  ...roles.find(r => r.user_id === u.id)
}))
```

### Edge Function: `update-user`

```typescript
interface UpdateUserRequest {
  user_id: string
  role: 'super_admin' | 'empresa_admin' | 'gerente_embarcacao'
  empresa_id?: string
  embarcacao_id?: string
}

// Validações hierárquicas:
// - Super Admin pode editar qualquer usuário
// - Empresa Admin pode editar gerentes da sua empresa
// - Ninguém pode editar a si mesmo para evitar escalação de privilégio
```

### Modal de Edição na Página Usuários

```tsx
// Estado para controlar edição
const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

// Botão de editar na tabela (ao lado do excluir)
<Button variant="ghost" size="icon" onClick={() => setEditingUser(usuario)}>
  <Pencil className="h-4 w-4" />
</Button>

// Dialog de edição similar ao de criação
<Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
  {/* Formulário com role, empresa, embarcação */}
</Dialog>
```

### Item Perfil no Header

```tsx
// Novo estado para modal de perfil
const [isProfileOpen, setIsProfileOpen] = useState(false);

// No dropdown
<DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
  <User className="h-4 w-4 mr-2" />
  Meu Perfil
</DropdownMenuItem>

// Modal de perfil
<UserProfileModal 
  open={isProfileOpen} 
  onOpenChange={setIsProfileOpen} 
/>
```

### Modal de Perfil (UserProfileModal)

```tsx
// Mostra informações do usuário logado:
// - Email
// - Papel (badge)
// - Empresa (se tiver)
// - Embarcação (se tiver)
// - Data de criação
// - Botão para alterar senha (abre página de Configurações)
```

---

## Hierarquia de Permissões (Edição)

| Quem edita | Pode editar |
|------------|-------------|
| Super Admin | Qualquer usuário (exceto a si mesmo) |
| Empresa Admin | Apenas gerentes da própria empresa |
| Gerente | Ninguém |

### Restrições de Segurança

1. **Não pode editar a si mesmo** - Evita escalação de privilégio
2. **Empresa Admin não pode promover** - Só edita gerentes
3. **Validação no backend** - Todas as regras verificadas na edge function

---

## Fluxo Visual: Página de Usuários

```text
+-------------------------------------------------------------------+
| USUÁRIOS DO SISTEMA                        [+ Novo Usuário]       |
+-------------------------------------------------------------------+

+-------------------------------------------------------------------+
| Usuário              | Tipo           | Empresa    | Ações        |
+-------------------------------------------------------------------+
| admin@navspot.com    | Super Admin    | -          | ✏️ 🗑️        |
| joao@empresa.com     | Admin Empresa  | NavCo      | ✏️ 🗑️        |
| maria@empresa.com    | Gerente Embar. | NavCo      | ✏️ 🗑️        |
+-------------------------------------------------------------------+

[✏️ = Editar] [🗑️ = Excluir]
```

---

## Fluxo Visual: Modal de Perfil

```text
+-----------------------------------+
|           MEU PERFIL              |
+-----------------------------------+
|                                   |
|  [👤] joao.silva                  |
|      joao.silva@empresa.com       |
|                                   |
+-----------------------------------+
|  Papel: [Administrador Empresa]   |
|  Empresa: Navegação ABC Ltda      |
|  Desde: 15/01/2025                |
+-----------------------------------+
|        [🔧 Configurações]         |
+-----------------------------------+
```

---

## Resumo das Mudanças

| Mudança | Descrição |
|---------|-----------|
| Nova edge function `list-users` | Lista usuários com emails |
| Nova edge function `update-user` | Atualiza role/empresa/embarcação |
| Hook `useUsuarios` atualizado | Usa nova edge function |
| Modal de edição em Usuarios.tsx | Permite editar usuários existentes |
| Item "Perfil" no header | Abre modal com informações do usuário |
| Modal UserProfileModal | Exibe dados do usuário logado |

