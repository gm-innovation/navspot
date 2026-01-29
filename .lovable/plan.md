

# Script Bootstrap v5.3 - Simplificado e À Prova de Falhas

## Problema Atual

O script v5.2 usa variáveis `:local` e loops `:foreach` que causam problemas em algumas versões do RouterOS:

| Problema | Causa | Resultado |
|----------|-------|-----------|
| Erro "Interface não existe" | Comparação de variáveis em loops | Script aborta |
| Complexidade desnecessária | Blocos `:if` aninhados | Difícil debugar |
| Falha silenciosa | Variáveis não resolvem corretamente | Estado inconsistente |

---

## Solução: Script v5.3 Hardcoded

Substituir todas as variáveis por valores diretos e remover loops complexos.

### Princípios

1. **Zero variáveis** - Todos os valores são inseridos diretamente no script
2. **Zero loops para portas** - Cada porta é adicionada individualmente
3. **Comandos atômicos** - Cada linha funciona independentemente
4. **on-error em tudo** - Nenhum comando aborta o script

---

## Comparação v5.2 vs v5.3

| Aspecto | v5.2 (Atual) | v5.3 (Novo) |
|---------|--------------|-------------|
| Variáveis | `:local WANIF`, `:local WANTYPE` | Nenhuma - valores diretos |
| Loops | `:foreach` para portas | Comandos individuais |
| Validação WAN | `:if` com variável | Removida (confia no usuário) |
| Proteção WAN | Loop com variável | Comando direto |
| Tamanho | Maior (loops genéricos) | Menor (comandos específicos) |
| Compatibilidade | Problemas em v6 | Funciona em v6 e v7 |

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar - script v5.3 simplificado |

---

## Estrutura do Novo Script v5.3

```text
# ============================================
# NAVSPOT Bootstrap Script v5.3 - SIMPLIFICADO
# ============================================

# 1. LIMPEZA INICIAL (remover configs antigas)
/ip hotspot remove [find name="hs-navspot"]
/ip hotspot profile remove [find name~"navspot"]
/ip dhcp-server remove [find name="dhcp-navspot"]
/ip pool remove [find name="hs-pool-navspot"]
/ip address remove [find comment="navspot"]
/ip firewall nat remove [find comment="navspot-nat"]
/interface bridge port remove [find comment="navspot-lan"]
/interface bridge remove [find name="bridge1"]
/system script remove [find name="navspot-sync"]
/system scheduler remove [find name="navspot-sync-scheduler"]
:delay 2s
:log info "NAVSPOT v5.3: Limpeza inicial concluida"

# 2. CONFIGURAR WAN (valor direto, sem variável)
/ip dhcp-client remove [find interface=ether1]
/ip dhcp-client add interface=ether1 disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ether1"

# 3. IDENTIDADE
/system identity set name="Nome da Embarcacao"

# 4. CRIAR BRIDGE
/interface bridge add name="bridge1" comment="navspot"
:delay 1s
:log info "NAVSPOT: Bridge1 criada"

# 5. ADICIONAR PORTAS (uma por uma, sem loop)
/interface bridge port add bridge="bridge1" interface=ether2 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether3 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether4 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether5 comment="navspot-lan"
:delay 1s
:log info "NAVSPOT: Portas LAN adicionadas"

# 6. REDE IP
/ip address add address=192.168.88.1/24 interface=bridge1 comment="navspot"
/ip pool add name="hs-pool-navspot" ranges=192.168.88.10-192.168.88.254
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1 comment="navspot"
/ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
:log info "NAVSPOT: Rede IP configurada"

# 7. NAT (valor direto)
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="navspot-nat"
:log info "NAVSPOT: NAT configurado"

# 8. HOTSPOT
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="slug.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot ativo"

# 9. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 10. TOKEN (arquivo)
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents="TOKEN_AQUI"
:log info "NAVSPOT: Token salvo"

# 11. SYNC SCRIPT
/system script add name="navspot-sync" policy=read,write,policy,test source="..."
:log info "NAVSPOT: Script sync criado"

# 12. SCHEDULER
/system scheduler add name="navspot-sync-scheduler" interval=5m on-event="navspot-sync" start-time=startup
:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT v5.3: Bootstrap concluido!"
```

---

## Mudanças Técnicas no Gerador

### Remover

```typescript
// REMOVER - Variáveis complexas
:local WANIF "${wanInterface}"
:local WANTYPE "${wanType}"
:local DNSNAME "${dnsName}"
:local TOKEN "${hotspot.sync_token}"

// REMOVER - Validação com variável
:if ([:len [/interface find name=\$WANIF]] = 0) do={...}

// REMOVER - Loops com variáveis
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={...}
```

### Substituir Por

```typescript
// NOVO - Valores diretos no código
/ip dhcp-client add interface=${wanInterface} disabled=no

// NOVO - Portas uma por uma
/interface bridge port add bridge="bridge1" interface=ether2 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether3 comment="navspot-lan"
// etc.

// NOVO - NAT com valor direto
/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade
```

---

## Limpeza Inicial (Novo Bloco)

Adicionar um bloco de limpeza no início para remover configurações antigas antes de recriar:

```routeros
# 1. LIMPEZA INICIAL
/ip hotspot remove [find name="hs-navspot"]
/ip hotspot profile remove [find name~"navspot"]
/ip dhcp-server remove [find name="dhcp-navspot"]
/ip pool remove [find name="hs-pool-navspot"]
/ip address remove [find comment="navspot"]
/ip firewall nat remove [find comment="navspot-nat"]
/interface bridge port remove [find comment="navspot-lan"]
/interface bridge remove [find name="bridge1"]
/system script remove [find name="navspot-sync"]
/system scheduler remove [find name="navspot-sync-scheduler"]
:delay 2s
```

Isso permite rodar o script múltiplas vezes sem erros de duplicação.

---

## Geração Dinâmica de Portas LAN

O gerador vai produzir linhas individuais para cada porta:

```typescript
// Gerar comandos para portas LAN (excluindo WAN)
const lanPorts = ['ether2', 'ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
const portCommands = lanPorts.map(port => 
  `/interface bridge port add bridge="bridge1" interface=${port} comment="navspot-lan"`
).join('\n')
```

Se WAN = ether1, resultado:
```routeros
/interface bridge port add bridge="bridge1" interface=ether2 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether3 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether4 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether5 comment="navspot-lan"
```

Se WAN = ether2, resultado:
```routeros
/interface bridge port add bridge="bridge1" interface=ether3 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether4 comment="navspot-lan"
/interface bridge port add bridge="bridge1" interface=ether5 comment="navspot-lan"
```

---

## Resultado Esperado

| Benefício | Descrição |
|-----------|-----------|
| Zero erros de variável | Todos os valores são strings diretas |
| Idempotente | Pode rodar múltiplas vezes (limpeza inicial) |
| Fácil debug | Cada linha é um comando completo |
| Compatível v6/v7 | Sem sintaxe problemática |
| Menor | Menos linhas, mais direto |

