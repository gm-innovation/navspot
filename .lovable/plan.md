

# Correção v4.2 - WAN Segura e Sync Robusto

## Problemas Identificados

| Problema | Causa | Consequência |
|----------|-------|--------------|
| WAN "adivinhada" incorretamente | Script assume portas fixas (ether2-5) na bridge sem saber qual é WAN | Coloca porta de internet na bridge → MikroTik perde internet |
| NAT com `!bridge1` | Regra frágil que não especifica WAN | Pode não funcionar corretamente em algumas topologias |
| Script sync com string escapada | `source="..."` com escapes complexos | RouterOS marca como Invalid (I) |

---

## Mudanças Necessárias

### 1. Adicionar Campo `wan_interface` na Tabela `hotspots`

Novo campo obrigatório para especificar qual interface é a WAN (ex: `ether1`, `sfp1`, `wlan1`).

```sql
ALTER TABLE hotspots ADD COLUMN wan_interface text NOT NULL DEFAULT 'ether1';
```

### 2. Atualizar Formulário de Hotspot

Adicionar campo para selecionar a interface WAN no formulário.

| Campo | Valores | Descrição |
|-------|---------|-----------|
| `wan_interface` | ether1, sfp1, lte1, wlan1, pppoe-out1 | Interface que recebe internet |

### 3. Reescrever Script Generator (v4.2)

O novo script DEVE:

1. **Receber WAN_IF como parâmetro** (não adivinhar)
2. **Validar que WAN_IF existe** antes de continuar
3. **NUNCA adicionar WAN_IF na bridge**
4. **NAT explícito na WAN** (não usar `!bridge1`)
5. **Script sync com bloco `source={...}`** em vez de string escapada

---

## Estrutura do Script v4.2

```text
1. Declarar variável WAN_IF (do banco de dados)
2. Validar WAN_IF existe (abort se não)
3. Garantir DHCP client na WAN (se necessário)
4. Criar bridge1
5. Adicionar apenas portas LAN (excluindo WAN_IF explicitamente)
6. IP/Pool/DHCP/DNS
7. Hotspot Profile + Server
8. NAT com out-interface=$WAN_IF (explícito)
9. Walled Garden básico
10. Token file
11. Script sync com source={...} (bloco, não string)
12. Scheduler
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar | Script v4.2 com WAN segura |
| `src/components/forms/HotspotForm.tsx` | Modificar | Adicionar campo wan_interface |
| `src/hooks/useHotspots.ts` | Modificar | Incluir wan_interface nos tipos |
| DB Migration | Criar | Adicionar coluna wan_interface |

---

## Detalhes da Implementação

### Migration SQL

```sql
-- Adicionar campo wan_interface
ALTER TABLE hotspots ADD COLUMN wan_interface text NOT NULL DEFAULT 'ether1';

-- Comentário para documentação
COMMENT ON COLUMN hotspots.wan_interface IS 'Interface WAN do MikroTik (ex: ether1, sfp1). NUNCA será adicionada à bridge.';
```

### Interface Hotspot Atualizada

```typescript
interface Hotspot {
  id: string
  nome: string
  interface_wifi: string
  wan_interface: string  // NOVO - obrigatório
  rede: string
  sync_token: string
  sync_interval_minutes: number
  max_usuarios: number | null
}
```

### Script Generator v4.2 - Lógica Principal

```routeros
# Variável WAN (do banco)
:local WAN_IF "{{WAN_INTERFACE}}"

# Validação - ABORT se WAN inválida
:if ([:len $WAN_IF] = 0) do={
  :log error "NAVSPOT: WAN_IF vazio. Abortando."
  :error "WAN_IF obrigatorio"
}
:if ([:len [/interface find name=$WAN_IF]] = 0) do={
  :log error ("NAVSPOT: WAN_IF nao existe: " . $WAN_IF)
  :error "WAN_IF invalido"
}
:log info ("NAVSPOT: WAN preservada = " . $WAN_IF)

# Garantir DHCP client na WAN
/ip dhcp-client
:if ([:len [find interface=$WAN_IF]] = 0) do={
  add interface=$WAN_IF disabled=no comment="navspot-wan-dhcp"
}

# Bridge LAN
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}

