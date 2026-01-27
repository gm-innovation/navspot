

# Plano: Corrigir Layout de Usuários e Aprimorar Edição de Perfil

## Problemas Identificados

### 1. Layout da Página de Usuários
O conteúdo está colado no sidebar porque a página não tem padding adequado.

| Problema | Causa |
|----------|-------|
| Conteúdo colado | `<div className="space-y-6">` sem `p-6` |
| Colunas de ações vazias | Você é o único usuário e não pode editar a si mesmo (comportamento correto de segurança) |

### 2. Modal de Perfil Limitado
O modal atual só exibe informações. O usuário espera poder editar:
- Nome de exibição
- Avatar
- Senha
- Email (somente visualização - requer verificação)

### 3. Falta Tabela de Perfis
Atualmente não existe uma tabela `profiles` no banco. Os dados do usuário estão apenas em:
- `auth.users` (email, senha - gerenciado pelo sistema de auth)
- `user_roles` (role, empresa_id, embarcacao_id)

---

## Solução Proposta

### Parte 1: Corrigir Layout

Adicionar padding na página de Usuários:

```tsx
// Antes (linha 292 de Usuarios.tsx)
<div className="space-y-6">

// Depois
<div className="flex-1 space-y-6 p-6">
```

### Parte 2: Criar Tabela de Perfis

Criar tabela para armazenar dados editáveis:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid | PK, referencia auth.users.id |
| display_name | text | Nome de exibição |
| avatar_url | text | URL do avatar (storage) |
| created_at | timestamp | Data de criação |
| updated_at | timestamp | Última atualização |

### Parte 3: Transformar Modal de Perfil

Converter o modal em uma página completa de edição com abas ou seções:

**Seção 1 - Informações Básicas:**
- Avatar (upload de imagem)
- Nome de exibição (editável)
- Email (somente leitura)
- Papel no sistema (badge)

**Seção 2 - Segurança:**
- Alterar senha (formulário inline)

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/Usuarios.tsx` | Modificar - adicionar padding |
| `src/components/modals/UserProfileModal.tsx` | Modificar - adicionar edição |
| `src/hooks/useProfile.ts` | Criar - hook para gerenciar perfil |
| Migração SQL | Criar - tabela profiles |

---

## Detalhes Técnicos

### Migração SQL

```sql
-- Criar tabela de perfis
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: usuário pode ver e editar seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Trigger para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, split_part(new.email, '@', 1));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Hook useProfile

```typescript
export function useProfile() {
  const { user } = useAuth();
  
  const query = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  
  const updateProfile = useMutation({
    mutationFn: async (updates: { display_name?: string; avatar_url?: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['profile']),
  });
  
  return { ...query, updateProfile };
}
```

### Modal de Perfil Aprimorado

```tsx
export function UserProfileModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { data: profile, updateProfile } = useProfile();
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  
  // Seção de avatar com upload
  // Seção de nome editável inline
  // Seção de alteração de senha integrada
  
  return (
    <Dialog>
      <DialogContent className="sm:max-w-lg">
        {/* Avatar com botão de upload */}
        {/* Nome editável */}
        {/* Informações do sistema (read-only) */}
        {/* Formulário de alteração de senha */}
      </DialogContent>
    </Dialog>
  );
}
```

---

## Fluxo Visual: Modal de Perfil

```text
+-------------------------------------------+
|              MEU PERFIL                   |
+-------------------------------------------+
|                                           |
|     [====]  👤  [====]                    |
|          Trocar foto                      |
|                                           |
|  Nome de Exibição                         |
|  ┌─────────────────────────────┐  [✏️]   |
|  │ João Silva                  │          |
|  └─────────────────────────────┘          |
|                                           |
|  Email (não editável)                     |
|  joao.silva@empresa.com                   |
|                                           |
|  Papel: [Admin Empresa]                   |
|  Empresa: Navegação ABC                   |
|                                           |
+-------------------------------------------+
|  🔒 SEGURANÇA                             |
+-------------------------------------------+
|                                           |
|  [ Alterar Senha ]                        |
|                                           |
+-------------------------------------------+
```

---

## Página de Usuários Corrigida

```text
+------ SIDEBAR ------+------- CONTEÚDO (com padding) -------+
|                     |                                       |
|  VISÃO GERAL        |  Usuários do Sistema                  |
|    Dashboard        |  Gerencie os usuários...    [+ Novo]  |
|    ...              |                                       |
|                     |  ┌─────────────────────────────────┐  |
|  ADMINISTRAÇÃO      |  │ Lista de Usuários               │  |
|    Usuários ←       |  │                                 │  |
|    LGPD             |  │  Email    Tipo    Empresa Ações │  |
|    Configurações    |  │  ──────  ──────  ─────── ────── │  |
|                     |  │  user@.. Admin   NavCo    -     │  |
|                     |  └─────────────────────────────────┘  |
+---------------------+---------------------------------------+
```

**Nota sobre Ações**: Como você é o único usuário e não pode editar a si mesmo (regra de segurança), a coluna de ações aparece vazia. Isso é o comportamento correto. Quando criar outros usuários, os botões aparecerão.

---

## Resumo das Mudanças

| Mudança | Descrição |
|---------|-----------|
| Padding na página Usuarios | Corrige layout colado |
| Tabela profiles | Armazena nome e avatar |
| Hook useProfile | Gerencia dados do perfil |
| Modal de perfil aprimorado | Permite editar nome, avatar, senha |
| Trigger para novos usuários | Cria perfil automaticamente |

