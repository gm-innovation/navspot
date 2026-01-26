
# Plano Completo: Sistema NAVSPOT com Integração MikroTik

## Resumo Executivo

Este plano implementa um sistema completo de gerenciamento de hotspots WiFi marítimos, com integração direta com roteadores MikroTik. A solução utiliza uma **arquitetura Pull** otimizada para ambientes com conectividade intermitente (Starlink, satélite), onde o roteador inicia as conexões com o NAVSPOT, eliminando a necessidade de IP público fixo.

---

## Arquitetura da Solucao

```text
+------------------+     +------------------+     +------------------+
|     NAVSPOT      |     |   Lovable Cloud  |     |    MikroTik      |
|   (Frontend)     |<--->|  (Edge Functions)|<----|   (Roteador)     |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        | Administrador          | API REST               | Pull a cada
        | gerencia usuarios      | + Banco de Dados       | 1-5 minutos
        | e visualiza dados      |                        |
        |                        | Armazena acoes         | Executa acoes
        |                        | pendentes              | localmente
        +------------------------+------------------------+
                                 |
                    +------------+------------+
                    |                         |
              +-----v-----+           +-------v-------+
              |  Supabase |           | Fila de Acoes |
              |  Database |           |   Pendentes   |
              +-----------+           +---------------+
```

**Fluxo de Comunicacao:**

1. Administrador realiza acao no NAVSPOT (ex: bloquear usuario)
2. Acao e salva na tabela `acoes_pendentes` com status "pendente"
3. MikroTik faz POST para Edge Function a cada X minutos (Pull)
4. Edge Function retorna acoes pendentes para o MikroTik executar
5. MikroTik executa e envia confirmacao de volta
6. Edge Function atualiza status para "executado"

---

## Fase 1: Estrutura do Banco de Dados

### 1.1 Enum de Roles

```sql
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'empresa_admin', 
  'gerente_embarcacao'
);
```

### 1.2 Tabelas Principais

**empresas** - Empresas cliente do NAVSPOT
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| nome | TEXT | Nome da empresa |
| cnpj | TEXT (UNIQUE) | CNPJ da empresa |
| email | TEXT | Email de contato |
| telefone | TEXT | Telefone |
| endereco | TEXT | Endereco completo |
| status | TEXT | ativo/inativo |
| created_at | TIMESTAMPTZ | Data de criacao |
| updated_at | TIMESTAMPTZ | Data de atualizacao |

**embarcacoes** - Embarcacoes cadastradas
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| empresa_id | UUID (FK) | Referencia a empresa |
| nome | TEXT | Nome da embarcacao |
| tipo | TEXT | navio, lancha, iate, etc |
| responsavel_nome | TEXT | Nome do responsavel |
| responsavel_email | TEXT | Email do responsavel |
| localizacao | TEXT | Localizacao atual |
| status | TEXT | ativo/inativo |
| created_at | TIMESTAMPTZ | Data de criacao |
| updated_at | TIMESTAMPTZ | Data de atualizacao |

**hotspots** - Roteadores MikroTik
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| embarcacao_id | UUID (FK) | Referencia a embarcacao |
| nome | TEXT | Nome do hotspot |
| interface_wifi | TEXT | Interface WiFi (wlan1, wlan2) |
| rede | TEXT | Rede do hotspot (192.168.88.0/24) |
| sync_token | TEXT (UNIQUE) | Token seguro para sincronizacao |
| sync_interval_minutes | INTEGER | Intervalo de sync (default 5) |
| status | TEXT | online/offline/alerta |
| max_usuarios | INTEGER | Limite de usuarios |
| ultima_sincronizacao | TIMESTAMPTZ | Ultima comunicacao |
| script_gerado | TEXT | Script RSC gerado |
| script_versao | INTEGER | Versao do script |
| created_at | TIMESTAMPTZ | Data de criacao |
| updated_at | TIMESTAMPTZ | Data de atualizacao |

**perfis_velocidade** - Perfis de banda/quota
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| empresa_id | UUID (FK) | Referencia a empresa |
| nome | TEXT | comandante, oficiais, tripulacao |
| velocidade_download | TEXT | "10M", "5M", "2M" |
| velocidade_upload | TEXT | "5M", "2M", "1M" |
| limite_dados_mb | INTEGER | Limite em MB (null = ilimitado) |
| prioridade | INTEGER | 1-8 para QoS |
| session_timeout_minutos | INTEGER | Tempo maximo de sessao |
| descricao | TEXT | Descricao do perfil |
| created_at | TIMESTAMPTZ | Data de criacao |

