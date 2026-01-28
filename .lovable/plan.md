

# Script Bootstrap v5.0 - Producao Definitiva

## Problemas Identificados no v4.2 Atual

| Problema | Linha | Causa |
|----------|-------|-------|
| Script sync com `source={...}` ainda falha | 279-294 | Escapes `\\` dentro de bloco `{}` sao problematicos no RouterOS v6 |
| WAN nao e removida de bridges existentes | - | Se MikroTik tiver bridge anterior, WAN pode ficar presa |
| Nao diferencia DHCP de PPPoE | - | Campo `wan_type` nao existe no banco |
| Portas LAN fixas | 194 | Nao permite customizar quais portas sao LAN |

---

## Mudancas Necessarias

### 1. Adicionar Campo `wan_type` no Banco

```sql
ALTER TABLE hotspots ADD COLUMN wan_type text NOT NULL DEFAULT 'dhcp';
COMMENT ON COLUMN hotspots.wan_type IS 'Tipo de conexao WAN: dhcp ou pppoe';
```

### 2. Atualizar Formulario HotspotForm.tsx

Adicionar campo para selecionar tipo de WAN:

| Campo | Valores | Descricao |
|-------|---------|-----------|
| `wan_type` | dhcp, pppoe | Tipo de conexao de internet |

### 3. Reescrever Script Generator (v5.0)

O script v5.0 DEVE:

1. **Declarar variaveis no topo** (WAN_IF, WAN_TYPE, etc)
2. **Validar WAN existe** e abortar se nao
3. **REMOVER WAN de qualquer bridge existente** (antes de criar bridge1)
4. **NAT explicito na WAN** (nao usar !bridge1)
5. **Script sync inline com \r\n** (nao usar bloco source={})
6. **Configurar DHCP ou PPPoE** conforme wan_type

---

## Estrutura do Script v5.0

```text
1. Cabecalho + Versao
2. Variaveis (WAN_IF, WAN_TYPE, DNS_NAME, TOKEN)
3. Validacao WAN existe
4. REMOVER WAN de qualquer bridge (NOVO - critico)
5. Configurar DHCP client OU PPPoE na WAN
6. Criar bridge1
7. Adicionar apenas portas LAN (excluindo WAN)
8. IP/Pool/DHCP/DNS
9. Hotspot Profile + Server
10. NAT explicito na WAN
11. Walled Garden basico
12. Token file
13. Script sync inline (nao bloco)
14. Scheduler
15. Log final
```

---

## Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/migrations/` | Criar | Adicionar coluna wan_type |
| `src/components/forms/HotspotForm.tsx` | Modificar | Adicionar campo wan_type |
| `supabase/functions/mikrotik-script-generator/index.ts` | Reescrever | Script v5.0 com correcoes criticas |

---

## Detalhes da Implementacao

### Migration SQL

```sql
-- Adicionar campo wan_type
ALTER TABLE hotspots ADD COLUMN wan_type text NOT NULL DEFAULT 'dhcp';
COMMENT ON COLUMN hotspots.wan_type IS 'Tipo de conexao WAN: dhcp ou pppoe';
```

### Interface Hotspot Atualizada

```typescript
interface Hotspot {
  id: string
  nome: string
  interface_wifi: string
  wan_interface: string
  wan_type: string  // NOVO - 'dhcp' ou 'pppoe'
  rede: string
  sync_token: string
  sync_interval_minutes: number
  max_usuarios: number | null
}
```

### Formulario Atualizado

Novo campo no HotspotForm:

```tsx
<div className="grid grid-cols-4 items-center gap-4">
  <Label htmlFor="wan_type" className="text-right">
    Tipo de Internet
  </Label>
  <Select
    value={formData.wan_type}
    onValueChange={(value) => handleChange("wan_type", value)}
  >
    <SelectTrigger className="col-span-3">
      <SelectValue placeholder="Selecione o tipo" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="dhcp">DHCP (padrao)</SelectItem>
      <SelectItem value="pppoe">PPPoE (credenciais no router)</SelectItem>
    </SelectContent>
  </Select>
</div>
```