# Portas LAN (NUNCA inclui WAN_IF)
:local LAN_IFS {"ether2";"ether3";"ether4";"ether5"}
/interface bridge port
:foreach p in=$LAN_IFS do={
  :if ([:len [/interface find name=$p]] > 0) do={
    :if ($p != $WAN_IF) do={
      :do {remove [find interface=$p]} on-error={}
      :do {add bridge="bridge1" interface=$p comment="navspot-lan"} on-error={}
    }
  }
}

# NAT EXPLÍCITO NA WAN
/ip firewall nat
:do {remove [find comment="navspot-masquerade"]} on-error={}
add chain=srcnat out-interface=$WAN_IF action=masquerade comment="navspot-masquerade"
```

### Script Sync com Bloco (não string escapada)

```routeros
# Script sync usando source={...} (bloco)
/system script
:do {remove [find name="navspot-sync"]} on-error={}
add name="navspot-sync" policy=read,write,policy,test source={
:local token [/file get "navspot-token.txt" contents]
:local syncUrl "{{SYNC_URL}}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
  :local u [get $a user]
  :local m [get $a mac-address]
  :local bi [get $a bytes-in]
  :local bo [get $a bytes-out]
  :set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
:local body ("{\"sync_token\":\"" . $token . "\",\"active_users_csv\":\"" . $users . "\"}")
:do {/tool fetch url=$syncUrl mode=https http-method=post http-data=$body output=user as-value} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"
}
```

---

## Formulário Atualizado

Novo campo no HotspotForm:

```tsx
<div className="grid grid-cols-4 items-center gap-4">
  <Label htmlFor="wan_interface" className="text-right">
    Interface WAN
  </Label>
  <Select
    value={formData.wan_interface}
    onValueChange={(value) => handleChange("wan_interface", value)}
  >
    <SelectTrigger className="col-span-3">
      <SelectValue placeholder="Selecione a interface WAN" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="ether1">ether1 (padrão)</SelectItem>
      <SelectItem value="sfp1">sfp1</SelectItem>
      <SelectItem value="lte1">lte1 (4G)</SelectItem>
      <SelectItem value="wlan1">wlan1 (WiFi WAN)</SelectItem>
      <SelectItem value="pppoe-out1">pppoe-out1 (PPPoE)</SelectItem>
    </SelectContent>
  </Select>
