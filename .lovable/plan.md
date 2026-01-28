

# Reestruturação Completa do Script (v3.8)

## Problema Crítico Identificado

O script v3.7 tem um erro fatal de ordem de execução:

```text
ORDEM ATUAL (v3.7 - ERRADA):
┌─────────────────────────────────────────────────────────────┐
│ 1. Smart Interface Detection                                │ ← Procura bridge1
│    :local targetIf ""                                       │
│    :if ([/interface find name="bridge1"] != "") ...         │ ← bridge1 NÃO existe ainda!
│    :set targetIf "bridge1"                                  │ ← FALHA: targetIf fica vazio
│                                                             │
│ 2. Automatic Bridge Port Assignment                         │
│    /interface bridge add name=bridge1...                    │ ← Cria bridge1 (tarde demais!)
│                                                             │
│ 3. IP Address Configuration                                 │
│    add address=192.168.88.1/24 interface=$targetIf          │ ← FALHA: interface=""
│                                                             │
│ 4. DHCP, Hotspot, NAT...                                    │ ← TODOS FALHAM
└─────────────────────────────────────────────────────────────┘
```

**Resultado:** O script executa sem erros visíveis, mas nada funciona porque `$targetIf` está vazio.

---

## Solução: Reordenação Completa (v3.8)

```text
ORDEM CORRETA (v3.8):
┌─────────────────────────────────────────────────────────────┐
│ 1. INFRAESTRUTURA (criar bridge + portas)                   │
│    /interface bridge add name=bridge1                       │ ← Cria bridge1 PRIMEIRO
│    /interface bridge port add bridge=bridge1 ether2-5       │ ← Associa portas
│    :delay 1s                                                │ ← Aguarda hardware subir
│                                                             │
│ 2. DETECÇÃO DE INTERFACE                                    │
│    :if ([/interface find name="bridge1"] != "") ...         │ ← Agora bridge1 EXISTE!
│    :set targetIf "bridge1"                                  │ ← SUCESSO: targetIf = "bridge1"
│                                                             │
│ 3. REDE (IP, Pool, DHCP)                                    │
│    add address=192.168.88.1/24 interface=$targetIf          │ ← FUNCIONA!
│                                                             │
│ 4. SERVIÇOS (Hotspot, Firewall, NAT)                        │ ← TODOS FUNCIONAM!
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Reordenar seções do script RouterOS |

---

## Mudanças Detalhadas

### 1. Versão do Script

**Linha 233 - Atualizar para:**
```typescript
# Version: 3.8 - Infrastructure First (bridge before detection)
```

### 2. Nova Ordem das Seções

A estrutura do script gerado deve seguir esta ordem:

| # | Seção | Descrição |
|---|-------|-----------|
| 1 | Header | Variáveis globais, identity |
| 2 | **Bridge Infrastructure** | Criar bridge1 + associar portas (ANTES da detecção) |
| 3 | Interface Detection | Agora detecta bridge1 que já existe |
| 4 | IP Address | Configurar IP na interface detectada |
| 5 | IP Pool | Pool de endereços DHCP |
| 6 | DHCP Network | Rede DHCP |
| 7 | DHCP Server | Servidor DHCP |
| 8 | DNS | Configurações DNS |
| 9 | Hotspot Profile | Perfil do hotspot |
| 10 | IP Binding | Bypass administrativo |
| 11 | User Profiles | Perfis de velocidade |
| 12 | Hotspot Server | Servidor hotspot |
| 13 | Walled Garden | Domínios permitidos/bloqueados |
| 14 | Firewall | Regras de segurança |
| 15 | NAT | Masquerade para internet |
| 16 | Sync Scripts | Scripts de sincronização |
| 17 | Schedulers | Agendadores |
| 18 | Final Log | Resumo da configuração |

---

## Código RouterOS Reestruturado

### Bloco 1: Header + Identity (sem mudança)

```routeros
# ============================================
# NAVSPOT MikroTik Configuration Script
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# Version: 3.8 - Infrastructure First (bridge before detection)
# ============================================

/system identity set name="${hotspot.nome}"
```

### Bloco 2: NOVA POSIÇÃO - Bridge Infrastructure (ANTES da detecção)

```routeros
# ============================================
# Bridge Infrastructure (MUST BE FIRST)
# ============================================
# Topologia: ether1 = WAN/Internet, ether2-5 = Hotspot LAN
# A bridge DEVE existir ANTES da detecção de interface

:log info "NAVSPOT: [1/6] Configurando infraestrutura de rede..."

# Step 1: Create bridge1 if it doesn't exist
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={
    add name=bridge1 comment="navspot-hotspot-bridge"
    :log info "NAVSPOT: bridge1 criada"
} else={
    :log info "NAVSPOT: bridge1 ja existe"
}

# Step 2: Enable bridge1
enable [find name="bridge1"]
:log info "NAVSPOT: bridge1 ativada"

# Step 3: Wait for bridge to be ready in kernel
:delay 1s

# Step 4: Remove ether2-5 from any existing bridge (prevent conflicts)
/interface bridge port
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        remove [find interface=$port]
    } on-error={}
}

# Step 5: Add ether2-5 to bridge1 (Hotspot LAN)
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        add bridge=bridge1 interface=$port comment="navspot-hotspot-port"
        :log info ("NAVSPOT: " . $port . " adicionada a bridge1")
    } on-error={
        :log warning ("NAVSPOT: " . $port . " nao existe neste modelo")
    }
}

