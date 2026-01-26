

# Plano: Conformidade com Marco Civil da Internet e LGPD

## Diagnóstico Atual

Após análise detalhada do sistema NAVSPOT, identifiquei as seguintes lacunas de conformidade:

### Marco Civil da Internet (Lei 12.965/2014)

| Requisito | Status | Observação |
|-----------|--------|------------|
| Guarda de logs de acesso por 6 meses | **NÃO IMPLEMENTADO** | sessoes_wifi não tem política de retenção |
| Registro de IP e data/hora | **PARCIAL** | Existe ip_address e timestamps mas sem garantia de retenção |
| Disponibilização sob ordem judicial | **NÃO IMPLEMENTADO** | Falta sistema de exportação forense |

### LGPD (Lei 13.709/2018)

| Requisito | Status | Observação |
|-----------|--------|------------|
| Base legal para tratamento | **NÃO IMPLEMENTADO** | Falta consentimento explícito |
| Política de Privacidade | **NÃO EXISTE** | Nenhuma página ou modal |
| Termos de Uso | **NÃO EXISTE** | Nenhum aceite registrado |
| Direito de acesso | **NÃO IMPLEMENTADO** | Tripulante não consegue ver seus dados |
| Direito de exclusão | **NÃO IMPLEMENTADO** | Não existe processo de anonimização |
| Direito de retificação | **PARCIAL** | Edição existe mas sem portal do titular |
| Registro de consentimento | **NÃO EXISTE** | Nenhuma tabela de consentimentos |
| Minimização de dados | **PARCIAL** | CPF coletado mas não é obrigatório |
| Encarregado (DPO) | **NÃO EXISTE** | Sem informações de contato |
| Relatório de impacto (RIPD) | **NÃO EXISTE** | Sem documentação |

---

## Dados Pessoais Tratados

O sistema coleta e processa os seguintes dados pessoais de tripulantes:

```text
tripulantes:
  - nome (obrigatório)
  - email (opcional)
  - cpf (opcional)
  - cargo (opcional)
  - login_wifi / senha_wifi (credenciais)
  - bytes_consumidos (comportamento)
  - ultimo_login (comportamento)

sessoes_wifi:
  - mac_address (identificador único)
  - ip_address (identificador)
  - inicio / fim (comportamento)
  - bytes_in / bytes_out (comportamento)

dispositivos_registrados:
  - mac_address (identificador único)
  - bytes_consumidos (comportamento)

empresas:
  - cnpj, email, telefone, endereco (dados comerciais)
```

---

## Arquitetura da Solução

```text
+------------------------------------------------------------------+
|                    CONFORMIDADE LGPD/MARCO CIVIL                  |
+------------------------------------------------------------------+
|                                                                  |
|  [1] CONSENTIMENTO E TERMOS                                      |
|  +--------------------+  +--------------------+                  |
|  | Política Privacidade|  | Termos de Uso     |                  |
|  | /privacidade        |  | /termos           |                  |
|  +--------------------+  +--------------------+                  |
|                                                                  |
|  [2] REGISTRO DE CONSENTIMENTOS (tabela: consentimentos)         |
|  - tripulante_id, tipo, versao, aceito_em, ip_address            |
|                                                                  |
|  [3] PORTAL DO TITULAR                                           |
|  +--------------------------------------------------+            |
|  | Meus Dados | Histórico | Solicitar Exclusão      |            |
|  | Ver dados  | Sessions  | Anonimização            |            |
|  +--------------------------------------------------+            |
|                                                                  |
|  [4] GUARDA DE LOGS (Marco Civil)                                |
|  - Retenção mínima de 6 meses para sessoes_wifi                  |
|  - Exportação para ordem judicial                                |
|                                                                  |
|  [5] AUDITORIA                                                   |
|  - Tabela audit_logs para rastreabilidade                        |
|                                                                  |
+------------------------------------------------------------------+
```

---

## Parte 1: Tabelas para Conformidade

### 1.1 Tabela de Consentimentos

Registra cada aceite do titular de dados:

