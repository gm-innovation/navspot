
# Plano: Reorganização Intuitiva do Sidebar

## Problema Atual

O menu atual exibe 14 itens em uma lista plana, dificultando a navegação e compreensão das funcionalidades:

```text
Menu Principal (tudo junto)
├── Dashboard
├── Monitoramento
├── Status do Serviço
├── Empresas
├── Embarcações
├── Tripulantes
├── Dispositivos
├── Perfis
├── Listas de Acesso
├── Regras de Acesso
├── Relatórios
├── Usuários
├── LGPD
├── Alertas
└── Configurações
```

---

## Nova Organização Proposta

Agrupar os itens por função/contexto:

| Grupo | Itens | Descrição |
|-------|-------|-----------|
| Visão Geral | Dashboard, Monitoramento, Status do Serviço | Informações em tempo real |
| Cadastros | Empresas, Embarcações, Tripulantes, Dispositivos | Gestão de entidades |
| Controle de Acesso | Perfis, Listas de Acesso, Regras de Acesso | Configuração de permissões WiFi |
| Análises | Relatórios, Alertas | Dados e notificações |
| Administração | Usuários, LGPD, Configurações | Gestão do sistema |

---

## Estrutura Visual

```text
VISÃO GERAL
  ├── Dashboard
  ├── Monitoramento
  └── Status do Serviço

CADASTROS
  ├── Empresas (apenas super_admin)
  ├── Embarcações
  ├── Tripulantes
  └── Dispositivos

CONTROLE DE ACESSO
  ├── Perfis de Velocidade
  ├── Listas de Acesso
  └── Regras de Acesso

ANÁLISES
  ├── Relatórios
  └── Alertas

ADMINISTRAÇÃO
  ├── Usuários
  ├── LGPD
  └── Configurações

USUÁRIO
  └── [nome e papel]
```

---

## Mudanças Técnicas

### Arquivo a Modificar
`src/components/AppSidebar.tsx`

### Nova Estrutura de Dados

```typescript
interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/", icon: Home, roles: [...] },
      { title: "Monitoramento", url: "/monitoramento", icon: Activity, roles: [...] },
      { title: "Status do Serviço", url: "/status-servico", icon: HeartPulse, roles: [...] },
    ]
  },
  {
    label: "Cadastros",
    items: [
      { title: "Empresas", url: "/empresas", icon: Building2, roles: ['super_admin'] },
      { title: "Embarcações", url: "/embarcacoes", icon: Ship, roles: [...] },
      { title: "Tripulantes", url: "/tripulantes", icon: Users, roles: [...] },
      { title: "Dispositivos", url: "/dispositivos", icon: Smartphone, roles: [...] },
    ]
  },
  {
    label: "Controle de Acesso",
    items: [
      { title: "Perfis de Velocidade", url: "/perfis-velocidade", icon: Gauge, roles: [...] },
      { title: "Listas de Acesso", url: "/listas-acesso", icon: List, roles: [...] },
      { title: "Regras de Acesso", url: "/regras-acesso", icon: ShieldCheck, roles: [...] },
    ]
  },
  {
    label: "Análises",
    items: [
      { title: "Relatórios", url: "/relatorios", icon: FileBarChart, roles: [...] },
      { title: "Alertas", url: "/alertas", icon: Bell, roles: [...] },
    ]
  },
  {
    label: "Administração",
    items: [
      { title: "Usuários", url: "/usuarios", icon: UserCog, roles: [...] },
      { title: "LGPD", url: "/lgpd", icon: Shield, roles: [...] },
      { title: "Configurações", url: "/configuracoes", icon: Settings, roles: [...] },
    ]
  },
];
```

### Renderização com Grupos

```tsx
{filteredGroups.map((group) => (
  <SidebarGroup key={group.label}>
    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.title}>
            {/* NavLink como já existe */}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
))}
```

### Filtragem por Papel

Os grupos serão filtrados para mostrar apenas se tiverem pelo menos um item visível para o papel do usuário:

```typescript
const filteredGroups = navigationGroups
  .map(group => ({
    ...group,
    items: group.items.filter(item => hasRole(item.roles))
  }))
  .filter(group => group.items.length > 0);
```

---

## Benefícios

1. **Navegação mais rápida** - Usuário encontra funções relacionadas juntas
2. **Melhor escaneabilidade** - Labels de grupo ajudam a localizar áreas
3. **Contextualização** - Agrupamento lógico facilita o entendimento do sistema
4. **Adaptável por papel** - Grupos vazios são ocultados automaticamente

---

## Resumo

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Grupos | 1 (Menu Principal) | 5 grupos temáticos |
| Organização | Lista plana | Agrupamento por função |
| Arquivo | `AppSidebar.tsx` | Mesmo arquivo, reestruturado |
