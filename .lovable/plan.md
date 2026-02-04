

# Correção: Erro "already have such entry" - Script Não Idempotente

## Diagnóstico

Analisando os logs da imagem, identifiquei que você executou o script **duas vezes**:
- **13:30:25-26**: Primeira execução (sucesso)
- **13:38:28+**: Segunda execução (falha com "already have such entry")

O problema é que o **cleanup remove apenas entradas com comentário "navspot"**, mas vários comandos de criação **não têm proteção `on-error`**. Quando o script roda pela segunda vez, ele tenta criar recursos que já existem.

## Comandos Problemáticos (Sem Proteção)

| Linha | Comando | Problema |
|-------|---------|----------|
| 320 | `/interface bridge add name="bridge1"` | Bridge já existe |
| 325 | `/ip address add address=...` | Endereço já existe |
| 326 | `/ip pool add name="hs-pool-navspot"` | Pool já existe |
| 327 | `/ip dhcp-server network add` | Rede DHCP já existe |
| 328 | `/ip dhcp-server add name="dhcp-navspot"` | Servidor já existe |
| 332 | `/ip firewall nat add` | Regra NAT já existe |
| 338 | `/interface list member add list="mgmt" interface=bridge1` | Membro já existe |
| 251 | `/interface bridge port add` | Porta já migrada |
| 354 | `/ip hotspot add name="hs-navspot"` | Hotspot já existe |

## Solução: Tornar TODOS os Comandos Idempotentes

Usar o padrão **"remove-then-add"** ou wrapping com `:do { } on-error={}` em TODOS os comandos de criação.

## Mudanças no Arquivo

### `supabase/functions/mikrotik-script-generator/index.ts`

#### Seção 5 - Bridge (linha 320)
```routeros
# Antes:
/interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot"

# Depois:
:do { /interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot" } on-error={}
```

#### Seção 6 - Rede IP (linhas 325-328)
```routeros
# Antes:
/ip address add address=${gateway}/24 interface=bridge1 comment="navspot"
/ip pool add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd}
/ip dhcp-server network add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot"
/ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no

# Depois:
:do { /ip address add address=${gateway}/24 interface=bridge1 comment="navspot" } on-error={}
:do { /ip pool add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd} } on-error={}
:do { /ip dhcp-server network add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot" } on-error={}
:do { /ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no } on-error={}
```

#### Seção 7 - NAT (linha 332)
```routeros
# Antes:
/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat"

# Depois:
:do { /ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat" } on-error={}
```

#### Seção 8 - Interface List Member (linha 338)
```routeros
# Antes:
/interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery"

# Depois:
:do { /interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery" } on-error={}
```

#### Seção 9 - Migração de Portas (linha 251)
```routeros
# Antes:
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"

# Depois:
:do { /interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan" } on-error={}
```

#### Seção 10 - Hotspot (linha 354)
```routeros
# Antes:
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no

# Depois:
:do { /ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no } on-error={}
```

## Por Que o Cleanup Não Resolve

O cleanup **funciona**, mas:
1. Se o import anterior **falhou no meio**, alguns recursos podem ter sido criados antes da falha
2. Se o import anterior **completou com sucesso**, o cleanup da segunda execução deveria remover tudo

O problema é que o cleanup pode falhar silenciosamente (com `on-error={}`) em alguns recursos, deixando-os para trás.

## Solução Robusta: on-error em TODOS os add

Ao adicionar `on-error={}` em todos os comandos `add`, o script:
1. **Não falha** se o recurso já existe
2. **Continua** a execução normalmente
3. Se torna **verdadeiramente idempotente**

## Checklist

| # | Item | Arquivo | Linha |
|---|------|---------|-------|
| 1 | Bridge add | index.ts | 320 |
| 2 | IP address add | index.ts | 325 |
| 3 | IP pool add | index.ts | 326 |
| 4 | DHCP network add | index.ts | 327 |
| 5 | DHCP server add | index.ts | 328 |
| 6 | Firewall NAT add | index.ts | 332 |
| 7 | Interface list member add | index.ts | 338 |
| 8 | Bridge port add | index.ts | 251 |
| 9 | Hotspot add | index.ts | 354 |
| 10 | Re-deploy | mikrotik-script-generator | - |

## Resultado Esperado

Após a correção, o script poderá ser importado **múltiplas vezes** sem erros, mesmo que entradas anteriores existam.

