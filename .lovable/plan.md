

# ✅ Correção de Acesso Administrativo (WinBox/SSH) - IMPLEMENTADO

## Status: CONCLUÍDO

Implementado em: 2026-01-28

---

## Problema Corrigido

O script bloqueava acesso WinBox/SSH da rede de gerência (WAN) porque as regras de firewall só permitiam acesso do CIDR do hotspot (ex: 192.168.88.0/24).

**Antes:**
```
PC (192.168.0.8) → WinBox → MikroTik:8291 → DROP ❌ (bloqueado)
```

---

## Solução Implementada

### 1. IP Binding com Bypass Global (linhas 356-371)

```routeros
/ip hotspot ip-binding
:do { remove [find comment~"navspot"] } on-error={}

# Bypass global - qualquer conexão não-hotspot é bypassada automaticamente
add address=0.0.0.0/0 type=bypassed server=none comment="navspot-admin-global-bypass"

# Bypass para rede local do hotspot
add address=${networkCidr} type=bypassed comment="navspot-admin-bypass"
```

### 2. Regras de Firewall RFC1918 (linhas 549-573)

```routeros
# WinBox - todas as redes privadas
add chain=input action=accept src-address=10.0.0.0/8 dst-port=8291 protocol=tcp
add chain=input action=accept src-address=172.16.0.0/12 dst-port=8291 protocol=tcp
add chain=input action=accept src-address=192.168.0.0/16 dst-port=8291 protocol=tcp

# SSH - todas as redes privadas
add chain=input action=accept src-address=10.0.0.0/8 dst-port=22 protocol=tcp
add chain=input action=accept src-address=172.16.0.0/12 dst-port=22 protocol=tcp
add chain=input action=accept src-address=192.168.0.0/16 dst-port=22 protocol=tcp
```

---

## Comportamento Após a Correção

| Origem | WinBox/SSH | Resultado |
|--------|------------|-----------|
| 192.168.88.x (Hotspot) | Porta 8291/22 | ✅ PERMITIDO |
| 192.168.0.x (WAN/Gerência) | Porta 8291/22 | ✅ PERMITIDO |
| 10.x.x.x (Rede Corporativa) | Porta 8291/22 | ✅ PERMITIDO |
| 172.16.x.x (VPN) | Porta 8291/22 | ✅ PERMITIDO |
| IP Público (Internet) | Porta 8291/22 | ❌ BLOQUEADO |

---

## Segurança Mantida

1. **Acesso externo (internet) permanece bloqueado** - apenas redes RFC1918 são permitidas
2. **Clientes do hotspot continuam controlados** - IP Binding não afeta usuários do portal
3. **Drop rule final permanece ativa** - qualquer tráfego não autorizado é descartado

---

## Arquivo Modificado

- `supabase/functions/mikrotik-script-generator/index.ts` (versão 3.4)
