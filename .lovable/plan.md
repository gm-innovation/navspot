

# Otimizacao das Regras de Firewall no MikroTik Script Generator

## Objetivo
Substituir as regras de firewall que usam `src-address` fixo por regras baseadas em `in-interface=$navspotInterface`, tornando o script mais robusto, universal e independente de configuracao de IP.

## Problema Atual

Nas linhas 469-515 do arquivo `supabase/functions/mikrotik-script-generator/index.ts`, as regras de firewall usam:

```routeros
add chain=input action=accept src-address=${networkCidr} dst-port=53 protocol=udp ...
```

### Problemas identificados:

1. **IP Temporario**: Quando um usuario conecta mas ainda nao fez login, o Hotspot pode atribuir IP temporario
2. **Mascara de origem**: O MikroTik Hotspot as vezes mascara a origem do trafego
3. **Falta de flexibilidade**: Se a rede mudar (ex: de 192.168.88.0 para 10.0.0.0), todas as regras precisam ser editadas
4. **Falta de regra para portal**: Nao ha permissao explicita para portas 80/443/8080 vindas da interface

## Solucao Proposta

Substituir o bloco Firewall Rules (Security) usando `in-interface=$navspotInterface` para regras de servicos de rede, mantendo `src-address` apenas para WinBox e SSH (que exigem autenticacao local por seguranca):

```routeros
# Firewall Rules (Security) - VERSAO OTIMIZADA
/ip firewall filter
:foreach f in=[find comment~"navspot-security"] do={ remove $f }

# Accept established/related connections
add chain=input action=accept connection-state=established,related comment="navspot-security-established"

# Allow DNS (UDP/TCP) from hotspot interface
add chain=input action=accept in-interface=$navspotInterface dst-port=53 protocol=udp comment="navspot-security-dns"
add chain=input action=accept in-interface=$navspotInterface dst-port=53 protocol=tcp comment="navspot-security-dns-tcp"

# Allow WinBox from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} dst-port=8291 protocol=tcp comment="navspot-security-winbox"

# Allow SSH from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} dst-port=22 protocol=tcp comment="navspot-security-ssh"

# Allow ICMP from hotspot interface
add chain=input action=accept in-interface=$navspotInterface protocol=icmp comment="navspot-security-ping"

# Allow DHCP (discover, renew, release)
add chain=input action=accept dst-port=67-68 protocol=udp comment="navspot-security-dhcp"

# CRITICAL: Allow hotspot HTTP redirect (portal capture)
add chain=input action=accept in-interface=$navspotInterface dst-port=80,443,8080 protocol=tcp comment="navspot-security-hotspot-http"

# Drop all other input from hotspot interface
add chain=input action=drop in-interface=$navspotInterface comment="navspot-security-drop-other"

# Client Isolation - prevent clients from reaching each other
add chain=forward action=drop src-address=${networkCidr} dst-address=${networkCidr} comment="navspot-security-client-isolation"
```

## Arquivo a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Atualizar bloco de regras de firewall (linhas 469-515) |

## Alteracoes Detalhadas

### Linha 469-515: Substituir bloco completo de Firewall Rules (Security)

**DE:**
```typescript
script += `
# Firewall Rules (Security)
...
add chain=input action=accept src-address=${networkCidr} dst-port=53 protocol=udp ...
add chain=input action=accept src-address=${networkCidr} dst-port=53 protocol=tcp ...
add chain=input action=accept src-address=${networkCidr} dst-port=8291 protocol=tcp ...
add chain=input action=accept src-address=${networkCidr} dst-port=22 protocol=tcp ...
add chain=input action=accept src-address=${networkCidr} protocol=icmp ...
add chain=input action=accept src-address=${networkCidr} dst-port=80,443,8080 protocol=tcp ...
...
`
```

**PARA:**
```typescript
script += `
# Firewall Rules (Security) - Optimized with in-interface
...
add chain=input action=accept in-interface=\\$navspotInterface dst-port=53 protocol=udp ...
add chain=input action=accept in-interface=\\$navspotInterface dst-port=53 protocol=tcp ...
add chain=input action=accept src-address=${networkCidr} dst-port=8291 protocol=tcp ...  // Mantem src-address
add chain=input action=accept src-address=${networkCidr} dst-port=22 protocol=tcp ...    // Mantem src-address
add chain=input action=accept in-interface=\\$navspotInterface protocol=icmp ...
add chain=input action=accept in-interface=\\$navspotInterface dst-port=80,443,8080 protocol=tcp ...
...
`
```

## Resumo das Mudancas por Regra

| Regra | Antes | Depois | Justificativa |
|-------|-------|--------|---------------|
| DNS (UDP/TCP) | src-address | in-interface | Deve funcionar mesmo antes do login |
| WinBox | src-address | src-address | Manter restrito a rede local (seguranca) |
| SSH | src-address | src-address | Manter restrito a rede local (seguranca) |
| ICMP | src-address | in-interface | Permitir ping de qualquer cliente |
| DHCP | dst-port | dst-port | Ja esta correto (sem filtro de origem) |
| Hotspot HTTP | src-address | in-interface | CRITICO: Portal deve capturar requisicoes |
| Drop other | in-interface | in-interface | Ja esta correto |
| Client isolation | src/dst-address | src/dst-address | Manter para bloquear comunicacao entre clientes |

## Beneficios

1. **Universalidade**: Script funciona independente do range de IP configurado
2. **Robustez**: Funciona mesmo quando o Hotspot ainda nao atribuiu IP definitivo
3. **Manutencao**: Mudancas de rede nao exigem regeneracao do script de firewall
4. **Portal funcional**: Garante que o portal captive funcione corretamente
5. **Seguranca mantida**: WinBox e SSH continuam restritos por IP

## Consideracoes

- A variavel `$navspotInterface` ja esta definida no inicio do script (linha 258)
- As regras de WinBox e SSH mantem `src-address` por seguranca (apenas rede local autenticada)
- O isolamento de clientes mantem `src-address` e `dst-address` pois precisa bloquear comunicacao entre IPs da mesma rede

