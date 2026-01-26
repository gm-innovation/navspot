

# Cadastro Simplificado de Tripulantes com Auto-Completação

## Resumo do Requisito

O administrador/gerente quer cadastrar tripulantes de forma simplificada:
1. **No cadastro inicial**: apenas login, senha e perfil (pré-configurado ou personalizado)
2. **No primeiro login**: o próprio tripulante completa seus dados pessoais (nome, email, CPF, cargo)

Isso requer duas mudanças principais:
- Reformular o formulário de cadastro de tripulantes
- Criar uma página/portal para o tripulante completar seu perfil

## Análise da Estrutura Atual

### Tabela `tripulantes` (campos atuais)

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `nome` | SIM | Nome do tripulante |
| `login_wifi` | SIM | Login para WiFi |
| `senha_wifi` | SIM | Senha para WiFi |
| `embarcacao_id` | SIM | Embarcação vinculada |
| `perfil_id` | NAO | Perfil de velocidade |
| `email` | NAO | Email pessoal |
| `cpf` | NAO | CPF |
| `cargo` | NAO | Cargo na embarcação |
| `status` | SIM | ativo/bloqueado/inativo |

### Tabela `perfis_velocidade` (campos disponíveis)

| Campo | Descrição |
|-------|-----------|
| `velocidade_download` | Ex: "10M", "5M" |
| `velocidade_upload` | Ex: "5M", "2M" |
| `max_dispositivos` | Limite de dispositivos simultâneos |
| `limite_dados_mb` | Quota de dados (opcional) |
| `modo_acesso` | permitir_tudo / bloquear_tudo |
| `herdar_regras_empresa` | Herdar listas de acesso |

## Arquitetura da Solução

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DE CADASTRO                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ADMINISTRADOR/GERENTE                    TRIPULANTE                         │
│  ────────────────────                     ──────────                         │
│                                                                              │
│  1. Acessa "Novo Tripulante"                                                 │
│           │                                                                  │
│           ▼                                                                  │
│  ┌────────────────────────┐                                                  │
│  │ Formulário Simplificado│                                                  │
│  │ ────────────────────── │                                                  │
│  │ • Login WiFi           │                                                  │
│  │ • Senha WiFi           │                                                  │
│  │ • Embarcação           │                                                  │
│  │ • Modo: [Perfil | Personalizado] │                                        │
│  │   ├── Perfil: Select de perfis   │                                        │
│  │   └── Personalizado:             │                                        │
│  │       • Velocidades              │                                        │
│  │       • Max dispositivos         │                                        │
│  │       • Modo acesso              │                                        │
│  └────────────────────────┘                                                  │
│           │                                                                  │
│           ▼                                                                  │
│  Tripulante criado com                                                       │
│  nome = login_wifi                         2. Primeiro login WiFi            │
│  status = "pendente_cadastro"                      │                         │
│           │                                        ▼                         │
│           │                              ┌───────────────────────┐           │
│           └─ QR Code gerado ────────────▶│ Portal de Cadastro    │           │
│                                          │ (Captive Portal)      │           │
│                                          │ ───────────────────── │           │
│                                          │ • Nome completo       │           │
│                                          │ • Email               │           │
│                                          │ • CPF                 │           │
│                                          │ • Cargo               │           │
│                                          └───────────────────────┘           │
│                                                    │                         │
│                                                    ▼                         │
│                                          status = "ativo"                    │
│                                          Acesso liberado                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Mudanças Necessárias

### 1. Migração de Banco de Dados

Adicionar novo status e campo para saber se perfil é customizado:

```sql
-- Adicionar coluna para configurações personalizadas
ALTER TABLE tripulantes ADD COLUMN config_personalizada jsonb DEFAULT NULL;

-- Atualizar check constraint de status (se existir)
-- Novo status: 'pendente_cadastro' para tripulantes que ainda não completaram dados
```

O campo `config_personalizada` armazenará as configurações quando o admin optar por não usar um perfil pré-definido:
```json
{
  "velocidade_download": "10M",
  "velocidade_upload": "5M",
  "max_dispositivos": 2,
  "modo_acesso": "permitir_tudo"
}
```

### 2. Reformular TripulanteForm.tsx

**Antes (campos exigidos):**
- Nome, Login, Senha, Email, CPF, Cargo, Embarcação, Perfil, Status

**Depois (cadastro simplificado):**

| Campo | Obrigatório | Notas |
|-------|-------------|-------|
| Login WiFi | SIM | Auto-gerado ou manual |
| Senha WiFi | SIM | Auto-gerada |
| Embarcação | SIM | Select |
| Modo de Config | SIM | Radio: "Usar Perfil" ou "Personalizado" |
| Perfil | Condicional | Aparece se "Usar Perfil" |
| Velocidades | Condicional | Aparecem se "Personalizado" |
| Max Dispositivos | Condicional | Aparece se "Personalizado" |
| Modo Acesso | Condicional | Aparece se "Personalizado" |

O campo `nome` será preenchido automaticamente com o login e atualizado pelo tripulante depois.

### 3. Criar Portal de Auto-Cadastro