# Step 6: Add wlan interfaces to bridge1 if they exist
:foreach wlan in={"wlan1";"wlan2"} do={
    :if ([/interface find name=$wlan] != "") do={
        :do {
            /interface bridge port remove [find interface=$wlan]
        } on-error={}
        :do {
            /interface bridge port add bridge=bridge1 interface=$wlan comment="navspot-hotspot-port"
            :log info ("NAVSPOT: " . $wlan . " adicionada a bridge1")
        } on-error={}
    }
}

# Step 7: Enable physical interfaces
/interface ethernet
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        enable [find name=$port]
    } on-error={}
}

# Step 8: Wait for all ports to be fully initialized
:delay 1s

:log info "NAVSPOT: Infraestrutura de rede pronta"
```

### Bloco 3: Interface Detection (AGORA FUNCIONA)

```routeros
# ============================================
# Smart Interface Detection
# ============================================
# Agora a bridge1 JA EXISTE, a detecção vai encontrá-la

:log info "NAVSPOT: [2/6] Detectando interface de rede..."

:local targetIf ""
:local interfacePriority {"bridge1";"wlan1";"wlan2";"ether3";"ether4";"ether5"}
:local configuredIf "${interfaceWifi}"

# Use configured interface if explicitly set
:if ([:len $configuredIf] > 0) do={
    :if ([/interface find name=$configuredIf] != "") do={
        :set targetIf $configuredIf
        :log info ("NAVSPOT: Usando interface configurada: " . $targetIf)
    } else={
        :log warning ("NAVSPOT: Interface '" . $configuredIf . "' nao existe. Detectando automaticamente...")
    }
} else={
    :log info "NAVSPOT: Modo auto-detect ativado"
}

# Auto-detect if no valid interface found yet
:if ($targetIf = "") do={
    :foreach ifName in=$interfacePriority do={
        :if ($targetIf = "") do={
            :if ([/interface find name=$ifName] != "") do={
                :set targetIf $ifName
                :log info ("NAVSPOT: Interface detectada: " . $targetIf)
            }
        }
    }
}

# Final validation
:if ($targetIf = "") do={
    :log error "NAVSPOT: ERRO CRITICO - Nenhuma interface valida encontrada!"
    :error "Abortando - nenhuma interface disponivel"
}

:log info ("NAVSPOT: Interface final: " . $targetIf)

# Save interface for persistence
:global navspotInterface $targetIf
/file
:do { remove [find name="navspot-interface.txt"] } on-error={}
:delay 500ms
:do {
    /file add name="navspot-interface.txt" contents=$targetIf
} on-error={
    /file print file="navspot-interface" where name=""
    :delay 1s
    /file set "navspot-interface.txt" contents=$targetIf
}
```

### Demais Blocos (mantidos na mesma ordem)

Os blocos 4-18 (IP, DHCP, Hotspot, Firewall, NAT, Sync) permanecem na mesma posição, apenas com a garantia de que `$targetIf` agora contém um valor válido.

---

## Resumo das Mudanças no TypeScript

| Linha Atual | Ação | Nova Posição |
|-------------|------|--------------|
| 240-302 | Smart Interface Detection | Mover para DEPOIS do Bridge Infrastructure |
| 304-363 | Bridge Port Assignment | Mover para ANTES da Interface Detection |
| 233 | Version | Atualizar para 3.8 |

### Adicionar Delays Estratégicos

| Posição | Delay | Motivo |
|---------|-------|--------|
| Após criar bridge1 | `:delay 1s` | Aguardar interface subir no kernel |
| Após adicionar portas | `:delay 1s` | Aguardar portas estarem em estado running |
| Após criar arquivo | `:delay 500ms` | Aguardar filesystem (já existe) |

---

## Comportamento Após Correção

| Antes (v3.7) | Depois (v3.8) |
|--------------|---------------|
| `bridge1` não existe na detecção | `bridge1` criada ANTES da detecção |
| `targetIf = ""` (vazio) | `targetIf = "bridge1"` |
| IP, DHCP, Hotspot FALHAM | IP, DHCP, Hotspot FUNCIONAM |
| Script executa sem erros visíveis | Script funciona corretamente |

---

## Fluxo do Script v3.8

```text
1. Header (variáveis, identity)
2. [NOVO] Bridge Infrastructure (criar bridge1 + portas)
3. [MOVIDO] Interface Detection (agora encontra bridge1)
4. IP Address
5. IP Pool
6. DHCP Network + Server
7. DNS
8. Hotspot Profile + IP Binding
9. User Profiles
10. Hotspot Server
11. Walled Garden
12. Layer 7 + Firewall
13. NAT Masquerade
14. Sync Scripts + Schedulers
15. Final Log
```

---

## Validação de Idempotência

Todos os comandos seguem o padrão:

```routeros
:if ([:len [find name="X"]] = 0) do={ add name="X" ... }
```

Isso garante que:
- Se o item já existe, não tenta criar novamente
- Se não existe, cria
- Script pode ser executado múltiplas vezes sem erros

---

## Segurança Mantida

- ether1 continua excluída (WAN)
- Apenas ether2-5 são adicionadas à bridge
- Firewall permanece ativo
- NAT masquerade funcional
- Delays previnem race conditions

