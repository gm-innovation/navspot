
# Sistema de Gerenciamento Hierárquico de Usuários

## Resumo do Problema

O sistema atual permite auto-cadastro de usuários, o que viola a hierarquia desejada:
- **Super Admin**: pode criar todos os tipos de usuários
- **Empresa Admin**: pode criar gerentes de embarcação e usuários hotspot (tripulantes)
- **Gerente Embarcação**: pode criar apenas usuários hotspot (tripulantes)

Além disso, o primeiro usuário (`engenharia@googlemarine.com.br`) foi criado sem role na tabela `user_roles`.

## Mudanças Necessárias

### 1. Banco de Dados

**Migração SQL:**
```sql
-- 1. Atribuir super_admin ao primeiro usuário existente
INSERT INTO user_roles (user_id, role)
VALUES ('66cb1864-4fe5-4a9d-98c8-535781f28c2d', 'super_admin');

-- 2. Trigger para atribuir super_admin ao primeiro usuário futuro (se tabela vazia)
CREATE OR REPLACE FUNCTION public.assign_first_user_as_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;
```

### 2. Remover Auto-Cadastro

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Cadastro.tsx` | Deletar arquivo |
| `src/pages/Login.tsx` | Remover link para cadastro |
| `src/App.tsx` | Remover rota `/cadastro` |
| `src/contexts/AuthContext.tsx` | Remover função `signup` |

### 3. Nova Página de Gerenciamento de Usuários

**Arquivo:** `src/pages/Usuarios.tsx`

Funcionalidades:
- Listar usuários do sistema (com role ou pendentes)
- Super Admin pode criar usuários com qualquer role
- Empresa Admin pode criar gerentes de embarcação para suas embarcações
- Criar usuário = criar credencial via Supabase Admin API (Edge Function)

### 4. Edge Function: Criar Usuários

**Arquivo:** `supabase/functions/create-user/index.ts`

Esta função usa o Service Role Key para:
1. Criar usuário no Supabase Auth
2. Inserir role na tabela `user_roles`
3. Validar hierarquia (quem pode criar quem)

```text
Fluxo de Criação:
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend       │────▶│  Edge Function   │────▶│  Supabase Auth  │
│  (Usuarios.tsx) │     │  (create-user)   │     │  + user_roles   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Validações:          │
                    │ - Super Admin: todos │
                    │ - Empresa Admin:     │
                    │   gerente + sua emp  │
                    │ - Gerente: nenhum    │
                    └──────────────────────┘
```

### 5. Atualização do AuthContext

**Mudanças:**
- Remover função `signup`
- Suportar `role: UserRole | null` para usuários sem role
- Adicionar estado `isPendingApproval`
- Mostrar tela de bloqueio quando role é null

### 6. Novo Hook: useUsuarios

**Arquivo:** `src/hooks/useUsuarios.ts`

```typescript
// Funções do hook
- useUsuarios() - listar usuários com roles
- useCreateUser() - criar usuário via edge function
- useUpdateUserRole() - atualizar role
- useDeleteUser() - deletar usuário
```

### 7. Distinção: Usuários do Sistema vs Tripulantes

| Aspecto | Usuários do Sistema | Tripulantes |
|---------|---------------------|-------------|
| Onde ficam | `auth.users` + `user_roles` | `tripulantes` |
| Para que servem | Acessar painel web | Usar WiFi hotspot |
| Quem cria | Admins hierárquicos | Admins + Gerentes |
| Autenticação | Supabase Auth | Hotspot RADIUS |

Os **tripulantes** (usuários hotspot) já são gerenciados na página Tripulantes existente e não fazem login no sistema web.

## Hierarquia de Permissões

```text
┌─────────────────────────────────────────────────────────────────┐
│                        SUPER ADMIN                              │
│  • Acesso total ao sistema                                      │
│  • Criar: super_admin, empresa_admin, gerente_embarcacao        │
│  • Ver: todas empresas, embarcações, tripulantes                │
├─────────────────────────────────────────────────────────────────┤
│                      EMPRESA ADMIN                              │
│  • Acesso aos dados da sua empresa                              │
│  • Criar: gerente_embarcacao (suas embarcações)                 │
│  • Ver: embarcações da empresa, tripulantes                     │
├─────────────────────────────────────────────────────────────────┤
│                   GERENTE EMBARCAÇÃO                            │
│  • Acesso apenas à sua embarcação                               │
│  • Criar: tripulantes (usuários hotspot)                        │
│  • Ver: tripulantes da embarcação, alertas                      │
└─────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | Criar | Atribuir super_admin + trigger |
| `src/pages/Cadastro.tsx` | Deletar | Remover auto-cadastro |
| `src/pages/Login.tsx` | Modificar | Remover link para cadastro |
| `src/App.tsx` | Modificar | Remover rota /cadastro, adicionar /usuarios |
| `src/contexts/AuthContext.tsx` | Modificar | Remover signup, suportar role null |
| `src/pages/Usuarios.tsx` | Criar | Interface de gerenciamento |
| `src/hooks/useUsuarios.ts` | Criar | CRUD de usuários |
| `src/components/PendingApprovalScreen.tsx` | Criar | Tela para usuários sem role |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar link Usuários |
| `supabase/functions/create-user/index.ts` | Criar | Edge function para criar usuários |
| `supabase/functions/delete-user/index.ts` | Criar | Edge function para deletar usuários |

## Validações de Segurança

1. **Edge Function valida role do requisitante** antes de criar usuário
2. **Empresa Admin só pode criar gerentes para embarcações da sua empresa**
3. **Gerente Embarcação não pode criar usuários do sistema**
4. **Tripulantes são gerenciados separadamente** (página Tripulantes existente)
5. **RLS policies existentes protegem acesso aos dados**

## Ordem de Implementação

1. **Migração**: Inserir role super_admin para usuário existente
2. **Edge Functions**: Criar funções de gerenciamento de usuários
3. **AuthContext**: Atualizar para suportar role null
4. **Remover Cadastro**: Deletar página e links
5. **Página Usuarios**: Interface de gerenciamento
6. **Navegação**: Adicionar rota e link no sidebar
