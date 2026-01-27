
# Plano: Reestruturação da Página LGPD por Papel de Usuário

## Problema Identificado

A implementação atual assume que todos os usuários têm um `empresa_id`, mas:

| Papel | Tem empresa_id? | O que deveria ver |
|-------|-----------------|-------------------|
| `super_admin` | NÃO | Lista de TODAS as empresas com status LGPD de cada uma |
| `empresa_admin` | SIM | Configurações LGPD da SUA empresa apenas |
| `gerente_embarcacao` | SIM (via empresa) | Visualização somente leitura da config da empresa |

O código atual no hook `useLGPDConfigWithEmpresa()` retorna `null` quando não há `empresa_id`, fazendo com que o `super_admin` veja uma tela vazia.

---

## Arquitetura da Solução

```text
/lgpd (rota única)
    │
    ├── SE super_admin:
    │   │
    │   └── LISTA DE EMPRESAS com status LGPD
    │       ├── Empresa A - DPO: Maria - Retenção: 12m - [Ver Detalhes]
    │       ├── Empresa B - DPO: João - Retenção: 6m - [Ver Detalhes]
    │       └── Empresa C - DPO: (não definido) - [Ver Detalhes]
    │
    │       + Aba "Exportação Judicial" (para ordens judiciais)
    │       + Aba "Solicitações" (todas as empresas)
    │       + Aba "Auditoria" (todos os logs)
    │
    └── SE empresa_admin ou gerente:
        │
        └── CONFIGURAÇÃO DA EMPRESA (como está hoje)
            ├── Dados do Controlador (somente leitura)
            ├── DPO (editável para admin)
            └── Retenção (editável para admin)
```

---

## Mudanças Necessárias

### 1. Novo Hook: `useAllEmpresasLGPD()`

Para `super_admin`, buscar todas as empresas com suas configurações LGPD:

```typescript
export function useAllEmpresasLGPD() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["all-empresas-lgpd"],
    queryFn: async () => {
      // Buscar todas empresas
      const { data: empresas } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, email, telefone, status")
        .order("nome");

      // Buscar todas configs LGPD
      const { data: configs } = await supabase
        .from("lgpd_config")
        .select("*");

      // Combinar dados
      return empresas?.map(empresa => ({
        ...empresa,
        lgpd_config: configs?.find(c => c.empresa_id === empresa.id) || null
      }));
    },
    enabled: user?.role === 'super_admin',
  });
}
```

### 2. Modificar `GestaoLGPD.tsx`

Renderizar UI diferente baseada no papel:

```typescript
export default function GestaoLGPD() {
  const { user } = useAuth();
  
  // Super admin vê todas as empresas
  if (user?.role === 'super_admin') {
    return <SuperAdminLGPDView />;
  }
  
  // Empresa admin/gerente veem sua própria empresa
  return <EmpresaLGPDView />;
}
```

### 3. Novo Componente: `SuperAdminLGPDView`

Interface para super_admin com:

```text
+------------------------------------------------------------------+
| GESTÃO LGPD - VISÃO GERAL                                        |
| Gerencie a conformidade LGPD de todas as empresas clientes       |
+------------------------------------------------------------------+

[Configurações] [Solicitações] [Exportação Judicial] [Auditoria]

+------------------------------------------------------------------+
| EMPRESAS E STATUS LGPD                                           |
+------------------------------------------------------------------+
| Empresa          | CNPJ           | DPO           | Retenção | Status |
|------------------|----------------|---------------|----------|--------|
| Navegação ABC    | 12.345.678/... | Maria Silva   | 12 meses | ✓ OK   |
| Transportes XYZ  | 98.765.432/... | (não definido)| 6 meses  | ⚠ Pendente |
| Marítima JKL     | 11.222.333/... | João Santos   | 12 meses | ✓ OK   |
+------------------------------------------------------------------+

[Clicar em linha abre modal com detalhes completos]
```

### 4. Modal de Detalhes da Empresa

Quando super_admin clica em uma empresa:

