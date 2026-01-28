

# Correções Críticas no MikroTik Script Generator

## Resumo

Este plano corrige 5 problemas identificados no script RSC gerado, desde críticos até baixos:

| # | Severidade | Problema | Solução |
|---|------------|----------|---------|
| 1 | CRÍTICO | IP Binding após Hotspot Server | Mover IP Binding para antes do Hotspot Server |
| 2 | MÉDIO | Client Isolation bloqueia gateway | Adicionar exceção para o gateway |
| 3 | BAIXO | Drop sem log dificulta debug | Adicionar log antes de dropar |
| 4 | BAIXO | Scheduler start-time=startup race | Usar delay fixo (30s/5min) |
| 5 | BAIXO | Health Check não valida interface | Adicionar verificação de interface |

## Arquivo a Modificar

| Arquivo | Localização |
|---------|-------------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Múltiplas seções |

## Correção 1: Mover IP Binding (CRÍTICO)

**Problema**: O IP Binding é criado após o Hotspot Server (linha 517-529), mas o Hotspot começa a interceptar tráfego assim que é ativado (linha 343-347).

**Antes (Ordem errada)**:
```text
Linha 339-347: Hotspot Server (ativa intercepção)
Linha 517-529: IP Binding (bypass - tarde demais!)
```

**Depois (Ordem correta)**:
```text
Linha 305: IP Binding (antes do Hotspot)
Linha 339-347: Hotspot Server (já tem bypass configurado)
```

**Alterações**:
- Mover o bloco IP Binding das linhas 517-529 para logo após o Hotspot Profile (linha 305)
- Remover o bloco duplicado das linhas 517-529

**Código a inserir após linha 305**:
```typescript
  // IP Binding MUST be created BEFORE Hotspot Server to prevent lockout
  script += `
# ============================================
# IP Binding (Administrative Access Bypass)
# ============================================
# IMPORTANT: This MUST be configured BEFORE the Hotspot Server
# to prevent administrative lockout during setup
/ip hotspot ip-binding
:do { remove [find comment~"navspot-admin-bypass"] } on-error={}

# Bypass hotspot authentication for local network (administrative access)
add address=${networkCidr} type=bypassed comment="navspot-admin-bypass"

`
```

## Correção 2: Client Isolation com Exceção para Gateway (MÉDIO)

**Problema**: A regra atual (linhas 511-513) bloqueia TODO tráfego entre clientes, incluindo acesso ao gateway.

**Antes**:
```routeros
add chain=forward action=drop src-address=${networkCidr} dst-address=${networkCidr} \
    comment="navspot-security-client-isolation"
```

**Depois**:
```routeros
# Allow access to gateway (router itself) - MUST come before isolation drop
add chain=forward action=accept src-address=${networkCidr} dst-address=${gateway} \
    comment="navspot-security-allow-gateway"

# Client Isolation - prevent clients from reaching each other directly
add chain=forward action=drop src-address=${networkCidr} dst-address=${networkCidr} \
    comment="navspot-security-client-isolation"
```

**Localização**: Linhas 511-513 do arquivo atual

## Correção 3: Log Antes de Dropar (BAIXO)

**Problema**: A regra drop (linhas 507-509) descarta tráfego silenciosamente, dificultando debug.

**Antes**:
```routeros
add chain=input action=drop in-interface=\$navspotInterface \
    comment="navspot-security-drop-other"
```

**Depois**:
```routeros
# Log suspicious traffic before dropping (for debugging)
add chain=input action=log in-interface=\$navspotInterface \
    log-prefix="NAVSPOT-DROP: " comment="navspot-security-log-drop"

# Drop all other input from hotspot interface
add chain=input action=drop in-interface=\$navspotInterface \
    comment="navspot-security-drop-other"
```

**Localização**: Linhas 507-509 do arquivo atual

## Correção 4: Scheduler com Delay Inicial (BAIXO)

**Problema**: `start-time=startup` pode causar race condition em roteadores lentos.

**Antes** (linhas 873-878):
```routeros
add name="navspot-sync-scheduler" interval=${interval}m on-event="..." \
    start-time=startup policy=read,write,test

add name="navspot-health-scheduler" interval=1h on-event="..." \
    start-time=startup policy=read,write,test
```

**Depois**:
```routeros
add name="navspot-sync-scheduler" interval=${interval}m on-event="..." \
    start-time=00:00:30 policy=read,write,test comment="Start 30s after boot"

add name="navspot-health-scheduler" interval=1h on-event="..." \
    start-time=00:05:00 policy=read,write,test comment="Start 5min after boot"
```

**Localização**: Linhas 871-878 do arquivo atual

## Correção 5: Health Check com Validação de Interface (BAIXO)

**Problema**: O Health Check não verifica se a interface configurada ainda existe.

**Antes** (linhas 835-838):
```routeros
add name="navspot-health" owner=admin policy=read,write,test source={
  :local hotspotName "hs-${hotspotSlug}"
  :local dhcpName "dhcp-${hotspotSlug}"
  :local issues 0
```

**Depois**:
```routeros
add name="navspot-health" owner=admin policy=read,write,test source={
  :local hotspotName "hs-${hotspotSlug}"
  :local dhcpName "dhcp-${hotspotSlug}"
  :local issues 0
  
  # Check if interface still exists
  :global navspotInterface
  :if ([/interface find name=\$navspotInterface] = "") do={
    :log error ("NAVSPOT: Interface " . \$navspotInterface . " desapareceu!")
    :set issues (\$issues + 1)
  }
```

**Localização**: Linhas 835-838 do arquivo atual

## Resumo das Alterações por Linha

| Linhas Atuais | Ação | Descrição |
|---------------|------|-----------|
| 305 | INSERIR | Adicionar IP Binding antes do Hotspot Server |
| 507-509 | SUBSTITUIR | Adicionar log antes do drop |
| 511-513 | SUBSTITUIR | Adicionar exceção para gateway antes do isolation |
| 517-529 | REMOVER | Remover IP Binding duplicado (já movido) |
| 835-838 | SUBSTITUIR | Adicionar validação de interface no health check |
| 871-878 | SUBSTITUIR | Alterar start-time de startup para delay fixo |

## Fluxo de Execução Corrigido

```text
1. Interface Verification
2. IP Address Configuration
3. IP Pool Configuration
4. DHCP Server Network
5. DHCP Server
6. DNS Server
7. Hotspot Profile
8. IP Binding (BYPASS) <-- ANTES do Hotspot Server!
9. User Profiles
10. Hotspot Server <-- Agora com bypass já configurado
11. Walled Garden
12. Firewall Rules (com log + gateway exception)
13. Schedulers (com delay inicial)
14. Initial Sync
```

## Benefícios

1. **Acesso Administrativo Garantido**: IP Binding configurado antes do Hotspot evita lockout
2. **Gateway Acessível**: Clientes podem acessar o roteador mesmo com isolation
3. **Debug Facilitado**: Logs mostram tráfego descartado
4. **Boot Estável**: Schedulers aguardam sistema estabilizar
5. **Monitoramento Robusto**: Health check detecta interfaces removidas

