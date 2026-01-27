
# Plano: Reestruturação do Painel LGPD - Responsabilidade Correta

## Entendimento do Problema

Você está **100% correto**. A implementação atual está equivocada no modelo de responsabilidade LGPD:

### Modelo Atual (INCORRETO)
```text
NAVSPOT = Controlador dos Dados ❌
           ↓
Empresas/Embarcações = Apenas usuários do sistema
```

### Modelo Correto (Como deveria ser)
```text
NAVSPOT = Operador (Processador) de Dados ✓
           ↓
Empresa = Controlador dos Dados ✓
           ↓
Embarcação = Unidade Operacional do Controlador
           ↓
Tripulante = Titular dos Dados
```

---

## Análise Jurídica

### Quem é quem na LGPD:

| Papel | Entidade | Responsabilidade |
|-------|----------|------------------|
| **Controlador** (Art. 5º, VI) | Empresa Cliente | Decide sobre o tratamento dos dados dos tripulantes |
| **Operador** (Art. 5º, VII) | NAVSPOT (nós) | Processa os dados em nome do controlador |
| **Encarregado/DPO** (Art. 41) | Indicado pela Empresa | Ponto de contato com titulares e ANPD |
| **Titular** | Tripulante | Pessoa natural a quem se referem os dados |

### Implicações:

1. **Cada empresa cliente** deve configurar seus próprios dados de controlador (razão social, CNPJ, DPO)
2. **NAVSPOT** não deve aparecer como controlador - apenas como plataforma
3. **Solicitações de titulares** devem ir para o DPO da empresa, não para NAVSPOT
4. **Ordens judiciais** para logs: a empresa solicita via sistema, NAVSPOT exporta

---

## Solução Proposta

### 1. Reestruturar a Tabela `lgpd_config`

A tabela já está correta (`empresa_id`), mas a interface faz parecer que estamos configurando dados "nossos". Precisamos:

- Remover campos duplicados que já existem em `empresas` (nome, CNPJ)
- Manter apenas campos específicos de LGPD (DPO, retenção, versões de políticas)
- Deixar claro que são dados DA EMPRESA cliente

### 2. Reorganizar a Interface

**Antes (confuso):**
```text
Configurações LGPD
├── Razão Social: [input]     ← Redundante, já existe em `empresas`
├── CNPJ: [input]             ← Redundante
├── DPO: [input]
└── Retenção: [input]
```

**Depois (correto):**
```text
Gestão LGPD da Empresa
├── INFORMAÇÕES DO CONTROLADOR (somente leitura, vem da tabela `empresas`)
│   ├── Razão Social: "Navegação ABC Ltda"
│   ├── CNPJ: "12.345.678/0001-90"
│   └── Endereço: "Rua das Embarcações, 123"
│
├── ENCARREGADO DE DADOS (DPO) - editável
│   ├── Nome: [input]
│   ├── Email: [input]
│   └── Telefone: [input]
│
└── POLÍTICAS DE RETENÇÃO
    └── Período de Logs: [input] meses
```

### 3. Restringir Acesso por Papel

| Papel | O que pode fazer |
|-------|------------------|
| `super_admin` | Ver todas as empresas, exportar logs judiciais |
| `empresa_admin` | Configurar DPO e políticas da SUA empresa |
| `gerente_embarcacao` | Apenas visualizar configurações (sem editar) |

### 4. Adicionar Funcionalidade de Exportação Judicial

Quando uma empresa precisa de logs por ordem judicial:

```text
1. empresa_admin solicita exportação
2. Sistema valida e gera pacote de logs
3. Logs são exportados com hash de integridade
4. Registro na tabela audit_logs
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/GestaoLGPD.tsx` | Reestruturar UI para mostrar dados da empresa como "somente leitura" e separar configurações de DPO |
| `src/hooks/useLGPD.ts` | Ajustar para buscar dados da empresa junto com lgpd_config |
| Migração SQL | Remover campos redundantes de lgpd_config (razao_social, cnpj, endereco_sede) |

### Migração de Banco

```sql
-- Remover campos redundantes (já existem em empresas)
ALTER TABLE lgpd_config DROP COLUMN IF EXISTS razao_social;
ALTER TABLE lgpd_config DROP COLUMN IF EXISTS cnpj;
ALTER TABLE lgpd_config DROP COLUMN IF EXISTS endereco_sede;
```

---

## Nova UI da Página LGPD

### Aba Configuração