**tripulantes** - Usuarios do WiFi
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| embarcacao_id | UUID (FK) | Referencia a embarcacao |
| perfil_id | UUID (FK) | Referencia ao perfil de velocidade |
| nome | TEXT | Nome completo |
| login_wifi | TEXT (UNIQUE) | Login para o hotspot |
| senha_wifi | TEXT | Senha (hash) |
| email | TEXT | Email |
| cpf | TEXT | CPF (parcialmente oculto) |
| cargo | TEXT | Cargo na embarcacao |
| status | TEXT | ativo/bloqueado/inativo |
| ultimo_login | TIMESTAMPTZ | Ultimo acesso WiFi |
| bytes_consumidos | BIGINT | Total de bytes consumidos |
| created_at | TIMESTAMPTZ | Data de criacao |
| updated_at | TIMESTAMPTZ | Data de atualizacao |

**sessoes_wifi** - Historico de conexoes
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| tripulante_id | UUID (FK) | Referencia ao tripulante |
| hotspot_id | UUID (FK) | Referencia ao hotspot |
| mac_address | TEXT | MAC do dispositivo |
| ip_address | INET | IP atribuido |
| inicio | TIMESTAMPTZ | Inicio da sessao |
| fim | TIMESTAMPTZ | Fim da sessao (null se ativa) |
| bytes_in | BIGINT | Bytes recebidos |
| bytes_out | BIGINT | Bytes enviados |
| status | TEXT | ativa/finalizada/forçada |
| created_at | TIMESTAMPTZ | Data de criacao |

**acoes_pendentes** - Fila de comandos para MikroTik
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| hotspot_id | UUID (FK) | Referencia ao hotspot |
| tipo | TEXT | disable_user, enable_user, kick_session, update_password, update_profile, create_user, delete_user |
| payload | JSONB | Dados da acao (ex: {"login": "joao", "disabled": true}) |
| status | TEXT | pendente/executado/erro |
| tentativas | INTEGER | Numero de tentativas |
| erro_mensagem | TEXT | Mensagem de erro se falhar |
| created_at | TIMESTAMPTZ | Data de criacao |
| executed_at | TIMESTAMPTZ | Data de execucao |

**alertas** - Sistema de alertas
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| empresa_id | UUID (FK) | Referencia a empresa |
| embarcacao_id | UUID (FK) | Referencia a embarcacao |
| hotspot_id | UUID (FK) | Referencia ao hotspot |
| tripulante_id | UUID (FK) | Referencia ao tripulante |
| tipo | TEXT | offline, limite_usuarios, limite_dados, sinal_fraco |
| mensagem | TEXT | Descricao do alerta |
| severidade | TEXT | info/warning/critical |
| resolvido | BOOLEAN | Se foi resolvido |
| resolvido_at | TIMESTAMPTZ | Data de resolucao |
| created_at | TIMESTAMPTZ | Data de criacao |

**user_roles** - Roles dos usuarios do sistema
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| user_id | UUID (FK) | Referencia ao auth.users |
| role | app_role | Role do usuario |
| empresa_id | UUID (FK) | Empresa (para empresa_admin) |
| embarcacao_id | UUID (FK) | Embarcacao (para gerente) |
| created_at | TIMESTAMPTZ | Data de criacao |

