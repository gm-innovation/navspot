

# Correção de Acesso Administrativo (WinBox/SSH)

## Problema Identificado

O script atual bloqueia acesso WinBox/SSH da rede de gerência (WAN) porque:

```routeros
# Regra atual - só permite da rede do Hotspot
add chain=input action=accept src-address=192.168.88.0/24 \
    dst-port=8291 protocol=tcp comment="navspot-security-winbox"
```

Quando você conecta de `192.168.0.8` (rede WAN), o firewall descarta o pacote antes da autenticação.

---

## Solução Proposta: IP Binding para Bypass Administrativo

Em vez de adicionar regras de firewall para redes de gerência (que variam entre embarcações), vamos usar **IP Binding com type=bypassed** - a forma correta de garantir acesso administrativo no MikroTik Hotspot.

### Por que IP Binding é melhor?

| Abordagem | Problema |
|-----------|----------|
| Adicionar src-address=192.168.0.0/24 | Cada embarcação pode ter rede WAN diferente |
| IP Binding type=bypassed | Funciona automaticamente para qualquer rede não-hotspot |

### O que é IP Binding type=bypassed?

```routeros
/ip hotspot ip-binding
add address=0.0.0.0/0 type=bypassed comment="navspot-admin-bypass"
```

Isso significa: **qualquer conexão que NÃO seja da interface do Hotspot é automaticamente bypassada**.

---

## Alterações no Script Generator

### Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`

### Alteração 1: Adicionar IP Binding para bypass administrativo (linhas ~405-415)

**Antes:**
```routeros
/ip hotspot ip-binding
:do { remove [find comment~"navspot-admin-bypass"] } on-error={}
# (sem regra de bypass)
```

**Depois:**
```routeros
/ip hotspot ip-binding
:do { remove [find comment~"navspot"] } on-error={}

# Bypass para acesso administrativo (WinBox/SSH de qualquer rede que não seja o hotspot)
# Isso permite gerenciamento remoto sem interferir no controle dos clientes
add address=0.0.0.0/0 type=bypassed server=none comment="navspot-admin-global-bypass"
```

### Alteração 2: Modificar regras de firewall (linhas 549-555)

**Antes:**
```routeros
# Allow WinBox from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} \
    dst-port=8291 protocol=tcp comment="navspot-security-winbox"

# Allow SSH from local network only (security - keep src-address)
add chain=input action=accept src-address=${networkCidr} \
    dst-port=22 protocol=tcp comment="navspot-security-ssh"
```

**Depois:**
```routeros
# Allow WinBox from any local/private network (not just hotspot network)
# RFC1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
add chain=input action=accept src-address=10.0.0.0/8 \
    dst-port=8291 protocol=tcp comment="navspot-security-winbox-10"
add chain=input action=accept src-address=172.16.0.0/12 \
    dst-port=8291 protocol=tcp comment="navspot-security-winbox-172"
add chain=input action=accept src-address=192.168.0.0/16 \
    dst-port=8291 protocol=tcp comment="navspot-security-winbox-192"

# Allow SSH from any local/private network
add chain=input action=accept src-address=10.0.0.0/8 \
    dst-port=22 protocol=tcp comment="navspot-security-ssh-10"
add chain=input action=accept src-address=172.16.0.0/12 \
    dst-port=22 protocol=tcp comment="navspot-security-ssh-172"
add chain=input action=accept src-address=192.168.0.0/16 \
    dst-port=22 protocol=tcp comment="navspot-security-ssh-192"
```

---

## Comportamento Após a Correção

| Origem | WinBox/SSH | Resultado |
|--------|------------|-----------|
| 192.168.88.x (Hotspot) | Porta 8291/22 | PERMITIDO |
| 192.168.0.x (WAN/Gerência) | Porta 8291/22 | PERMITIDO |
| 10.x.x.x (Rede Corporativa) | Porta 8291/22 | PERMITIDO |
| IP Público (Internet) | Porta 8291/22 | BLOQUEADO |

---

## Segurança Mantida

1. **Acesso externo (internet) permanece bloqueado** - apenas redes RFC1918 são permitidas
2. **Clientes do hotspot continuam controlados** - IP Binding não afeta usuários do portal
3. **Drop rule final permanece ativa** - qualquer tráfego não autorizado é descartado

---

## Ordem de Execução

A ordem correta das regras de firewall será:

```
1. Accept established/related (sempre primeiro)
2. Accept DNS (in-interface=$targetIf)
3. Accept WinBox (src-address=RFC1918)  ← NOVO
4. Accept SSH (src-address=RFC1918)      ← NOVO
5. Accept ICMP
6. Accept DHCP
7. Accept Hotspot HTTP
8. Log suspicious
9. Drop all other from $targetIf
```

---

## Resultado Esperado

Após aplicar esta correção:

```
Seu PC (192.168.0.8) → Winbox → MikroTik:8291
                                    ↓
                            Chain INPUT verifica:
                                    ↓
                    "src-address=192.168.0.0/16?" → SIM
                                    ↓
                            ACCEPT ✓ (permitido)
```

