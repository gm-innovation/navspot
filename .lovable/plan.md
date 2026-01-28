

# Correção v5.1 - Proteção Absoluta da WAN

## Problema Identificado

O script v5.0 tem a lógica correta, mas falha em cenários reais porque:

| Problema | Causa | Linha |
|----------|-------|-------|
| WAN não é removida de bridges existentes | O comando `remove [find interface=$WANIF]` pode falhar silenciosamente | 188 |
| Não limpa bridges antigas do MikroTik | Se existir `bridgeLocal` da config default, não é removida | - |
| Sintaxe de comparação pode falhar | `$p != $WANIF` pode não funcionar em todos os contextos RouterOS v6 | 209 |
| Não verifica se WAN está em bridge antes de prosseguir | O script continua mesmo se a remoção falhar | - |

## Solução: Script v5.1 com Proteção Tripla

O novo script deve ter **3 camadas de proteção** para a WAN:

```text
1. REMOVER WAN de TODAS as bridges (por nome da interface)
2. VERIFICAR que WAN está livre (abort se ainda estiver em bridge)
3. LOOP de LAN com verificação DUPLA (existência + comparação WAN)
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar | Script v5.1 com proteção tripla da WAN |

---

## Mudanças no Script Gerado

### 1. Remover WAN de TODAS as Bridges (Antes de Qualquer Coisa)

```routeros
# PROTECAO TRIPLA DA WAN
# Passo 1: Remover WAN de qualquer bridge
/interface bridge port
:foreach bp in=[find interface=$WANIF] do={
  :do { remove $bp } on-error={}
}
:log info ("NAVSPOT: WAN " . $WANIF . " removida de todas as bridges")

# Passo 2: Verificar que WAN está livre
:if ([:len [/interface bridge port find interface=$WANIF]] > 0) do={
  :log error ("NAVSPOT: ERRO CRITICO - WAN " . $WANIF . " ainda em bridge!")
  :error "Abortando: WAN presa em bridge"
}
```

### 2. Loop de LAN com Lista Explícita (Sem WAN)

Em vez de comparar `$p != $WANIF` durante o loop, construir a lista de LANs dinamicamente:

```routeros
# PORTAS LAN EXPLICITAS (nunca inclui WAN)
:local lanPorts {"ether2";"ether3";"ether4";"ether5"}

# Verificar cada porta
/interface bridge port
:foreach p in=$lanPorts do={
  # So adiciona se a porta existe E nao e a WAN
  :local isWan ($p = $WANIF)
  :if (!$isWan) do={
    :if ([:len [/interface find name=$p]] > 0) do={
      :do { remove [find interface=$p] } on-error={}
      :do { add bridge="bridge1" interface=$p comment="navspot-lan" } on-error={}
      :log info ("NAVSPOT: Porta " . $p . " adicionada a bridge1")
    }
  } else={
    :log warning ("NAVSPOT: Porta " . $p . " e a WAN - IGNORADA")
  }
}
```

### 3. Verificação Final

```routeros
# VERIFICACAO FINAL
:local wanInBridge [:len [/interface bridge port find interface=$WANIF]]
:if ($wanInBridge > 0) do={
  :log error "NAVSPOT: FALHA CRITICA - WAN foi adicionada a bridge!"
  /interface bridge port remove [find interface=$WANIF]
  :log warning "NAVSPOT: WAN removida emergencialmente"
}

:log info ("NAVSPOT: Verificacao OK - WAN " . $WANIF . " isolada")
```

---

## Estrutura do Script v5.1

```text
1. Cabecalho + Versao 5.1
2. Variaveis (WANIF, WANTYPE, DNSNAME, TOKEN)
3. Validar WAN existe
4. PROTECAO TRIPLA:
   a) Remover WAN de TODAS as bridges (loop find)
   b) Verificar WAN livre (abort se nao)
   c) Log de confirmacao
5. Configurar DHCP client na WAN (se dhcp)
6. Criar bridge1
7. Loop LAN com verificacao DUPLA:
   a) Porta existe?
   b) Porta NAO e WAN?
   c) Adicionar com log
