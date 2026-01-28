

# NAT Masquerade Configuration (v3.7)

## Problema Identificado

O script v3.6 configura corretamente:
- Bridge ports (ether2-5)
- IP/DHCP na bridge1
- Firewall de seguranca
- Hotspot e usuarios

**Mas NAO configura NAT (Masquerade)**, que e essencial para que os clientes do hotspot acessem a internet.

### O que acontece sem NAT:

```text
Cliente Hotspot (192.168.88.100) → Requisição HTTP → google.com
                                         ↓
                              Router MikroTik recebe
                                         ↓
                              Envia para WAN (ether1)
                                         ↓
                              ISP recebe pacote com IP PRIVADO
                                         ↓
                              ISP descarta (IP nao roteavel)
                                         ↓
                              Cliente: "Sem internet!" ❌
```

### O que acontece COM NAT:

```text
Cliente Hotspot (192.168.88.100) → Requisição HTTP → google.com
                                         ↓
                              Router MikroTik recebe
                                         ↓
                              NAT Masquerade: 192.168.88.100 → IP da WAN
                                         ↓
                              Envia para WAN (ether1) com IP publico
                                         ↓
                              ISP roteia normalmente
                                         ↓
                              Cliente: "Internet OK!" ✓
```

---

## Solucao Proposta

Adicionar uma secao "NAT Configuration" que configura masquerade para qualquer trafego que saia por uma interface diferente da bridge1.

---

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar secao NAT antes da secao "Sync Token" |

---

## Localizacao no Codigo

Inserir o novo bloco **DEPOIS** da secao "Client Isolation" (linha 658) e **ANTES** da secao "Sync Token" (linha 664).

---

## Codigo RouterOS a Adicionar

```routeros
# ============================================
# NAT Configuration (Internet Access for Clients)
# ============================================
# Masquerade: Traduz IPs privados dos clientes para o IP da WAN
# out-interface=!$targetIf: Qualquer interface que NAO seja a bridge1 (ou seja, WAN)
/ip firewall nat
:do { remove [find comment~"navspot-masquerade"] } on-error={}
add chain=srcnat out-interface=!$targetIf action=masquerade comment="navspot-masquerade"
:log info "NAVSPOT: NAT Masquerade configurado para acesso a internet"
```

---

## Codigo TypeScript a Adicionar

Inserir apos a linha 660 (fecha aspas da secao de firewall):

```typescript
  // NAT Configuration - Masquerade for internet access
  script += `
# ============================================
# NAT Configuration (Internet Access for Clients)
# ============================================
# Masquerade: Traduz IPs privados dos clientes para o IP da WAN
# out-interface=!$targetIf: Qualquer interface que NAO seja a bridge1 (ou seja, WAN)
/ip firewall nat
:do { remove [find comment~"navspot-masquerade"] } on-error={}
add chain=srcnat out-interface=!\$targetIf action=masquerade comment="navspot-masquerade"
:log info "NAVSPOT: NAT Masquerade configurado para acesso a internet"

`
```

---

## Logica da Regra NAT

| Campo | Valor | Explicacao |
|-------|-------|------------|
| `chain` | `srcnat` | Source NAT (traduz o IP de origem) |
| `out-interface` | `!$targetIf` | Qualquer interface EXCETO a bridge1 |
| `action` | `masquerade` | Substitui IP privado pelo IP da interface de saida |
| `comment` | `navspot-masquerade` | Identificacao para remocao em regeneracoes |

### Por que `out-interface=!$targetIf`?

- Se usassemos `out-interface=ether1`, assumiriamos que a WAN e sempre ether1
- Usando `!$targetIf` (negacao), a regra vale para QUALQUER interface que nao seja o hotspot
- Funciona independente de qual porta e a WAN

---

## Versao do Script

Atualizar a versao de **3.6** para **3.7** na linha 233:

```typescript
# Version: 3.7 - NAT Masquerade (internet access for clients)
```

---

## Atualizacao do Log Final

Adicionar linha no log final (apos "Porta WAN"):

```routeros
:log info "NAVSPOT: NAT Masquerade: ativo (clientes podem acessar internet)"
```

---

## Comportamento Apos Correcao

| Antes (v3.6) | Depois (v3.7) |
|--------------|---------------|
| Clientes sem internet | Clientes com internet |
| Ping para 8.8.8.8 falha | Ping para 8.8.8.8 funciona |
| Navegacao nao funciona | Navegacao funciona |
| NAT nao configurado | Masquerade ativo |

---

## Fluxo do Script v3.7

```text
1. Detecta interface (bridge1 prioritario)
2. Salva interface em arquivo
3. Configura bridge1 e conecta ether2-5
4. Configura IP na bridge1
5. Configura DHCP
6. Configura Hotspot
7. Configura firewall
8. [NOVO] Configura NAT Masquerade
9. Configura sync
10. Log final com informacao de NAT
```

---

## Seguranca

- A regra NAT **nao afeta** o trafego interno do hotspot
- Apenas trafego que **sai** para a internet e mascarado
- Clientes continuam isolados entre si (regra de client isolation)
- Firewall de entrada permanece ativo

---

## Compatibilidade

- Funciona em qualquer modelo MikroTik (hEX, hAP, CCR, etc.)
- Nao depende de qual porta e a WAN
- Funciona com Starlink, 4G, fibra, etc.

