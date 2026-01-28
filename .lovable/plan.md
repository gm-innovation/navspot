

# Nova Arquitetura: Bootstrap Minimo + Configuracao via API

## Resumo da Mudanca

A arquitetura atual gera um script gigante (~1000+ linhas) que falha frequentemente no RouterOS v6 devido a limitacoes de parsing. A nova abordagem divide o trabalho em duas fases:

1. **Bootstrap Minimo**: Script pequeno (~80-100 linhas) que cria apenas a infraestrutura basica
2. **Configuracao via API**: Todas as regras, profiles, usuarios e firewall sao configurados incrementalmente via fila de acoes pendentes

## Fase 1: Script Bootstrap Minimo

### O que o Bootstrap faz (mantido):
- System identity
- Bridge1 + ports (ether2-5, wlan1-2)
- IP Address (gateway)
- IP Pool
- DHCP Server + Network
- DNS recursivo
- Hotspot Profile basico (sem rate-limit customizado)
- IP Binding (bypass admin)
- Hotspot Server
- Walled Garden MINIMO (apenas navspot.local e supabase.co)
- Walled Garden IP (DNS, DHCP, NTP, ICMP)
- Token file
- Script navspot-sync (simplificado)
- Script navspot-action-processor
- Scheduler

### O que sera REMOVIDO do Bootstrap (vai para API):
- User profiles customizados (perfis_velocidade)
- Usuarios (tripulantes)
- Walled Garden de blacklists
- Layer7 protocols
- Firewall filter rules de bloqueio
- Regras de acesso complexas

### Novo Fluxo Apos Bootstrap

```text
1. Usuario cola o script bootstrap no MikroTik
2. MikroTik executa e cria hotspot basico (funcional imediatamente)
3. Scheduler inicia sync a cada X minutos
4. Primeira sincronizacao:
   - Backend detecta hotspot "new" (sem profiles/users)
   - Backend enfileira acoes para criar:
     - User profiles
     - Usuarios
     - Walled garden rules
     - Firewall rules
5. MikroTik processa acoes na proxima sync
6. Configuracao completa em 2-3 ciclos de sync
```

---

## Arquivos a Modificar/Criar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar | Gerar apenas Bootstrap minimo (~100 linhas) |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Detectar hotspot "novo" e enfileirar configuracoes iniciais |
| `supabase/functions/mikrotik-config-update/index.ts` | Modificar | Adicionar tipos: `add_user_profile`, `add_walled_garden_rule` |
| `src/hooks/useMikrotikSync.ts` | Modificar | Adicionar funcao para enfileirar configuracao inicial |
| `src/services/mikrotikService.ts` | Modificar | Adicionar funcoes para novos tipos de acao |
| `src/pages/Hotspots.tsx` | Modificar | Adicionar indicador de "configuracao pendente" |

---

## Detalhes da Implementacao

### 1. Script Generator (Bootstrap)

**Novo tamanho estimado**: ~100 linhas (vs 1000+ atual)

```text
Header + Version
Bridge Infrastructure
Interface Detection
IP/Pool/DHCP/DNS
Hotspot Profile (basico)
IP Binding
Hotspot Server
Walled Garden (apenas sistema)
Walled Garden IP (DNS/DHCP/NTP/ICMP)
Token file
Sync script (simplificado)
Action processor
Health script
Schedulers
Final log
```

**Removido do Bootstrap**:
```text
- User profiles loop (perfis_velocidade)
- Tripulantes/users loop
- Blocked domains collection
- Walled garden reject rules
- Layer7 protocols
- Firewall block rules
- NAT (sera via acao se necessario)
```

### 2. Sync Function (Detectar Hotspot Novo)

Adicionar logica para detectar quando um hotspot faz a primeira sincronizacao e enfileirar a configuracao inicial:

```typescript
// Apos validar hotspot
if (hotspot.status === 'offline' && !hotspot.ultima_sincronizacao) {
  // Primeira sincronizacao - hotspot novo!
  await enqueueInitialConfiguration(supabase, hotspot, embarcacao);
}
```

A funcao `enqueueInitialConfiguration` vai:
1. Buscar perfis_velocidade da empresa
2. Buscar tripulantes ativos da embarcacao
3. Buscar regras de acesso ativas (blacklists)
4. Criar acoes pendentes para cada item

### 3. Novos Tipos de Acao

| Tipo | Payload | Comando MikroTik |
|------|---------|------------------|
| `add_user_profile` | `{name, rate_limit, shared_users, limit_bytes, session_timeout}` | `/ip hotspot user profile add` |
| `remove_user_profile` | `{name}` | `/ip hotspot user profile remove` |
| `update_user_profile_config` | `{name, rate_limit, ...}` | `/ip hotspot user profile set` |
| `add_walled_garden` | `{dst_host, action, comment}` | `/ip hotspot walled-garden add` |
| `remove_walled_garden` | `{dst_host}` | `/ip hotspot walled-garden remove` |
| `add_firewall_l7` | `{name, regexp}` | `/ip firewall layer7-protocol add` |
| `add_firewall_filter` | `{chain, layer7, action}` | `/ip firewall filter add` |