```text
+------------------------------------------------------------------+
| GESTÃO LGPD                                                       |
| Configure a conformidade com a Lei Geral de Proteção de Dados    |
+------------------------------------------------------------------+

+--------------------------- CONTROLADOR ---------------------------+
|                                                                   |
| ℹ️ A empresa abaixo é a CONTROLADORA dos dados pessoais dos      |
|   tripulantes conforme Art. 5º, VI da LGPD.                      |
|                                                                   |
| Razão Social: Navegação ABC Ltda                                 |
| CNPJ: 12.345.678/0001-90                                         |
| Endereço: Rua das Embarcações, 123 - Santos/SP                   |
|                                                                   |
| [Editar dados da empresa →]  (link para /empresas)               |
+-------------------------------------------------------------------+

+------------------------ ENCARREGADO (DPO) ------------------------+
|                                                                   |
| 👤 Conforme Art. 41 da LGPD, indique o Encarregado de Dados:     |
|                                                                   |
| Nome:      [ Maria Silva                          ]              |
| Email:     [ dpo@navegacaoabc.com.br              ]              |
| Telefone:  [ (13) 99999-9999                      ]              |
+-------------------------------------------------------------------+

+---------------------- POLÍTICAS DE RETENÇÃO ----------------------+
|                                                                   |
| 📋 Período de Retenção de Logs                                   |
|                                                                   |
| [ 12 ] meses                                                     |
|                                                                   |
| ⚠️ Mínimo de 6 meses conforme Marco Civil da Internet (Art. 13)  |
+-------------------------------------------------------------------+

                                         [ Salvar Configurações ]
```

### Aba Solicitações (mantém igual)

A lógica de solicitações está correta - tripulantes solicitam, empresa_admin atende.

### Aba Auditoria (mantém igual)

Logs de auditoria já estão corretos.

### Nova Aba: Exportação Judicial

```text
+------------------------------------------------------------------+
| EXPORTAÇÃO DE LOGS PARA ORDEM JUDICIAL                           |
+------------------------------------------------------------------+
|                                                                   |
| ⚖️ Conforme Marco Civil da Internet (Art. 22), logs de conexão   |
|   podem ser solicitados mediante ordem judicial.                 |
|                                                                   |
| Tripulante:    [ Selecionar tripulante... ▼ ]                    |
| Período:       [ 01/01/2024 ] até [ 31/01/2024 ]                 |
| Nº Processo:   [ 1234567-89.2024.8.26.0001 ]                     |
|                                                                   |
|                              [ Exportar Logs (JSON assinado) ]   |
|                                                                   |
| ℹ️ O arquivo gerado incluirá:                                    |
|   • Dados de identificação do tripulante                         |
|   • Sessões WiFi (início, fim, IP, MAC)                         |
|   • Bytes transferidos                                           |
|   • Hash SHA-256 para integridade                               |
+------------------------------------------------------------------+
```

---

## Texto Explicativo na UI

Adicionar um card informativo no topo:

```text
+------------------------------------------------------------------+
| ℹ️ SOBRE ESTA SEÇÃO                                               |
+------------------------------------------------------------------+
| O NAVSPOT atua como OPERADOR de dados (Art. 5º, VII da LGPD),    |
| processando informações em nome da sua empresa.                   |
|                                                                   |
| Sua empresa é a CONTROLADORA (Art. 5º, VI) e deve:               |
| • Indicar um Encarregado de Dados (DPO)                          |
| • Responder às solicitações dos titulares (tripulantes)          |
| • Definir políticas de retenção compatíveis com o Marco Civil   |
+------------------------------------------------------------------+
```

---

## Resumo das Mudanças

1. **UI**: Mostrar dados da empresa como "somente leitura" (vindos da tabela `empresas`)
2. **UI**: Separar claramente "Dados do Controlador" de "Configurações Editáveis"
3. **UI**: Adicionar card explicativo sobre papéis LGPD
4. **UI**: Adicionar aba/seção de exportação judicial
5. **Banco**: Remover campos redundantes da tabela `lgpd_config`
6. **Hook**: Buscar dados da empresa junto com configurações LGPD
7. **Textos**: Deixar claro que a empresa é o controlador, não o NAVSPOT

---

## Seção Técnica

### Queries Atualizadas

```typescript
// Hook para buscar dados completos (empresa + lgpd_config)
export function useLGPDConfig() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["lgpd-config", user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return null;

      // Buscar dados da empresa (controlador)
      const { data: empresa, error: empresaError } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, email, telefone, endereco")
        .eq("id", user.empresa_id)
        .single();

      if (empresaError) throw empresaError;

      // Buscar configurações LGPD
      const { data: config, error: configError } = await supabase
        .from("lgpd_config")
        .select("*")
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();

      if (configError) throw configError;

      return {
        empresa, // Dados do controlador (somente leitura)
        config,  // Configurações editáveis
      };
    },
    enabled: !!user?.empresa_id,
  });
}
```

### Migração SQL

```sql
-- Remover campos redundantes de lgpd_config
-- (esses dados já existem na tabela empresas)
ALTER TABLE public.lgpd_config 
  DROP COLUMN IF EXISTS razao_social,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS endereco_sede;
```

---

## Consideração sobre Embarcações

Você mencionou que poderia haver configuração por embarcação. Isso faz sentido se:
- Diferentes embarcações têm diferentes DPOs
- Diferentes políticas de retenção por embarcação

Para simplificar, sugiro manter por empresa inicialmente. Se necessário, podemos adicionar granularidade por embarcação depois.
