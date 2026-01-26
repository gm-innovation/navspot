
# Gerenciamento de Dispositivos por MAC e Deteccao de Compartilhamento

## Resumo do Requisito

O sistema precisa de um controle granular de dispositivos por MAC address para:

1. **Seguranca**: Bloquear/desbloquear dispositivos individuais pelo MAC
2. **Prevencao de fraude**: Detectar quando um tripulante bloqueado tenta usar credenciais de outro em seu dispositivo ja registrado
3. **Equipamentos de embarcacao**: Cadastrar e gerenciar dispositivos da embarcacao (GPS, radar, cameras, etc.)
4. **Alerta de compartilhamento**: Gerar alerta quando um dispositivo ja registrado para um tripulante e usado por outro tripulante (potencial compartilhamento de credenciais)
5. **Gerenciamento**: Permitir que super_admin, empresa_admin e gerente_embarcacao bloqueiem/desbloqueiem dispositivos

## Arquitetura da Solucao

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      FLUXO DE DETECCAO E BLOQUEIO                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  MIKROTIK SYNC                                                                  │
│  ─────────────                                                                  │
│                                                                                 │
│  1. Tripulante B tenta conectar                                                 │
│     usando MAC AA:BB:CC:DD:EE:FF                                                │
│           │                                                                     │
│           ▼                                                                     │
│  ┌────────────────────────────────────────┐                                     │
│  │ Verificar: MAC ja registrado           │                                     │
│  │           para outro tripulante?       │                                     │
│  └────────────────────────────────────────┘                                     │
│           │                                                                     │
│     ┌─────┴─────┐                                                               │
│     │           │                                                               │
│   SIM          NAO                                                              │
│     │           │                                                               │
│     ▼           ▼                                                               │
│  ┌────────────────────────┐    ┌────────────────────────┐                       │
│  │ Gerar ALERTA           │    │ Registrar dispositivo  │                       │
│  │ "device_sharing"       │    │ para Tripulante B      │                       │
│  │ severidade: critical   │    │ autorizado: true       │                       │
│  └────────────────────────┘    └────────────────────────┘                       │
│           │                                                                     │
│           ▼                                                                     │
│  ┌────────────────────────────────────────┐                                     │
│  │ Verificar: Dispositivo bloqueado?      │                                     │
│  │            (autorizado = false)        │                                     │
│  └────────────────────────────────────────┘                                     │
│           │                                                                     │
│     ┌─────┴─────┐                                                               │
│     │           │                                                               │
│   SIM          NAO                                                              │
│     │           │                                                               │
│     ▼           ▼                                                               │
│  ┌────────────────────────┐    ┌────────────────────────┐                       │
│  │ Adicionar acao:        │    │ Conexao permitida      │                       │
│  │ "kick_device"          │    │                        │                       │
│  │ com razao do bloqueio  │    │                        │                       │
│  └────────────────────────┘    └────────────────────────┘                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Mudancas no Banco de Dados

### 1. Nova coluna em dispositivos_registrados

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `embarcacao_id` | UUID (nullable) | Para dispositivos de embarcacao (sem tripulante) |
| `bloqueio_motivo` | TEXT (nullable) | Motivo do bloqueio quando autorizado=false |
| `bloqueado_por` | UUID (nullable) | Usuario que bloqueou (FK para auth.users) |
| `bloqueado_at` | TIMESTAMP (nullable) | Data/hora do bloqueio |

### 2. Novo tipo de alerta

Adicionar ao sistema de alertas:

| tipo | severidade | Descricao |
|------|------------|-----------|
| `device_sharing` | critical | MAC usado por tripulante diferente do registrado |
| `blocked_device_attempt` | warning | Tentativa de conexao com dispositivo bloqueado |

## Componentes a Implementar

### 1. Pagina de Dispositivos Dedicada

**Arquivo:** `src/pages/Dispositivos.tsx`

Uma pagina central para gerenciar todos os dispositivos:
- Listar todos os dispositivos registrados (com filtros)
- Ver a qual tripulante/embarcacao pertence
- Bloquear/desbloquear com um clique
- Cadastrar dispositivos de embarcacao (sem vinculo a tripulante)
- Ver historico de uso e consumo