```sql
CREATE TABLE public.consentimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tripulante_id UUID REFERENCES tripulantes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'termos_uso', 'politica_privacidade', 'marketing'
  versao TEXT NOT NULL, -- 'v1.0', 'v1.1'
  aceito BOOLEAN NOT NULL,
  aceito_em TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_consentimentos_tripulante ON consentimentos(tripulante_id);
CREATE INDEX idx_consentimentos_tipo ON consentimentos(tipo, versao);
```

### 1.2 Tabela de Auditoria

Registra todas as ações no sistema (exigido pelo Marco Civil):

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- auth.users.id (admin/gerente) ou NULL para sistema
  tripulante_id UUID, -- tripulante afetado
  acao TEXT NOT NULL, -- 'create', 'update', 'delete', 'access', 'export'
  tabela TEXT NOT NULL, -- nome da tabela
  registro_id UUID, -- id do registro afetado
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_data ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_tripulante ON audit_logs(tripulante_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
```

### 1.3 Tabela de Solicitações LGPD

Para direitos de acesso, retificação e exclusão:

```sql
CREATE TABLE public.solicitacoes_lgpd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tripulante_id UUID REFERENCES tripulantes(id),
  tipo TEXT NOT NULL, -- 'acesso', 'retificacao', 'exclusao', 'portabilidade'
  status TEXT DEFAULT 'pendente', -- 'pendente', 'em_analise', 'concluida', 'recusada'
  descricao TEXT,
  resposta TEXT,
  atendido_por UUID, -- user_id do admin
  created_at TIMESTAMPTZ DEFAULT now(),
  atendido_em TIMESTAMPTZ,
  prazo_legal TIMESTAMPTZ -- 15 dias úteis pela LGPD
);
```

### 1.4 Configurações LGPD por Empresa

```sql
CREATE TABLE public.lgpd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE UNIQUE,
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  dpo_nome TEXT, -- Encarregado de Dados
  dpo_email TEXT,
  dpo_telefone TEXT,
  endereco_sede TEXT,
  politica_privacidade_versao TEXT DEFAULT 'v1.0',
  termos_uso_versao TEXT DEFAULT 'v1.0',
  retencao_logs_meses INTEGER DEFAULT 12, -- Mínimo 6 pelo Marco Civil
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Parte 2: Páginas de Termos e Privacidade

### 2.1 Página de Política de Privacidade

**Arquivo:** `src/pages/PoliticaPrivacidade.tsx`

Conteúdo obrigatório pela LGPD:
- Identificação do controlador (empresa)
- Dados do encarregado (DPO)
- Quais dados são coletados
- Finalidade do tratamento
- Base legal (consentimento/legítimo interesse)
- Compartilhamento com terceiros
- Período de retenção
- Direitos do titular
- Como exercer os direitos
- Canal de contato

### 2.2 Página de Termos de Uso

**Arquivo:** `src/pages/TermosUso.tsx`

Conteúdo para Marco Civil:
- Regras de uso do serviço WiFi
- Responsabilidades do usuário
- Proibições (acesso ilegal, etc.)
- Monitoramento de rede
- Guarda de registros (6 meses)

---

## Parte 3: Aceite de Termos no Cadastro

### 3.1 Modificar CompletarCadastro.tsx

Adicionar checkboxes obrigatórios antes de completar cadastro:

```text
+------------------------------------------+
| COMPLETE SEU CADASTRO                     |
+------------------------------------------+
| [Campos de dados pessoais]                |
|                                          |
| ☐ Li e concordo com os Termos de Uso     |
| ☐ Li e concordo com a Política de        |
|   Privacidade e autorizo o tratamento    |
|   dos meus dados pessoais                |
|                                          |
| [Completar Cadastro]                     |
+------------------------------------------+
```

### 3.2 Modificar Edge Function

Registrar consentimento na tabela `consentimentos` quando tripulante aceitar.

---

## Parte 4: Portal do Titular de Dados

### 4.1 Página Meus Dados

**Arquivo:** `src/pages/MeusDados.tsx`

Acessível via /meus-dados (autenticação do tripulante):

