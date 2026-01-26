

# Correções de Interface e Modelo de Dados

## Pontos Identificados

O usuário apontou três problemas nas interfaces atuais:

### 1. Formulário de Novo Equipamento de Embarcação
Falta a opção de **Autorizado** (liberar/bloquear) no momento do cadastro. Atualmente o campo está fixo como `autorizado: true`.

### 2. Separação entre Hotspots e Embarcações
O menu mostra "Hotspots" e "Embarcações" separadamente, mas o usuário diz que **cada embarcação É um hotspot**. Isso sugere que a relação deveria ser 1:1, não que uma embarcação pode ter múltiplos hotspots.

### 3. Formulário de Embarcação
- **"Herdar da empresa"**: Confuso para o usuário. O fuso horário da embarcação pode ser diferente do da empresa.
- **"Localização"**: Não faz sentido ter um campo de localização estática para embarcações que navegam.

## Mudanças Propostas

### 1. Adicionar Switch de Autorização no Formulário de Dispositivo

Modificar `src/pages/Dispositivos.tsx`:
- Adicionar um Switch para "Autorizado a conectar" no formulário de novo equipamento
- Permitir que o admin já cadastre o dispositivo bloqueado se necessário

```text
┌────────────────────────────────────────────────────┐
│        Novo Equipamento de Embarcação              │
│                                                    │
│  MAC Address *   [AA:BB:CC:DD:EE:FF       ]       │
│  Nome            [Radar Principal         ]       │
│  Tipo            [▼ Equipamento           ]       │
│  Embarcação *    [▼ Navio Alpha           ]       │
│                                                    │
│  Autorizado      [====●] Sim                      │
│                                                    │
│           [Cancelar]  [Cadastrar]                 │
└────────────────────────────────────────────────────┘
```

### 2. Unificar Hotspot e Embarcação (Relação 1:1)

Dado que **cada embarcação é um hotspot**, faz mais sentido:

**Opção A - Manter separado mas simplificar:**
- Remover "Hotspots" do menu principal
- Ao criar/editar uma embarcação, automaticamente criar/atualizar o hotspot vinculado
- Mostrar as configurações do hotspot dentro da página de embarcações (em uma aba ou seção)

**Opção B - Merge completo:**
- Mover as colunas técnicas do hotspot (interface_wifi, rede, sync_token, etc.) para dentro de embarcações
- Eliminar a tabela hotspots

Recomendação: **Opção A** - mantém a separação no banco para flexibilidade futura, mas na interface o usuário gerencia tudo como "Embarcação" com uma aba de "Configurações de Rede".

### 3. Corrigir Formulário de Embarcação

**Remover:**
- Campo "Localização" (não faz sentido para embarcações em movimento)

**Melhorar "Fuso Horário":**
- Mudar o texto "Herdar da empresa" para algo mais claro
- Explicar que é o fuso **predominante** onde a embarcação opera
- Adicionar tooltip explicativo

```text
┌────────────────────────────────────────────────────┐
│               Editar Embarcação                    │
│                                                    │
│  Dados Gerais                                      │
│  ──────────────────────────────────────────────── │
│  Nome            [Navio Alpha             ]       │
│  Tipo            [▼ Navio                 ]       │
│  Empresa         [▼ Empresa ABC           ]       │
│  Responsável     [João Silva              ]       │
│  Email           [joao@empresa.com        ]       │
│  Status          [▼ Ativo                 ]       │
│                                                    │
│  Fuso Horário Predominante                        │
│  ──────────────────────────────────────────────── │
│  [▼ America/Sao_Paulo (UTC-3)             ]       │
│  ℹ️ Fuso onde a embarcação opera na maior parte  │
│     do tempo. Afeta a renovação de quotas.        │
│                                                    │
│  Configurações de Rede (Hotspot)                  │
│  ──────────────────────────────────────────────── │
│  Interface WiFi  [▼ wlan1                 ]       │
│  Rede            [192.168.88.0/24         ]       │
│  Max Usuários    [50                      ]       │
│  Intervalo Sync  [5                       ] min   │
│                                                    │
│           [Cancelar]  [Salvar]                    │
└────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Dispositivos.tsx` | Adicionar Switch de autorização no form |
| `src/components/forms/EmbarcacaoForm.tsx` | Remover "Localização", melhorar texto do fuso, integrar campos de hotspot |
| `src/components/AppSidebar.tsx` | Remover "Hotspots" do menu (será parte de Embarcações) |
| `src/pages/Embarcacoes.tsx` | Modificar para gerenciar hotspot junto com embarcação |
| `src/hooks/useEmbarcacoes.ts` | Adicionar lógica para criar/atualizar hotspot automaticamente |
| `src/App.tsx` | Remover rota `/hotspots` ou redirecionar para `/embarcacoes` |

## Fluxo Simplificado

```text
ANTES:
Embarcações ──────► Hotspots
   (menu)            (menu separado)
     │                    │
     ▼                    ▼
 Cadastrar           Configurar
 embarcação          hotspot

DEPOIS:
Embarcações
   (menu único)
     │
     ▼
 Cadastrar/Editar embarcação
   ├── Dados gerais
   ├── Fuso horário
   └── Config. de rede (hotspot)
        ├── Interface WiFi
        ├── Rede
        └── Sync interval
```

## Benefícios

| Mudança | Benefício |
|---------|-----------|
| Switch de autorização | Admin pode cadastrar dispositivo já bloqueado |
| Unificar Hotspot+Embarcação | Interface mais simples e intuitiva |
| Remover localização | Remove campo que não faz sentido |
| Melhorar texto do fuso | Deixa claro que é o fuso predominante |
| Tooltip explicativo | Ajuda o usuário a entender o impacto do fuso |

## Ordem de Implementação

1. **Dispositivos**: Adicionar Switch de autorização
2. **EmbarcacaoForm**: Remover localização, melhorar fuso, adicionar campos de hotspot
3. **useEmbarcacoes**: Criar hook para gerenciar embarcação + hotspot juntos
4. **Sidebar/Rotas**: Remover menu e rota de Hotspots
5. **Embarcacoes**: Adaptar página para o novo fluxo