---

## Script Generator v5.0 - Codigo Completo

O novo gerador vai produzir um script que:

1. **Remove a WAN de qualquer bridge anterior**:
```routeros
/interface bridge port remove [find interface=$WANIF]
```

2. **Configura DHCP ou PPPoE na WAN**:
```routeros
:if ($WANTYPE = "dhcp") do={
  /ip dhcp-client
  :do { add interface=$WANIF disabled=no comment="navspot-wan" } on-error={}
}
```

3. **Usa script sync inline com \r\n** (nao bloco):
```routeros
/system script add name="navspot-sync" policy=read,write,policy,test source=":local token [/file get \"navspot-token.txt\" contents]\r\n..."
```

### Template Completo do Script v5.0

```routeros
# ============================================
# NAVSPOT Bootstrap v5.0 - PRODUCAO
# ============================================

# --- VARIAVEIS DO SISTEMA ---
:local WANIF "{{WAN_INTERFACE}}"
:local WANTYPE "{{WAN_TYPE}}"
:local DNSNAME "{{DNS_NAME}}"
:local TOKEN "{{SYNC_TOKEN}}"

:log info "NAVSPOT: Iniciando instalacao segura v5.0..."

# 1. VALIDACAO DE SEGURANCA
:if ([:len [/interface find name=$WANIF]] = 0) do={
  :log error ("NAVSPOT: Erro critico - Interface WAN " . $WANIF . " nao existe!")
  :error "Abortando: WAN inexistente"
}

# 2. REMOVER WAN DE QUALQUER BRIDGE EXISTENTE (CRITICO)
/interface bridge port
:do { remove [find interface=$WANIF] } on-error={}
:log info ("NAVSPOT: WAN " . $WANIF . " removida de bridges")

# 3. CONFIGURAR INTERNET (WAN)
:if ($WANTYPE = "dhcp") do={
  /ip dhcp-client
  :do { remove [find interface=$WANIF comment~"navspot"] } on-error={}
  :do { add interface=$WANIF disabled=no comment="navspot-wan" } on-error={}
  :log info "NAVSPOT: DHCP client configurado na WAN"
}

# 4. CRIAR BRIDGE DO HOTSPOT
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={ add name="bridge1" comment="navspot" }
enable [find name="bridge1"]

# 5. PORTAS LAN (NUNCA INCLUI WAN)
/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={
  :if ($p != $WANIF) do={
    :if ([:len [/interface find name=$p]] > 0) do={
      :do { remove [find interface=$p] } on-error={}
      :do { add bridge="bridge1" interface=$p comment="navspot-lan" } on-error={}
    }
  }
}

:delay 2s

# 6. REDE IP
/ip address
:do { remove [find interface="bridge1" comment~"navspot"] } on-error={}
add address={{GATEWAY}}/24 interface=bridge1 comment="navspot"

/ip pool
:do { remove [find name="hs-pool-navspot"] } on-error={}
add name="hs-pool-navspot" ranges={{POOL_START}}-{{POOL_END}}

/ip dhcp-server network
:do { remove [find comment~"navspot"] } on-error={}
add address={{NETWORK_CIDR}} gateway={{GATEWAY}} dns-server={{GATEWAY}} comment="navspot"

/ip dhcp-server
:do { remove [find name="dhcp-navspot"] } on-error={}
add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no

/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"

# 7. NAT (EXPLICITO NA WAN)
/ip firewall nat
:do { remove [find comment="navspot-nat"] } on-error={}
add chain=srcnat out-interface=$WANIF action=masquerade comment="navspot-nat"

:log info ("NAVSPOT: NAT configurado na " . $WANIF)

# 8. HOTSPOT
/ip hotspot profile
:do { remove [find name="hsprof-navspot"] } on-error={}
add name="hsprof-navspot" hotspot-address={{GATEWAY}} dns-name=$DNSNAME html-directory=flash/hotspot login-by=http-chap,http-pap

/ip hotspot
:do { remove [find name="hs-navspot"] } on-error={}
add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no

:log info "NAVSPOT: Hotspot ativo"

# 9. WALLED GARDEN BASICO
/ip hotspot walled-garden
:do { remove [find comment~"navspot"] } on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do { remove [find comment~"navspot"] } on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 10. TOKEN FILE
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents=$TOKEN

:log info "NAVSPOT: Token salvo"

# 11. SYNC SCRIPT (INLINE COM \r\n - NAO BLOCO)
/system script
:do { remove [find name="navspot-sync"] } on-error={}
add name="navspot-sync" policy=read,write,policy,test source=":local token [/file get \"navspot-token.txt\" contents]\r\n:local syncUrl \"{{API_URL}}\"\r\n:local users \"\"\r\n/ip hotspot active\r\n:foreach a in=[find] do={\r\n:local u [get \$a user]\r\n:local m [get \$a mac-address]\r\n:local bi [get \$a bytes-in]\r\n:local bo [get \$a bytes-out]\r\n:set users (\$users . \$u . \",\" . \$m . \",\" . \$bi . \",\" . \$bo . \";\")\r\n}\r\n:local body (\"{\\\"sync_token\\\":\\\"\" . \$token . \"\\\",\\\"active_users_csv\\\":\\\"\" . \$users . \"\\\"}\")\r\n:do {/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$body output=user as-value} on-error={:log warning \"NAVSPOT-SYNC: Falha\"}\r\n:log info \"NAVSPOT-SYNC: OK\""

:log info "NAVSPOT: Script de sync criado"

# 12. SCHEDULER
/system scheduler
:do { remove [find name="navspot-sync-scheduler"] } on-error={}
add name="navspot-sync-scheduler" interval={{SYNC_INTERVAL}}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap v5.0 concluido com sucesso!"
:log info ("NAVSPOT: WAN=" . $WANIF . " preservada. Hotspot funcional.")
```