</div>
```

---

## Comparação v4.1 vs v4.2

| Aspecto | v4.1 | v4.2 |
|---------|------|------|
| WAN | Ignorada (assume fixo) | Parâmetro obrigatório |
| Validação WAN | Nenhuma | Abort se inválida |
| Bridge ports | Fixo ether2-5 | Exclui WAN_IF explicitamente |
| NAT | `out-interface=!bridge1` | `out-interface=$WAN_IF` |
| Script sync | `source="..."` (string) | `source={...}` (bloco) |
| Risco de derrubar internet | ALTO | ZERO |

---

## Checklist de Validação

O script v4.2 DEVE:

- [ ] Declarar `:local WAN_IF "{{valor}}"`
- [ ] Validar que WAN_IF existe
- [ ] Garantir DHCP client na WAN (se não existir)
- [ ] Ter condição `$p != $WAN_IF` no loop de portas
- [ ] NAT com `out-interface=$WAN_IF`
- [ ] Script sync com `source={...}` (não string)

---

## Seção Técnica

### Código TypeScript do Gerador v4.2

```typescript
function generateBootstrapScript(
  hotspot: Hotspot,
  embarcacao: Embarcacao,
  supabaseUrl: string
): string {
  const syncUrl = `${supabaseUrl}/functions/v1/mikrotik-sync`
  const networkParts = hotspot.rede.split('/')
  const networkBase = networkParts[0].replace(/\.\d+$/, '')
  const gateway = `${networkBase}.1`
  const networkCidr = hotspot.rede.includes('/') ? hotspot.rede : `${hotspot.rede}/24`
  const poolStart = `${networkBase}.10`
  const poolEnd = `${networkBase}.254`
  const hotspotSlug = hotspot.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const syncIntervalMinutes = hotspot.sync_interval_minutes || 5
  const wanInterface = hotspot.wan_interface || 'ether1'

  return `# ============================================
# NAVSPOT Bootstrap Script v4.2
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# WAN: ${wanInterface}
# Generated: ${new Date().toISOString()}
# ============================================

# === VARIÁVEL WAN (CRÍTICO) ===
:local WAN_IF "${wanInterface}"

# === VALIDAÇÃO WAN ===
:if ([:len $WAN_IF] = 0) do={
  :log error "NAVSPOT: WAN_IF vazio. Abortando."
  :error "WAN_IF obrigatorio"
}
:if ([:len [/interface find name=$WAN_IF]] = 0) do={
  :log error ("NAVSPOT: WAN_IF nao existe: " . $WAN_IF)
  :error "WAN_IF invalido"
}
:log info ("NAVSPOT: WAN preservada = " . $WAN_IF)

/system identity set name="${embarcacao.nome}"
:log info "NAVSPOT: Iniciando bootstrap..."

# === DHCP CLIENT NA WAN (SE NECESSÁRIO) ===
/ip dhcp-client
:if ([:len [find interface=$WAN_IF]] = 0) do={
  add interface=$WAN_IF disabled=no comment="navspot-wan-dhcp"
}

# === BRIDGE ===
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}
enable [find name="bridge1"]

# === BRIDGE PORTS (NUNCA INCLUI WAN) ===
:local LAN_IFS {"ether2";"ether3";"ether4";"ether5"}
/interface bridge port
:foreach p in=$LAN_IFS do={
  :if ([:len [/interface find name=$p]] > 0) do={
    :if ($p != $WAN_IF) do={
      :do {remove [find interface=$p]} on-error={}
      :do {add bridge="bridge1" interface=$p comment="navspot-lan"} on-error={}
    }
  }
}

:delay 2s

# === IP ADDRESS ===
/ip address
:do {remove [find interface="bridge1" comment~"navspot"]} on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot-${hotspotSlug}"

# === IP POOL ===
/ip pool
:do {remove [find name="hs-pool-${hotspotSlug}"]} on-error={}
add name="hs-pool-${hotspotSlug}" ranges=${poolStart}-${poolEnd}

# === DHCP NETWORK ===
/ip dhcp-server network
:do {remove [find comment~"navspot"]} on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

# === DHCP SERVER ===
/ip dhcp-server
:do {remove [find name="dhcp-${hotspotSlug}"]} on-error={}
add name="dhcp-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" disabled=no

# === DNS ===
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# === HOTSPOT PROFILE ===
/ip hotspot profile
:do {remove [find name="hsprof-${hotspotSlug}"]} on-error={}
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap

:log info "NAVSPOT: Profile criado"

# === HOTSPOT SERVER ===
/ip hotspot
:do {remove [find name="hs-${hotspotSlug}"]} on-error={}
add name="hs-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no

:log info "NAVSPOT: Hotspot ativo"

# === NAT EXPLÍCITO NA WAN ===
/ip firewall nat
:do {remove [find comment="navspot-masquerade"]} on-error={}
add chain=srcnat out-interface=$WAN_IF action=masquerade comment="navspot-masquerade"

:log info "NAVSPOT: NAT configurado (WAN=" . $WAN_IF . ")"

# === WALLED GARDEN BÁSICO ===
/ip hotspot walled-garden
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-system-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-system-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-system-dhcp"

:log info "NAVSPOT: Walled garden configurado"

# === TOKEN FILE ===
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

:log info "NAVSPOT: Token salvo"

# === SCRIPT DE SYNC (BLOCO, NÃO STRING) ===
/system script
:do {remove [find name="navspot-sync"]} on-error={}
add name="navspot-sync" policy=read,write,policy,test source={
:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
:local u [get $a user]
:local m [get $a mac-address]
:local bi [get $a bytes-in]
:local bo [get $a bytes-out]
:set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
:local body ("{\\\"sync_token\\\":\\\"" . $token . "\\\",\\\"active_users_csv\\\":\\\"" . $users . "\\\"}")
:do {/tool fetch url=$syncUrl mode=https http-method=post http-data=$body output=user as-value} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"
}

:log info "NAVSPOT: Script de sync criado"

# === SCHEDULER ===
/system scheduler
:do {remove [find name="navspot-sync-scheduler"]} on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap v4.2 concluido!"
:log info "NAVSPOT: WAN=" . $WAN_IF . " preservada. Hotspot funcional."
`
}
```