**Nova rota:** `/completar-cadastro/:token`

**Arquivo:** `src/pages/CompletarCadastro.tsx`

Esta página será acessada via QR Code ou link direto e permite ao tripulante:
1. Validar suas credenciais (login + senha)
2. Preencher dados pessoais (nome, email, CPF, cargo)
3. Aceitar termos de uso (opcional)

### 4. Edge Function para Validação

**Arquivo:** `supabase/functions/tripulante-self-register/index.ts`

Funcionalidades:
- Validar login e senha do tripulante
- Aceitar dados pessoais e atualizar registro
- Mudar status de `pendente_cadastro` para `ativo`
- Registrar `ultimo_login` e IP

### 5. Atualizar QRCodeModal

Modificar o modal de QR Code para incluir link para o portal de auto-cadastro quando o tripulante estiver com status `pendente_cadastro`.

## Detalhamento Técnico

### Estrutura do Formulário Reformulado

```typescript
interface TripulanteFormData {
  // Campos obrigatórios
  login_wifi: string;
  senha_wifi: string;
  embarcacao_id: string;
  
  // Modo de configuração
  modo_config: 'perfil' | 'personalizado';
  
  // Se modo = 'perfil'
  perfil_id?: string;
  
  // Se modo = 'personalizado'
  velocidade_download?: string;
  velocidade_upload?: string;
  max_dispositivos?: number;
  modo_acesso?: 'permitir_tudo' | 'bloquear_tudo';
}
```

### Fluxo de Dados ao Salvar

```typescript
// Se modo = 'perfil'
{
  nome: login_wifi,
  login_wifi,
  senha_wifi,
  embarcacao_id,
  perfil_id,
  status: 'pendente_cadastro',
  config_personalizada: null
}

// Se modo = 'personalizado'
{
  nome: login_wifi,
  login_wifi,
  senha_wifi,
  embarcacao_id,
  perfil_id: null,
  status: 'pendente_cadastro',
  config_personalizada: {
    velocidade_download,
    velocidade_upload,
    max_dispositivos,
    modo_acesso
  }
}
```

### Portal de Auto-Cadastro

```typescript
// Validação do tripulante
POST /tripulante-self-register
Body: {
  login: "joao.silva",
  senha: "abc123",
  nome: "João da Silva",
  email: "joao@email.com",
  cpf: "123.456.789-00",
  cargo: "Marinheiro"
}

// Resposta sucesso
{
  success: true,
  message: "Cadastro completado com sucesso"
}
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migração SQL | Criar | Adicionar `config_personalizada` e permitir status `pendente_cadastro` |
| `src/components/forms/TripulanteForm.tsx` | Modificar | Formulário simplificado com toggle perfil/personalizado |
| `src/pages/CompletarCadastro.tsx` | Criar | Portal público de auto-cadastro |
| `src/App.tsx` | Modificar | Adicionar rota `/completar-cadastro/:token` |
| `supabase/functions/tripulante-self-register/index.ts` | Criar | Validação e atualização do tripulante |
| `supabase/config.toml` | Modificar | Registrar nova edge function |
| `src/components/modals/QRCodeModal.tsx` | Modificar | Incluir link para portal quando pendente |

## Considerações de Segurança

1. **Validação de Credenciais**: O portal de auto-cadastro exige login + senha para validar identidade
2. **Rate Limiting**: Limitar tentativas de cadastro para evitar brute-force
3. **Token Único**: Opcionalmente, gerar token único por tripulante para o link do portal
4. **RLS**: Manter políticas RLS para proteger dados entre empresas/embarcações

## Interface do Formulário Simplificado

```text
┌────────────────────────────────────────────────────┐
│               Novo Tripulante                       │
│                                                    │
│  Credenciais WiFi                                  │
│  ──────────────────────────────────────────────── │
│  Login WiFi    [joao.silva          ] [Auto]      │
│  Senha WiFi    [********            ] [Gerar]     │
│                                                    │
│  Embarcação                                        │
│  ──────────────────────────────────────────────── │
│  [▼ Selecione a embarcação                      ] │
│                                                    │
│  Configuração de Acesso                           │
│  ──────────────────────────────────────────────── │
│  (●) Usar Perfil Pré-configurado                  │
│  ( ) Configuração Personalizada                   │
│                                                    │
│  Perfil                                           │
│  [▼ Comandante (10M/5M) - 3 disp                ] │
│                                                    │
│  ℹ️ Os dados pessoais (nome, email, CPF) serão   │
│     preenchidos pelo tripulante no primeiro       │
│     acesso via QR Code.                           │
│                                                    │
│           [Cancelar]  [Cadastrar]                 │
└────────────────────────────────────────────────────┘
```

## Ordem de Implementação

1. **Migração**: Adicionar coluna `config_personalizada` à tabela
2. **TripulanteForm**: Reformular com toggle perfil/personalizado
3. **Edge Function**: Criar função de auto-registro
4. **CompletarCadastro**: Criar página pública do portal
5. **Rotas**: Adicionar rota no App.tsx
6. **QRCodeModal**: Atualizar para mostrar link do portal
7. **Testes**: Validar fluxo completo