```text
+------------------------------------------+
| MEUS DADOS PESSOAIS                       |
+------------------------------------------+
| Nome: João Silva                         |
| Email: joao@email.com                    |
| CPF: 123.456.789-00                      |
| Cargo: Marinheiro                        |
|                                          |
| HISTÓRICO DE SESSÕES (últimos 30 dias)   |
| [Tabela com início, fim, consumo]        |
|                                          |
| MEUS CONSENTIMENTOS                      |
| ✓ Termos de Uso v1.0 (aceito em 01/01)   |
| ✓ Política de Privacidade v1.0           |
|                                          |
| EXERCER MEUS DIREITOS                    |
| [Solicitar Correção de Dados]            |
| [Solicitar Exclusão de Dados]            |
| [Exportar Meus Dados (JSON)]             |
+------------------------------------------+
```

### 4.2 Hook para Portal

**Arquivo:** `src/hooks/useMeusDados.ts`

```typescript
useMeusDadosTripulante()
- Busca dados pessoais do tripulante logado
- Lista histórico de sessões
- Lista consentimentos

useSolicitarExclusao()
- Cria solicitação na tabela solicitacoes_lgpd
- Envia notificação para admin

useExportarDados()
- Gera JSON com todos os dados do titular
- Registra ação na audit_logs
```

---

## Parte 5: Painel Admin de LGPD

### 5.1 Página de Gestão LGPD

**Arquivo:** `src/pages/GestaoLGPD.tsx`

Acessível apenas para super_admin e empresa_admin:

```text
+------------------------------------------+
| GESTÃO LGPD                               |
+------------------------------------------+
| [Config] [Solicitações] [Auditoria]       |
+------------------------------------------+
|                                          |
| CONFIGURAÇÕES DA EMPRESA                 |
| DPO: Maria Silva (dpo@empresa.com)       |
| Retenção de logs: 12 meses               |
| Versão Política: v1.0                    |
|                                          |
| SOLICITAÇÕES PENDENTES (3)               |
| [Tabela de solicitações_lgpd]            |
|                                          |
| CONSENTIMENTOS                           |
| Total: 156 tripulantes                   |
| Com aceite atual: 154 (98.7%)            |
|                                          |
+------------------------------------------+
```

### 5.2 Processo de Exclusão (Anonimização)

Quando admin aprova solicitação de exclusão:

```sql
-- Anonimizar dados pessoais (manter logs por 6 meses)
UPDATE tripulantes SET
  nome = 'ANONIMIZADO',
  email = NULL,
  cpf = NULL,
  cargo = NULL,
  login_wifi = 'deleted_' || id::text,
  senha_wifi = gen_random_uuid()::text,
  status = 'excluido'
WHERE id = $tripulante_id;

-- Anonimizar dispositivos
UPDATE dispositivos_registrados SET
  nome = 'ANONIMIZADO'
WHERE tripulante_id = $tripulante_id;

-- Logs são mantidos por 6 meses (Marco Civil)
-- Apenas marcar como anonimizado, não excluir
```

---

## Parte 6: Retenção de Logs (Marco Civil)

### 6.1 Política de Retenção

Criar job para limpeza automática após período legal:

```sql
-- Função para limpar logs antigos
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Sessões WiFi: manter 6 meses mínimo (configurável)
  DELETE FROM sessoes_wifi 
  WHERE created_at < now() - interval '12 months'
  AND NOT EXISTS (
    SELECT 1 FROM solicitacoes_lgpd 
    WHERE status = 'pendente' AND tipo = 'acesso'
  );
  
  -- Audit logs: manter 5 anos (prazo prescricional)
  DELETE FROM audit_logs
  WHERE created_at < now() - interval '5 years';
END;
$$ LANGUAGE plpgsql;
```

### 6.2 Exportação para Ordem Judicial

Edge function para gerar relatório forense:

**Arquivo:** `supabase/functions/export-logs-judicial/index.ts`

- Requer autenticação super_admin
- Gera JSON estruturado com:
  - Dados do tripulante
  - Todas as sessões WiFi
  - Endereços IP e MAC
  - Timestamps precisos
  - Assinatura hash para integridade

---

