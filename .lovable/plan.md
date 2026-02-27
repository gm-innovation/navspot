

# Fix Firewall DHCP/DNS — v7.9.25

## Diagnóstico confirmado

Template infra atual **não tem regras de firewall** para permitir DHCP/DNS na `bridge-navspot`. O firewall `defconf` do RouterOS descarta esses pacotes na chain `input`, impedindo clientes de receberem IP.

## Mudanças

### 1. SQL UPDATE no template `infra`

Adicionar **dois blocos** ao template existente:

**No bloco de cleanup (seção 1)**, adicionar:
```routeros
:do { /ip firewall filter remove [find comment="navspot"] } on-error={}
```

**Após o bloco de NAT (seção 5)**, antes do Hotspot Profile, adicionar:
```routeros
# Firewall: permitir DHCP e DNS na bridge-navspot
/ip firewall filter
add chain=input protocol=udp dst-port=67 in-interface=bridge-navspot action=accept comment="navspot" place-before=0
add chain=input protocol=udp dst-port=53 in-interface=bridge-navspot action=accept comment="navspot" place-before=0
add chain=input protocol=tcp dst-port=53 in-interface=bridge-navspot action=accept comment="navspot" place-before=0
```

### 2. `gen7post/index.ts` — bump versão para `7.9.25`

### 3. `.lovable/plan.md` — documentar correção

## Nota sobre `place-before=0`

A memória do projeto recomenda evitar `place-before=0` para idempotência em tabelas vazias. Neste caso é seguro porque:
- O cleanup remove regras `navspot` anteriores antes de inserir
- O firewall `defconf` sempre tem regras, então posição 0 existe
- É necessário inserir **antes** das regras de drop do defconf