```text
+------------------------------------------+
| LGPD - Navegação ABC Ltda           [X]  |
+------------------------------------------+
|                                          |
| DADOS DO CONTROLADOR                     |
| Razão Social: Navegação ABC Ltda         |
| CNPJ: 12.345.678/0001-90                 |
| Email: contato@navegacaoabc.com.br       |
|                                          |
| ENCARREGADO DE DADOS (DPO)               |
| Nome: Maria Silva                        |
| Email: dpo@navegacaoabc.com.br           |
| Telefone: (13) 99999-9999                |
|                                          |
| CONFIGURAÇÕES                            |
| Retenção de logs: 12 meses               |
| Versão Política: v1.0                    |
| Versão Termos: v1.0                      |
|                                          |
| ESTATÍSTICAS                             |
| Tripulantes: 45                          |
| Com consentimento: 43 (95%)              |
| Solicitações pendentes: 2                |
|                                          |
+------------------------------------------+
```

### 5. Aba "Exportação Judicial" (apenas super_admin)

Para atender ordens judiciais via Marco Civil:

```text
+------------------------------------------------------------------+
| EXPORTAÇÃO DE LOGS PARA ORDEM JUDICIAL                           |
+------------------------------------------------------------------+
|                                                                   |
| Empresa:       [ Selecionar empresa... ▼ ]                       |
| Tripulante:    [ Selecionar tripulante... ▼ ] (opcional)         |
| Período:       [ 01/01/2024 ] até [ 31/01/2024 ]                 |
| Nº Processo:   [ 1234567-89.2024.8.26.0001 ]                     |
|                                                                   |
|                              [ Exportar Logs (JSON assinado) ]   |
+------------------------------------------------------------------+
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useLGPDConfig.ts` | Modificar | Adicionar hook `useAllEmpresasLGPD()` |
| `src/pages/GestaoLGPD.tsx` | Modificar | Renderização condicional por papel |
| (componente interno) | Criar | `SuperAdminLGPDView` dentro de GestaoLGPD.tsx |
| (componente interno) | Renomear | UI atual vira `EmpresaLGPDView` |

---

## Fluxo por Papel

### super_admin
1. Acessa /lgpd
2. Vê lista de TODAS as empresas
3. Pode ver status de conformidade de cada uma
4. Pode gerar exportações judiciais para qualquer empresa
5. Vê todas as solicitações e logs de auditoria

### empresa_admin
1. Acessa /lgpd
2. Vê apenas dados da SUA empresa
3. Pode editar DPO e políticas de retenção
4. Atende solicitações dos SEUS tripulantes
5. Vê apenas logs de auditoria da sua empresa

### gerente_embarcacao
1. Acessa /lgpd
2. Vê apenas dados da empresa (somente leitura)
3. NÃO pode editar nada
4. NÃO vê aba de auditoria (apenas super_admin e empresa_admin)

---

## Resumo Visual

```text
SUPER ADMIN                    EMPRESA ADMIN / GERENTE
+-------------------+          +-------------------+
| Lista de Empresas |          | Dados Controlador |
| - Empresa A       |          | (sua empresa)     |
| - Empresa B       |          |                   |
| - Empresa C       |          | DPO Config        |
|                   |          | (editável/RO)     |
| + Exportação      |          |                   |
|   Judicial        |          | Retenção          |
+-------------------+          +-------------------+
```

---

## Seção Técnica

### Query para super_admin

```typescript
// Buscar empresas com configs LGPD e estatísticas
const { data: empresasWithLGPD } = await supabase
  .from("empresas")
  .select(`
    id, nome, cnpj, email, telefone, status,
    lgpd_config (
      dpo_nome, dpo_email, dpo_telefone,
      retencao_logs_meses,
      politica_privacidade_versao,
      termos_uso_versao
    )
  `)
  .order("nome");
```

### Indicador de Status LGPD

```typescript
function getLGPDStatus(empresa: EmpresaWithLGPD) {
  const config = empresa.lgpd_config;
  
  if (!config) return { status: 'nao_configurado', label: 'Não configurado', color: 'red' };
  if (!config.dpo_nome || !config.dpo_email) return { status: 'incompleto', label: 'DPO pendente', color: 'yellow' };
  if (config.retencao_logs_meses < 6) return { status: 'erro', label: 'Retenção inválida', color: 'red' };
  
  return { status: 'ok', label: 'Configurado', color: 'green' };
}
```

### RLS já está correto

As políticas RLS já permitem que:
- `super_admin` veja todos os registros
- `empresa_admin` veja apenas da sua empresa
- `gerente_embarcacao` veja apenas da empresa (via função helper)