8. IP/Pool/DHCP/DNS
9. NAT explicito na WAN
10. Hotspot Profile + Server
11. Walled Garden basico
12. Token file
13. Script sync (inline)
14. Scheduler
15. VERIFICACAO FINAL (WAN isolada)
16. Log final
```

---

## Código TypeScript Completo

A função `generateBootstrapScript` será reescrita com:

```typescript
function generateBootstrapScript(
  hotspot: Hotspot,
  embarcacao: Embarcacao,
  supabaseUrl: string
): string {
  const wanInterface = hotspot.wan_interface || 'ether1'
  const wanType = hotspot.wan_type || 'dhcp'
  
  return `# ============================================
# NAVSPOT Bootstrap Script v5.1 - PRODUCAO
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# WAN: ${wanInterface} (${wanType})
# ============================================

# --- VARIAVEIS DO SISTEMA ---
:local WANIF "${wanInterface}"
:local WANTYPE "${wanType}"

:log info "NAVSPOT: Iniciando instalacao segura v5.1..."

# 1. VALIDACAO DA WAN
:if ([:len [/interface find name=$WANIF]] = 0) do={
  :log error ("NAVSPOT: Interface WAN " . $WANIF . " nao existe!")
  :error "Abortando: WAN inexistente"
}
:log info ("NAVSPOT: WAN validada = " . $WANIF)

# 2. PROTECAO TRIPLA DA WAN - REMOVER DE TODAS AS BRIDGES
/interface bridge port
:foreach bp in=[find interface=$WANIF] do={
  :log warning ("NAVSPOT: Removendo WAN de bridge...")
  :do { remove $bp } on-error={}
}

# Verificar se WAN foi liberada
:if ([:len [/interface bridge port find interface=$WANIF]] > 0) do={
  :log error ("NAVSPOT: CRITICO - WAN ainda em bridge!")
  :error "Abortando: WAN presa em bridge"
}
:log info ("NAVSPOT: WAN " . $WANIF . " isolada com sucesso")

# 3. CONFIGURAR INTERNET (WAN)
:if ($WANTYPE = "dhcp") do={
  /ip dhcp-client
  :do { remove [find interface=$WANIF] } on-error={}
  :do { add interface=$WANIF disabled=no comment="navspot-wan" } on-error={}
  :log info "NAVSPOT: DHCP client configurado na WAN"
}

/system identity set name="${embarcacao.nome}"

# 4. CRIAR BRIDGE DO HOTSPOT
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={ add name="bridge1" comment="navspot" }
enable [find name="bridge1"]

:log info "NAVSPOT: Bridge1 criada"

# 5. PORTAS LAN - COM VERIFICACAO DUPLA (NUNCA ADICIONA WAN)
/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={
  # Verificacao 1: Porta existe?
  :if ([:len [/interface find name=$p]] > 0) do={
    # Verificacao 2: NAO e a WAN?
    :local portName $p
    :local wanName $WANIF
    :if ($portName != $wanName) do={
      :do { remove [find interface=$p] } on-error={}
      :do { add bridge="bridge1" interface=$p comment="navspot-lan" } on-error={}
      :log info ("NAVSPOT: " . $p . " -> bridge1")
    } else={
      :log warning ("NAVSPOT: " . $p . " e WAN - IGNORADA!")
    }
  }
}

:delay 2s

# 6. VERIFICACAO DE SEGURANCA - WAN NAO PODE ESTAR NA BRIDGE
:if ([:len [/interface bridge port find interface=$WANIF]] > 0) do={
  :log error "NAVSPOT: WAN detectada na bridge! Removendo..."
  /interface bridge port remove [find interface=$WANIF]
}

# 7. REDE IP
/ip address
:do { remove [find interface="bridge1" comment~"navspot"] } on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot"

/ip pool
:do { remove [find name="hs-pool-navspot"] } on-error={}
add name="hs-pool-navspot" ranges=${poolStart}-${poolEnd}

/ip dhcp-server network
:do { remove [find comment~"navspot"] } on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot"

/ip dhcp-server
:do { remove [find name="dhcp-navspot"] } on-error={}
add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no

/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# 8. NAT (EXPLICITO NA WAN)
/ip firewall nat
:do { remove [find comment="navspot-nat"] } on-error={}
add chain=srcnat out-interface=$WANIF action=masquerade comment="navspot-nat"

:log info ("NAVSPOT: NAT configurado na " . $WANIF)

# ... resto do script (hotspot, walled garden, sync, scheduler)

:log info "NAVSPOT: Bootstrap v5.1 concluido com sucesso!"
:log info ("NAVSPOT: WAN=" . $WANIF . " ISOLADA. Hotspot funcional.")
`
}
```

---

## Comparação v5.0 vs v5.1

| Aspecto | v5.0 | v5.1 |
|---------|------|------|
| Remoção WAN de bridges | 1 tentativa | Loop em TODAS as bridges |
| Verificação pós-remoção | Nenhuma | Abort se WAN ainda em bridge |
| Loop LAN | Comparação simples | Variáveis locais + comparação |
| Verificação final | Nenhuma | Remove WAN emergencialmente se detectada |
| Logs | Básicos | Detalhados em cada etapa |
| Versão | 5.0 | 5.1 |

---

## Checklist de Validação

O script v5.1 DEVE conter:

- [ ] Loop `:foreach bp in=[find interface=$WANIF]` para remover WAN de bridges
- [ ] Verificação `:if ([:len [/interface bridge port find interface=$WANIF]] > 0)` com abort
- [ ] Variáveis locais `:local portName $p` e `:local wanName $WANIF` antes da comparação
- [ ] Verificação de segurança APÓS o loop de LAN
- [ ] NAT com `out-interface=$WANIF`
- [ ] Logs detalhados em cada etapa crítica

---

## Seção Técnica

### Problema de Sintaxe RouterOS v6

O RouterOS v6 tem problemas com comparações diretas de variáveis em certos contextos. A solução é criar variáveis locais explícitas:

```routeros
# v5.0 (pode falhar):
:if ($p != $WANIF) do={...}

# v5.1 (mais seguro):
:local portName $p
:local wanName $WANIF
:if ($portName != $wanName) do={...}
```

### Remoção Robusta de Bridges

O comando v5.0 pode não funcionar se houver múltiplas entradas:

```routeros
# v5.0 (pode falhar):
:do { remove [find interface=$WANIF] } on-error={}

# v5.1 (loop explícito):
:foreach bp in=[find interface=$WANIF] do={
  :do { remove $bp } on-error={}
}
```