---

## Comparacao v4.2 vs v5.0

| Aspecto | v4.2 | v5.0 |
|---------|------|------|
| Remove WAN de bridges | Nao | Sim (critico) |
| Campo wan_type | Nao | Sim (dhcp/pppoe) |
| Script sync | `source={...}` bloco | Inline com `\r\n` |
| Validacao WAN | Basica | Completa + abort |
| Escapes no sync | Problematicos | Corrigidos |
| NAT | `out-interface=$WAN_IF` | `out-interface=$WANIF` |

---

## Checklist de Validacao

O script v5.0 DEVE conter:

- [ ] `:local WANIF "{{valor}}"` no topo
- [ ] `:local WANTYPE "{{valor}}"` no topo
- [ ] Validacao `[:len [/interface find name=$WANIF]]`
- [ ] `remove [find interface=$WANIF]` para limpar WAN de bridges
- [ ] NAT com `out-interface=$WANIF`
- [ ] Script sync inline (nao bloco `source={}`)
- [ ] `\r\n` como separador de linhas no sync

---

## Secao Tecnica

### Codigo TypeScript do Gerador v5.0

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
  const wanType = hotspot.wan_type || 'dhcp'
  const dnsName = `${hotspotSlug}.navspot.local`

  // Script sync inline (corrigido - sem blocos)
  const syncScript = `:local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\"sync_token\\\\\\":\\\\\\"\\". \\$token . \\"\\\\\\",...`
  
  return `# Script v5.0...`
}
```

### Correcao do Script Sync

A diferenca critica entre v4.2 e v5.0:

**v4.2 (ERRADO - bloco com escapes quebrados):**
```routeros
add name="navspot-sync" source={
:local body ("{\\"sync_token\\":\\"" . $token . "\\",...")
}
```

**v5.0 (CORRETO - inline com \r\n):**
```routeros
add name="navspot-sync" source=":local token [/file get \"navspot-token.txt\" contents]\r\n:local body (\"{\\\"sync_token\\\":\\\"\" . $token . \"\\\",...\")"
```

A versao inline evita completamente os problemas de parsing do RouterOS v6 com blocos `{}`.