### 1.3 Funcao de Seguranca (Security Definer)

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;
```

### 1.4 Politicas RLS

**Exemplo para tabela `empresas`:**
- Super Admin: SELECT, INSERT, UPDATE, DELETE em todas
- Empresa Admin: SELECT apenas da sua empresa
- Gerente: Sem acesso

**Exemplo para tabela `tripulantes`:**
- Super Admin: Acesso total
- Empresa Admin: CRUD apenas tripulantes da sua empresa
- Gerente: CRUD apenas tripulantes da sua embarcacao

---

## Fase 2: Autenticacao Real

### 2.1 Substituir Mock por Supabase Auth

- Remover usuarios mockados do `AuthContext.tsx`
- Implementar `supabase.auth.signInWithPassword()` no login
- Implementar `supabase.auth.signUp()` para registro
- Usar `supabase.auth.onAuthStateChange()` para persistencia
- Buscar role do usuario na tabela `user_roles` apos login
- Configurar auto-confirm de email no Lovable Cloud

### 2.2 Fluxo de Autenticacao

1. Usuario faz login com email/senha
2. Supabase Auth valida credenciais
3. Sistema busca role na tabela `user_roles`
4. AuthContext armazena user + role
5. Sidebar e rotas filtram baseado no role

---

## Fase 3: Edge Functions

### 3.1 mikrotik-sync (Principal)

**Endpoint:** POST /mikrotik-sync

**Responsabilidades:**
1. Receber heartbeat do MikroTik (confirma que esta online)
2. Receber lista de usuarios ativos e consumo
3. Retornar acoes pendentes para execucao
4. Atualizar status do hotspot
5. Gerar alertas automaticos (offline, limite, etc)

**Payload de Entrada (do MikroTik):**
```json
{
  "sync_token": "token-unico-do-hotspot",
  "active_users": [
    {
      "user": "joao.silva",
      "mac": "AA:BB:CC:DD:EE:FF",
      "uptime": "2h30m",
      "bytes_in": 1234567890,
      "bytes_out": 987654321
    }
  ],
  "executed_actions": ["action-uuid-1", "action-uuid-2"]
}
```

**Payload de Saida (para MikroTik):**
```json
{
  "success": true,
  "pending_actions": [
    {
      "id": "action-uuid-3",
      "type": "disable_user",
      "payload": {"user": "pedro.costa"}
    },
    {
      "id": "action-uuid-4",
      "type": "kick_session",
      "payload": {"user": "maria.santos"}
    }
  ]
}
```

### 3.2 mikrotik-script-generator

**Endpoint:** POST /mikrotik-script-generator

**Responsabilidades:**
1. Receber ID do hotspot
2. Buscar configuracoes e perfis no banco
3. Gerar script RSC completo para MikroTik
4. Incluir script de sync com URL e token

**Script Gerado Inclui:**
- Configuracao do servidor Hotspot
- Pool de IPs e DHCP
- Perfis de usuario com rate-limit e limit-bytes-total
- Script de sincronizacao agendado
- Walled Garden para dominios NAVSPOT

### 3.3 Detalhes Tecnicos

- Todas as Edge Functions usam CORS headers
- Validacao de JWT para endpoints administrativos
- Validacao de sync_token para endpoints do MikroTik
- Logs detalhados para debugging
- Tratamento de erros com mensagens claras

---

## Fase 4: Interface do Usuario

### 4.1 Pagina de Hotspots (Atualizada)

**Novo Fluxo de Cadastro:**
1. Clicar em "Novo Hotspot"
2. Preencher formulario (nome, embarcacao, interface, rede)
3. Selecionar perfis de velocidade a aplicar
4. Salvar - sistema gera sync_token unico
5. Modal exibe script RSC gerado
6. Opcoes: "Copiar Script" ou "Download .rsc"
7. Instrucoes de como aplicar no MikroTik

**Novos Componentes:**
- `HotspotForm.tsx` - Formulario de cadastro/edicao
- `ScriptModal.tsx` - Exibicao do script gerado
- `ActiveUsersTable.tsx` - Usuarios ativos em tempo real
- `HotspotStatusCard.tsx` - Status detalhado do hotspot

### 4.2 Pagina de Tripulantes (Atualizada)

**Funcionalidades:**
- CRUD completo com dados reais do banco
- Selecao de perfil de velocidade
- Geracao de credenciais WiFi
- Botoes de acao rapida: Bloquear, Kick, Resetar Senha
- Indicador de status da acao (pendente/executado)
- QR Code com credenciais para compartilhar

**Novos Componentes:**
- `TripulanteForm.tsx` - Formulario de cadastro/edicao
- `CredentialsCard.tsx` - Exibicao de login/senha
- `QRCodeWifi.tsx` - QR Code com credenciais
- `ActionStatusBadge.tsx` - Status de acoes pendentes

### 4.3 Pagina de Embarcacoes (Atualizada)

**Funcionalidades:**
- CRUD completo com dados reais
- Visualizacao de hotspots vinculados
- Contagem de tripulantes
- Metricas de consumo agregadas

### 4.4 Nova Pagina: Perfis de Velocidade

**Funcionalidades:**
- CRUD de perfis por empresa
- Definir velocidade download/upload
- Definir limite de dados (quota)
- Definir prioridade (QoS)
- Visualizar quantos tripulantes usam cada perfil

### 4.5 Dashboards Atualizados

**Super Admin:**
- Total de empresas, embarcacoes, hotspots
- Hotspots online/offline em tempo real
- Alertas criticos do sistema
- Consumo global de dados

**Empresa Admin:**
- Hotspots da empresa
- Tripulantes ativos
- Consumo por embarcacao
- Alertas da empresa

**Gerente Embarcacao:**
- Status do(s) hotspot(s) da embarcacao
- Tripulantes conectados agora
- Acoes pendentes
- Consumo individual dos tripulantes

---

## Fase 5: Hooks e Servicos

### 5.1 Novos Hooks

- `useEmpresas.ts` - CRUD de empresas
- `useEmbarcacoes.ts` - CRUD de embarcacoes
- `useHotspots.ts` - CRUD de hotspots + geracao de script
- `useTripulantes.ts` - CRUD de tripulantes + acoes
- `usePerfisVelocidade.ts` - CRUD de perfis
- `useSessoesWifi.ts` - Historico de sessoes
- `useAcoesPendentes.ts` - Fila de acoes
- `useAlertas.ts` - Sistema de alertas
- `useUserRole.ts` - Buscar role do usuario

### 5.2 Servicos

- `mikrotikService.ts` - Funcoes para interagir com Edge Functions
- `actionQueue.ts` - Gerenciar fila de acoes pendentes

---

## Fase 6: Seguranca

### 6.1 Banco de Dados
- RLS habilitado em todas as tabelas
- Funcao `has_role()` com SECURITY DEFINER
- Roles armazenados em tabela separada (nao no profile)
- Tokens de sync criptografados

### 6.2 Edge Functions
- Validacao de JWT para endpoints admin
- Validacao de sync_token para endpoints MikroTik
- Rate limiting por hotspot
- Logs de auditoria

### 6.3 Frontend
- Rotas protegidas por role
- Sidebar filtrada por permissao
- Validacao de formularios com Zod

---

## Ordem de Implementacao

### Sprint 1: Fundacao (Estimativa: 1-2 dias)
1. Criar todas as tabelas no banco de dados
2. Configurar RLS policies
3. Criar funcao `has_role()` e `get_user_empresa_id()`
4. Migrar autenticacao de mock para Supabase Auth real
5. Criar tabela `user_roles` e popular com usuarios iniciais

### Sprint 2: Backend (Estimativa: 2-3 dias)
6. Criar Edge Function `mikrotik-sync`
7. Criar Edge Function `mikrotik-script-generator`
8. Testar endpoints com dados de exemplo
9. Implementar sistema de alertas automaticos

### Sprint 3: Frontend - CRUD (Estimativa: 2-3 dias)
10. Criar hooks para todas as entidades
11. Atualizar pagina de Embarcacoes com CRUD real
12. Atualizar pagina de Hotspots com CRUD real + modal de script
13. Atualizar pagina de Tripulantes com CRUD real + acoes

### Sprint 4: Frontend - Avancado (Estimativa: 2 dias)
14. Criar pagina de Perfis de Velocidade
15. Implementar botoes de acao (Bloquear, Kick)
16. Adicionar indicadores de status de acoes pendentes
17. Atualizar dashboards com dados reais

### Sprint 5: Polish (Estimativa: 1-2 dias)
18. Implementar QR Code para credenciais
19. Adicionar realtime para atualizacoes automaticas
20. Melhorar UX com loading states e feedback
21. Testes e ajustes finais

---

## Consideracoes Finais

### Compatibilidade MikroTik
- Scripts compativeis com RouterOS 6.x e 7.x
- Usa `/tool fetch` disponivel em todas as versoes
- Nao depende de recursos especificos de versao

### Resiliencia Maritima
- Arquitetura Pull funciona com Starlink e satelite
- Usuarios salvos localmente no MikroTik (funciona offline)
- Sincronizacao ocorre quando ha conexao
- Fila de acoes garante que comandos nao se perdem

### Escalabilidade
- Cada empresa isolada por RLS
- Hotspots independentes entre si
- Edge Functions stateless e escalaveis

### Sem Dependencias Externas
- Nao precisa de RADIUS
- Nao precisa de OpenWISP
- Nao precisa de IP publico fixo
- Nao precisa de VPN (opcional para real-time)