## Parte 7: Modificações no Formulário de Cadastro

### 7.1 CompletarCadastro.tsx

Adicionar:
- Checkboxes de aceite obrigatórios
- Links para páginas de termos/privacidade
- Registro de IP e user agent no consentimento

### 7.2 Edge Function tripulante-self-register

Modificar para:
- Registrar consentimentos na tabela
- Capturar IP do request
- Validar que aceites foram marcados

---

## Resumo de Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração `lgpd_compliance.sql` | Criar | Tabelas de conformidade |
| `src/pages/PoliticaPrivacidade.tsx` | Criar | Política de privacidade |
| `src/pages/TermosUso.tsx` | Criar | Termos de uso |
| `src/pages/MeusDados.tsx` | Criar | Portal do titular |
| `src/pages/GestaoLGPD.tsx` | Criar | Painel admin LGPD |
| `src/hooks/useMeusDados.ts` | Criar | Hooks do portal |
| `src/hooks/useLGPD.ts` | Criar | Hooks de gestão |
| `src/pages/CompletarCadastro.tsx` | Modificar | Adicionar aceites |
| `supabase/functions/tripulante-self-register/` | Modificar | Registrar consentimento |
| `supabase/functions/export-logs-judicial/` | Criar | Exportação forense |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar menu LGPD |
| `src/App.tsx` | Modificar | Adicionar rotas |

---

## Fluxo do Tripulante

```text
1. Acessa portal de cadastro
         ↓
2. Preenche dados pessoais
         ↓
3. Lê e marca aceite de Termos de Uso
         ↓
4. Lê e marca aceite de Política de Privacidade
         ↓
5. Clica em "Completar Cadastro"
         ↓
6. Sistema registra:
   - Dados pessoais na tabela tripulantes
   - Consentimentos na tabela consentimentos
   - Auditoria na tabela audit_logs
         ↓
7. Tripulante pode acessar /meus-dados a qualquer momento
```

---

## Notificações de Conformidade

### Alertas para Admin

Criar alertas automáticos:
- Solicitação LGPD pendente há mais de 10 dias (prazo legal: 15 dias úteis)
- Versão de política/termos desatualizada
- Tripulantes sem consentimento válido

---

## Ordem de Implementação

1. **Migração de banco** - Criar tabelas de conformidade
2. **Páginas estáticas** - Termos e Privacidade
3. **Modificar cadastro** - Adicionar aceites
4. **Portal do titular** - MeusDados
5. **Painel admin** - GestaoLGPD
6. **Edge functions** - Exportação e auditoria
7. **Integração** - Menu e rotas
8. **Jobs de limpeza** - Política de retenção

---

## Seção Técnica

### RLS para Tabelas LGPD

```sql
-- Consentimentos: tripulante vê apenas os seus
CREATE POLICY "Tripulante ve proprios consentimentos"
ON consentimentos FOR SELECT
USING (tripulante_id IN (
  SELECT id FROM tripulantes WHERE login_wifi = current_user
));

-- Admin vê todos da empresa
CREATE POLICY "Admin ve consentimentos da empresa"
ON consentimentos FOR SELECT
USING (has_role(auth.uid(), 'empresa_admin') AND ...);

-- Audit logs: apenas super_admin pode ver
CREATE POLICY "Super admin acesso audit_logs"
ON audit_logs FOR ALL
USING (has_role(auth.uid(), 'super_admin'));
```

### Modelo de Consentimento

```typescript
interface Consentimento {
  id: string;
  tripulante_id: string;
  tipo: 'termos_uso' | 'politica_privacidade' | 'marketing';
  versao: string;
  aceito: boolean;
  aceito_em: Date;
  ip_address: string;
  user_agent: string;
}
```

### Texto Legal Obrigatório

A Política de Privacidade deve incluir:
- Art. 9º da LGPD: informações sobre tratamento
- Art. 18 da LGPD: direitos do titular
- Art. 41 da LGPD: dados do encarregado (DPO)

Os Termos de Uso devem incluir:
- Art. 13 do Marco Civil: guarda de registros
- Art. 7º do Marco Civil: direitos do usuário