### 2. Atualizar Edge Function mikrotik-sync

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Adicionar logica para:
1. Verificar se MAC ja esta registrado para outro tripulante
2. Gerar alerta `device_sharing` se detectar compartilhamento
3. Verificar campo `autorizado` do dispositivo
4. Adicionar acao `kick_device` se dispositivo bloqueado
5. Incluir lista de MACs bloqueados na resposta

### 3. Hook para Gerenciamento de Dispositivos

**Arquivo:** `src/hooks/useDispositivosRegistrados.ts` (atualizar)

Adicionar:
- `useDispositivosAll()` - Listar todos dispositivos (com filtros)
- `useBlockDispositivo()` - Bloquear com motivo
- `useDispositivosByEmbarcacao()` - Dispositivos de embarcacao
- `useDispositivoHistory()` - Historico de sessoes

### 4. Componente de Bloqueio Rapido

Para usar na pagina de Alertas quando receber alerta de compartilhamento:
- Botao para bloquear dispositivo diretamente do alerta
- Opcao de bloquear o tripulante que compartilhou

## Interface da Pagina de Dispositivos

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Dispositivos                                        │
│  Gerencie todos os dispositivos cadastrados no sistema                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┐                            │
│  │  Total  │Autoriz. │Bloquead.│Tripul.  │Embarc.  │                            │
│  │   45    │   38    │    4    │   41    │    4    │                            │
│  └─────────┴─────────┴─────────┴─────────┴─────────┘                            │
│                                                                                 │
│  Filtros: [Todos ▼] [Embarcacao ▼] [Tripulante ▼] [Status ▼] [Buscar...]       │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │ Dispositivo        │ MAC               │ Vinculo       │ Status │ Acoes   │ │
│  ├───────────────────────────────────────────────────────────────────────────┤ │
│  │ iPhone de Joao     │ AA:BB:CC:DD:EE:FF │ Joao Silva    │ ✓      │ [···]   │ │
│  │ Notebook GPS       │ 11:22:33:44:55:66 │ Navio Alpha   │ ✓      │ [···]   │ │
│  │ Galaxy Suspeito    │ 00:11:22:33:44:55 │ --bloqueado-- │ ✗      │ [···]   │ │
│  │ Radar Principal    │ AA:11:BB:22:CC:33 │ Navio Beta    │ ✓      │ [···]   │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  [+ Novo Dispositivo]  [+ Equipamento de Embarcacao]                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Logica de Deteccao no mikrotik-sync

```typescript
// Pseudocodigo para deteccao de compartilhamento
for (const activeUser of payload.active_users) {
  // Verificar se MAC ja esta registrado para OUTRO tripulante
  const { data: existingDevice } = await supabase
    .from('dispositivos_registrados')
    .select('id, tripulante_id, autorizado, tripulante:tripulantes(nome, login_wifi)')
    .eq('mac_address', activeUser.mac)
    .maybeSingle()

  if (existingDevice) {
    // Dispositivo existe - verificar se pertence ao mesmo tripulante
    const currentTripulante = await getTripulanteByLogin(activeUser.user)
    
    if (existingDevice.tripulante_id !== currentTripulante.id) {
      // ALERTA: MAC registrado para outro tripulante!
      await createAlert({
        tipo: 'device_sharing',
        severidade: 'critical',
        mensagem: `Dispositivo ${activeUser.mac} registrado para ${existingDevice.tripulante.nome} ` +
                  `sendo usado por ${activeUser.user}`,
        tripulante_id: existingDevice.tripulante_id, // dono original
        hotspot_id: hotspot.id,
        embarcacao_id: hotspot.embarcacao_id,
        empresa_id: embarcacao?.empresa_id
      })
    }
    
    // Verificar se dispositivo esta bloqueado
    if (!existingDevice.autorizado) {
      // Adicionar acao para kickar o dispositivo
      kickActions.push({
        type: 'kick_device',
        payload: {
          mac: activeUser.mac,
          user: activeUser.user,
          reason: 'Dispositivo bloqueado pelo administrador'
        }
      })
      
      // Criar alerta de tentativa
      await createAlert({
        tipo: 'blocked_device_attempt',
        severidade: 'warning',
        mensagem: `Tentativa de conexao com dispositivo bloqueado: ${activeUser.mac}`
      })
    }
  }
}
```

## Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migracao SQL | Criar | Adicionar colunas embarcacao_id, bloqueio_motivo, bloqueado_por, bloqueado_at |
| `src/pages/Dispositivos.tsx` | Criar | Pagina de gerenciamento de dispositivos |
| `src/App.tsx` | Modificar | Adicionar rota /dispositivos |
| `src/components/AppSidebar.tsx` | Modificar | Adicionar item Dispositivos no menu |
| `src/hooks/useDispositivosRegistrados.ts` | Modificar | Adicionar hooks de listagem e bloqueio |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Adicionar deteccao de compartilhamento |
| `src/pages/Alertas.tsx` | Modificar | Adicionar botao de bloquear dispositivo em alertas device_sharing |

## Formulario de Novo Dispositivo de Embarcacao

```text
┌────────────────────────────────────────────────────┐
│        Novo Equipamento de Embarcacao              │
│                                                    │
│  MAC Address    [AA:BB:CC:DD:EE:FF       ]        │
│  Nome           [Radar Principal         ]        │
│  Tipo           [▼ Equipamento           ]        │
│  Embarcacao     [▼ Navio Alpha           ]        │
│  Descricao      [_________________________]       │
│                                                    │
│  [✓] Autorizado a conectar                        │
│                                                    │
│           [Cancelar]  [Cadastrar]                 │
└────────────────────────────────────────────────────┘
```

## Fluxo de Alerta e Acao

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        ALERTA: Compartilhamento Detectado                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ⚠️ CRITICO - device_sharing                                   há 2 minutos   │
│                                                                                 │
│  Dispositivo AA:BB:CC:DD:EE:FF (iPhone de Joao)                                │
│  registrado para Joao Silva sendo usado por Pedro Santos                       │
│                                                                                 │
│  Embarcacao: Navio Alpha                                                        │
│  Hotspot: Hotspot-Alpha-01                                                      │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ Acoes Disponiveis                                                       │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │ [Bloquear Dispositivo] - Impede este MAC de conectar                    │   │
│  │ [Bloquear Tripulante] - Bloqueia Pedro Santos (quem usou)               │   │
│  │ [Desconectar Agora] - Kicka a sessao atual                              │   │
│  │ [Ignorar] - Marcar como resolvido sem acao                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Ordem de Implementacao

1. **Migracao SQL**: Adicionar colunas a tabela dispositivos_registrados
2. **Hooks atualizados**: Adicionar funcionalidades de bloqueio e listagem global
3. **Pagina Dispositivos**: Criar UI de gerenciamento
4. **Rotas e Menu**: Adicionar ao App.tsx e AppSidebar.tsx
5. **mikrotik-sync**: Implementar deteccao de compartilhamento
6. **Alertas**: Adicionar acoes de bloqueio direto
7. **Testes**: Simular cenarios de compartilhamento

## Consideracoes de Seguranca

1. **RLS Policies**: Manter politicas existentes para dispositivos
2. **Auditoria**: Registrar quem bloqueou e quando (bloqueado_por, bloqueado_at)
3. **Limites de taxa**: Evitar flood de alertas para o mesmo MAC
4. **Notificacao**: Alertas criticos devem ser vistos por todos os niveis (super_admin, empresa_admin, gerente)

## Beneficios

| Funcionalidade | Beneficio |
|----------------|-----------|
| Bloqueio por MAC | Impede dispositivo especifico de conectar, mesmo com credenciais validas |
| Deteccao de compartilhamento | Identifica uso indevido de credenciais entre tripulantes |
| Equipamentos de embarcacao | Permite monitorar e controlar equipamentos de rede da embarcacao |
| Acoes rapidas no alerta | Reduz tempo de resposta a incidentes de seguranca |
| Historico de bloqueios | Auditoria completa de acoes de seguranca |