### 4. Action Processor (Atualizado)

O script `navspot-action-processor` no MikroTik precisa suportar os novos tipos:

```routeros
:if ($actionType = "add_user_profile") do={
  /ip hotspot user profile add name=$p1 rate-limit=$p2 shared-users=$p3
}
:if ($actionType = "add_walled_garden") do={
  /ip hotspot walled-garden add dst-host=$p1 action=$p2 comment=$p3
}
# etc...
```

### 5. Frontend (Indicador de Status)

Na pagina de Hotspots, mostrar status de configuracao:

| Status | Indicador |
|--------|-----------|
| `online` + sem acoes pendentes | Badge verde "Configurado" |
| `online` + acoes pendentes | Badge amarelo "Configurando..." |
| `offline` | Badge vermelho "Offline" |

---

## Vantagens da Nova Arquitetura

| Problema Atual | Solucao |
|----------------|---------|
| Script de 1000+ linhas nao parseia | Bootstrap de ~100 linhas |
| Erro de sintaxe em uma linha quebra tudo | Cada comando via API e independente |
| Debug dificil (qual linha falhou?) | API retorna sucesso/erro por acao |
| Mudancas exigem regenerar script | Mudancas sao incrementais |
| Usuario precisa colar script grande | Usuario cola 1x o bootstrap |
| Walled garden/firewall fixos | Dinamicos e editaveis |

---

## Fluxo de Dados

```text
                    +----------------+
                    |   Frontend     |
                    |  (Dashboard)   |
                    +-------+--------+
                            |
                            v
                    +-------+--------+
                    | mikrotik-      |
                    | config-update  | ---> acoes_pendentes
                    +----------------+
                            |
                            v
                    +-------+--------+
                    |   MikroTik     | <--- navspot-sync
                    |   RouterOS     |
                    +-------+--------+
                            |
                            v
                    +-------+--------+
                    | navspot-action |
                    |   processor    | ---> executa comandos
                    +----------------+
```

---

## Cronograma de Implementacao

1. **Fase 1A**: Simplificar script generator (apenas Bootstrap)
2. **Fase 1B**: Atualizar action processor para novos tipos
3. **Fase 2**: Modificar mikrotik-sync para enfileirar configuracao inicial
4. **Fase 3**: Atualizar frontend com indicadores de status
5. **Fase 4**: Testar ciclo completo (bootstrap -> sync -> configure)

---

## Secao Tecnica

### Script Bootstrap (Estrutura)

```routeros
# ============================================
# NAVSPOT Bootstrap Script
# Version: 4.0 - Minimal Bootstrap
# ============================================

# 1. System Identity
/system identity set name="..."

# 2. Bridge Infrastructure (~20 linhas)
/interface bridge
add name="bridge1" comment="navspot"
# ... ports

# 3. Interface Detection (~15 linhas)
:local targetIf "bridge1"
# ... detection logic

# 4. IP/Pool/DHCP (~15 linhas)
/ip address add ...
/ip pool add ...
/ip dhcp-server add ...

# 5. Hotspot (~15 linhas)
/ip hotspot profile add name="hsprof-..." (basico)
/ip hotspot add name="hs-..."

# 6. Walled Garden Sistema (~5 linhas)
/ip hotspot walled-garden add dst-host="navspot.local" action=allow
/ip hotspot walled-garden add dst-host="supabase.co" action=allow

# 7. Token + Scripts (~25 linhas)
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="..."

/system script add name="navspot-sync" source={...}
/system script add name="navspot-action-processor" source={...}

# 8. Scheduler (~5 linhas)
/system scheduler add name="navspot-sync-scheduler" ...

# TOTAL: ~100 linhas
```

### Tipos de Acao Expandidos

```typescript
type ActionType = 
  // Usuarios
  | 'create_user' 
  | 'remove_user' 
  | 'disable_user' 
  | 'enable_user'
  | 'update_password' 
  | 'update_user_profile'
  | 'kick_session'
  // Dispositivos
  | 'block_device' 
  | 'unblock_device' 
  | 'kick_device'
  // Profiles (NOVO)
  | 'add_user_profile' 
  | 'remove_user_profile' 
  | 'update_profile_config'
  // Walled Garden (NOVO)
  | 'add_walled_garden' 
  | 'remove_walled_garden'
  // Firewall (NOVO)
  | 'add_firewall_l7' 
  | 'add_firewall_filter' 
  | 'remove_firewall_rule'
```

### Payload Pipe-Delimited (Novos Tipos)

```text
# add_user_profile
id|add_user_profile|profileName|rateLimit|sharedUsers|limitBytes|sessionTimeout

# add_walled_garden
id|add_walled_garden|dstHost|action|comment

# add_firewall_l7
id|add_firewall_l7|protocolName|regexp|comment

# add_firewall_filter
id|add_firewall_filter|chain|layer7Protocol|action|comment
```

