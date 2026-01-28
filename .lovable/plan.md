

# Configuracao Automatica de Bridge Ports (v3.6)

## Problema Identificado

O script v3.5 atual:

| Status | Componente |
|--------|------------|
| Cria a bridge1 | Automaticamente se nao existir |
| Configura IP, DHCP, Hotspot na bridge1 | OK |
| Configura firewall, walled garden, sync | OK |
| NAO adiciona portas fisicas (ether2-5) na bridge1 | FALHA CRITICA |
| NAO garante que a bridge1 esta habilitada | FALHA |
| NAO remove conflitos de portas em outras bridges | FALHA |

**Resultado:** O hotspot fica "no ar", sem nenhuma porta fisica conectada. Clientes nao conseguem se conectar via cabo.

---

## Solucao Proposta

Adicionar uma secao "Automatic Bridge Port Assignment" que:

1. Garante que bridge1 existe e esta habilitada
2. Remove conflitos (portas em outras bridges)
3. Adiciona ether2, ether3, ether4, ether5 na bridge1
4. Habilita as interfaces fisicas

### Topologia Padrao Assumida

```text
ether1 → WAN/Internet (bridgeLocal ou direto ao modem)
ether2 a ether5 → Hotspot LAN (bridge1)
wlan1/wlan2 → WiFi integrado (se existir, tambem na bridge)
```

---

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar secao de bridge ports entre linhas 302-303 |

---

## Localizacao no Codigo

Inserir o novo bloco **DEPOIS** da secao "Save interface to file" (linha 302) e **ANTES** da secao "IP Address Configuration" (linha 304).

---

## Codigo a Adicionar (RouterOS)

```routeros
# ============================================
# Automatic Bridge Port Assignment
# ============================================
# Topologia: ether1 = WAN/Internet, ether2-5 = Hotspot LAN
# Garante que bridge1 existe, esta habilitada e com portas conectadas

:log info "NAVSPOT: Configurando portas fisicas..."

# Ensure bridge1 exists and is enabled
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={
    add name=bridge1 comment="navspot-hotspot-bridge"
    :log info "NAVSPOT: bridge1 criada"
}
enable [find name="bridge1"]
:log info "NAVSPOT: bridge1 ativada"

# Remove ether2-5 from any existing bridge (prevent conflicts)
/interface bridge port
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        remove [find interface=$port]
        :log info ("NAVSPOT: " . $port . " removida de bridges anteriores")
    } on-error={}
}

# Add ether2-5 to bridge1 (Hotspot LAN)
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        add bridge=bridge1 interface=$port comment="navspot-hotspot-port"
        :log info ("NAVSPOT: " . $port . " adicionada a bridge1")
    } on-error={
        :log warning ("NAVSPOT: Falha ao adicionar " . $port . " (pode nao existir neste modelo)")
    }
}

# Also add wlan interfaces to bridge1 if they exist and are NOT the target interface
:foreach wlan in={"wlan1";"wlan2"} do={
    :if ([/interface find name=$wlan] != "") do={
        :if ($wlan != $targetIf) do={
            :do {
                remove [find interface=$wlan]
            } on-error={}
            :do {
                add bridge=bridge1 interface=$wlan comment="navspot-hotspot-port"
                :log info ("NAVSPOT: " . $wlan . " adicionada a bridge1")
            } on-error={}
        }
    }
}

# Enable physical interfaces
/interface ethernet
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        enable [find name=$port]
    } on-error={}
}

:log info "NAVSPOT: Configuracao de portas concluida"
```

---

## Codigo TypeScript a Adicionar

Inserir apos a linha 302 (`console.log` do interface salvo em arquivo):

```typescript
  // Bridge Port Assignment - Ensure physical ports are connected to bridge1
  script += `
# ============================================
# Automatic Bridge Port Assignment
# ============================================
# Topologia: ether1 = WAN/Internet, ether2-5 = Hotspot LAN
# Garante que bridge1 existe, esta habilitada e com portas conectadas

:log info "NAVSPOT: Configurando portas fisicas..."

# Ensure bridge1 exists and is enabled
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={
    add name=bridge1 comment="navspot-hotspot-bridge"
    :log info "NAVSPOT: bridge1 criada"
}
enable [find name="bridge1"]
:log info "NAVSPOT: bridge1 ativada"

# Remove ether2-5 from any existing bridge (prevent conflicts)
/interface bridge port
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        remove [find interface=\$port]
        :log info ("NAVSPOT: " . \$port . " removida de bridges anteriores")
    } on-error={}
}

# Add ether2-5 to bridge1 (Hotspot LAN)
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        add bridge=bridge1 interface=\$port comment="navspot-hotspot-port"
        :log info ("NAVSPOT: " . \$port . " adicionada a bridge1")
    } on-error={
        :log warning ("NAVSPOT: Falha ao adicionar " . \$port . " (pode nao existir neste modelo)")
    }
}

# Also add wlan interfaces to bridge1 if they exist and are NOT the target interface
:foreach wlan in={"wlan1";"wlan2"} do={
    :if ([/interface find name=\$wlan] != "") do={
        :if (\$wlan != \$targetIf) do={
            :do {
                remove [find interface=\$wlan]
            } on-error={}
            :do {
                add bridge=bridge1 interface=\$wlan comment="navspot-hotspot-port"
                :log info ("NAVSPOT: " . \$wlan . " adicionada a bridge1")
            } on-error={}
        }
    }
}

# Enable physical interfaces
/interface ethernet
:foreach port in={"ether2";"ether3";"ether4";"ether5"} do={
    :do {
        enable [find name=\$port]
    } on-error={}
}

:log info "NAVSPOT: Configuracao de portas concluida"

`
```

---

## Atualizacao do Log Final

Atualizar a secao final (linha 990-995) para incluir informacoes sobre as portas:

```typescript
:log info "============================================"
:log info "NAVSPOT: Configuracao completa para ${hotspot.nome}"
:log info "NAVSPOT: ${tripulantes.length} usuarios, ${perfis.length} perfis"
:log info ("NAVSPOT: Interface: " . \\$navspotInterface . ", Gateway: ${gateway}")
:log info "NAVSPOT: Portas Hotspot: ether2, ether3, ether4, ether5"
:log info "NAVSPOT: Porta WAN: ether1 (excluida do hotspot)"
:log info "NAVSPOT: Sync a cada ${hotspot.sync_interval_minutes} minutos"
:log info "============================================"
```

---

## Versao do Script

Atualizar a versao de **3.5** para **3.6** na linha 233:

```
# Version: 3.6 - Bridge Port Assignment (physical port connection)
```

---

## Comportamento Apos Correcao

| Antes (v3.5) | Depois (v3.6) |
|--------------|---------------|
| bridge1 existe mas sem portas | bridge1 com ether2-5 conectadas |
| DHCP nao responde clientes | DHCP responde em todas as portas LAN |
| Portal cativo nao abre | Portal funciona via ether2-5 |
| WiFi integrado nao funciona | wlan1/wlan2 na bridge (se existirem) |

---

## Fluxo do Script v3.6

```text
1. Detecta interface (bridge1 prioritario)
2. Salva interface em arquivo
3. [NOVO] Configura bridge1 e conecta ether2-5
4. Configura IP na bridge1
5. Configura DHCP
6. Configura Hotspot
7. Configura firewall
8. Configura sync
9. Log final com portas configuradas
```

---

## Seguranca

- **ether1** permanece excluida (WAN)
- Apenas portas LAN (ether2-5) sao adicionadas
- Conflitos com outras bridges sao removidos automaticamente
- Portas inexistentes (modelos menores) sao ignoradas graciosamente

