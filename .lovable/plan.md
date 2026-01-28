

# Correcao do Script Bootstrap v4.1 - Ultra Minimo

## Problema Identificado

O script v4.0 ainda e muito complexo para o RouterOS v6:

| Problema | Causa |
|----------|-------|
| Script nao cria hotspot server | Parsing para antes de chegar nessa secao |
| Falta NAT masquerade | Nao estava no script |
| Scripts com `source={...}` complexos | RouterOS v6 nao parseia bem blocos grandes |
| `:toarray` no action processor | Sintaxe problematica no v6 |
| Scripts de health/action processor | Desnecessarios no bootstrap |

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Gerar script v4.1 ultra minimo |

---

## Mudancas Criticas

### Removidos do Bootstrap (v4.0 -> v4.1)

| Item | Motivo |
|------|--------|
| Action Processor | Complexo demais, sera via API direta |
| Health Check Script | Desnecessario no bootstrap |
| `:toarray` | Sintaxe problematica no v6 |
| Blocos `source={...}` grandes | Limite de parsing do v6 |

### Adicionados no v4.1

| Item | Motivo |
|------|--------|
| NAT Masquerade | Essencial para internet funcionar |
| DNS TCP (porta 53) | Alguns resolvers usam TCP |
| Script sync inline com `\r\n` | Formato que RouterOS aceita melhor |
| Logs em cada etapa | Facilita debug |

---

## Estrutura do Script v4.1 (~95 linhas)

```text
1. Header + Version (5 linhas)
2. System Identity (1 linha)
3. Bridge (4 linhas)
4. Bridge Ports (6 linhas)
5. IP Address (3 linhas)
6. IP Pool (3 linhas)
7. DHCP Network (3 linhas)
8. DHCP Server (3 linhas)
9. DNS (1 linha)
10. Hotspot Profile (3 linhas)
11. Hotspot Server (3 linhas) <-- CRITICO
12. NAT Masquerade (3 linhas) <-- NOVO
13. Walled Garden Sistema (6 linhas)
14. Token File (3 linhas)
15. Sync Script (3 linhas) <-- SIMPLIFICADO
16. Scheduler (3 linhas)
17. Logs Finais (2 linhas)

TOTAL: ~55 linhas (vs ~130 no v4.0)
```

---

## Detalhes da Implementacao

### 1. Header Atualizado

```typescript
return `# ============================================
# NAVSPOT Bootstrap Script v4.1
# Hotspot: ${hotspot.nome}
# Embarcacao: ${embarcacao.nome}
# Generated: ${new Date().toISOString()}
# ============================================

/system identity set name="${embarcacao.nome}"

:log info "NAVSPOT: Iniciando bootstrap..."
```

### 2. Bridge Simplificada

```typescript
# === 1. BRIDGE ===
/interface bridge
:if ([:len [find name="bridge1"]] = 0) do={add name="bridge1" comment="navspot"}
enable [find name="bridge1"]

# === 2. BRIDGE PORTS ===
/interface bridge port
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {remove [find interface=$p]} on-error={}}
:foreach p in={"ether2";"ether3";"ether4";"ether5"} do={:do {add bridge="bridge1" interface=$p comment="navspot"} on-error={}}

:delay 2s
```

### 3. IP/DHCP/DNS

```typescript
# === 3. IP ADDRESS ===
/ip address
:do {remove [find address="${gateway}/24"]} on-error={}
add address=${gateway}/24 interface=bridge1 comment="navspot-${hotspotSlug}"

# === 4. IP POOL ===
/ip pool
:do {remove [find name="hs-pool-${hotspotSlug}"]} on-error={}
add name="hs-pool-${hotspotSlug}" ranges=${poolStart}-${poolEnd}

# === 5. DHCP NETWORK ===
/ip dhcp-server network
:do {remove [find gateway="${gateway}"]} on-error={}
add address=${networkCidr} gateway=${gateway} dns-server=${gateway} comment="navspot-${hotspotSlug}"

# === 6. DHCP SERVER ===
/ip dhcp-server
:do {remove [find name="dhcp-${hotspotSlug}"]} on-error={}
add name="dhcp-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" disabled=no

# === 7. DNS ===
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

:log info "NAVSPOT: Rede configurada"
```

### 4. Hotspot (CRITICO)

```typescript
# === 8. HOTSPOT PROFILE ===
/ip hotspot profile
:do {remove [find name="hsprof-${hotspotSlug}"]} on-error={}
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap

:log info "NAVSPOT: Profile criado"

# === 9. HOTSPOT SERVER ===
/ip hotspot
:do {remove [find name="hs-${hotspotSlug}"]} on-error={}
add name="hs-${hotspotSlug}" interface=bridge1 address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no

:log info "NAVSPOT: Hotspot ativo"
```

### 5. NAT Masquerade (NOVO)

```typescript
# === 10. NAT (MASQUERADE) ===
/ip firewall nat
:do {remove [find comment="navspot-masquerade"]} on-error={}
add chain=srcnat out-interface=!bridge1 action=masquerade comment="navspot-masquerade"

:log info "NAVSPOT: NAT configurado"
```

### 6. Walled Garden Basico

```typescript
# === 11. WALLED GARDEN BASICO ===
/ip hotspot walled-garden
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-host="navspot.local" action=allow comment="navspot-system"
add dst-host="*.supabase.co" action=allow comment="navspot-system"

/ip hotspot walled-garden ip
:do {remove [find comment~"navspot-system"]} on-error={}
add dst-port=53 protocol=udp action=accept comment="navspot-system-dns"
add dst-port=53 protocol=tcp action=accept comment="navspot-system-dns-tcp"
add dst-port=67-68 protocol=udp action=accept comment="navspot-system-dhcp"

:log info "NAVSPOT: Walled garden basico configurado"
```

### 7. Token File

```typescript
# === 12. TOKEN FILE ===
/file print file="navspot-token.txt" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

:log info "NAVSPOT: Token salvo"
```

### 8. Script de Sync (SIMPLIFICADO - inline com \r\n)

```typescript
# === 13. SCRIPT DE SYNC ===
/system script
:do {remove [find name="navspot-sync"]} on-error={}
add name="navspot-sync" policy=read,write,policy,test source=":local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\"sync_token\\\\\\":\\\\\\"" . \\$token . "\\\\\\",\\\\\\"active_users_csv\\\\\\":\\\\\\"" . \\$users . \\"\\\\\\"}\\"\\r\\n:do {/tool fetch url=\\$syncUrl mode=https http-method=post http-data=\\$body output=user as-value} on-error={:log warning \\"NAVSPOT-SYNC: Falha\\"}\\r\\n:log info \\"NAVSPOT-SYNC: OK\\""

:log info "NAVSPOT: Script de sync criado"
```

### 9. Scheduler

```typescript
# === 14. SCHEDULER ===
/system scheduler
:do {remove [find name="navspot-sync-scheduler"]} on-error={}
add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup

:log info "NAVSPOT: Scheduler configurado"

:log info "NAVSPOT: Bootstrap concluido com sucesso!"
:log info "NAVSPOT: Hotspot funcional. Configure usuarios e regras via API."
```

---

## Comparacao v4.0 vs v4.1

| Aspecto | v4.0 | v4.1 |
|---------|------|------|
| Linhas | ~130 | ~55 |
| NAT Masquerade | Nao | Sim |
| Action Processor | Sim (complexo) | Nao (via API) |
| Health Check | Sim | Nao |
| Blocos source={} | Multiplos | 1 (inline) |
| `:toarray` | Sim | Nao |
| Logs de progresso | Poucos | Em cada etapa |

---

## Checklist de Validacao

O script v4.1 DEVE conter estas linhas criticas:

```routeros
# Hotspot Server (linha ~35)
add name="hs-${slug}" interface=bridge1 address-pool="hs-pool-${slug}" profile="hsprof-${slug}" disabled=no

# NAT Masquerade (linha ~40)
add chain=srcnat out-interface=!bridge1 action=masquerade comment="navspot-masquerade"

# Token File (linha ~48)
/file set "navspot-token.txt" contents="${token}"

# Sync Script (linha ~52)
add name="navspot-sync" policy=read,write,policy,test source="..."
```

---

## Secao Tecnica

### Codigo TypeScript Completo da Funcao

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

  // Script de sync inline (escaped para RouterOS)
  const syncScriptSource = `:local token [/file get \\"navspot-token.txt\\" contents]\\r\\n:local syncUrl \\"${syncUrl}\\"\\r\\n:local users \\"\\"\\r\\n/ip hotspot active\\r\\n:foreach a in=[find] do={\\r\\n:local u [get \\$a user]\\r\\n:local m [get \\$a mac-address]\\r\\n:local bi [get \\$a bytes-in]\\r\\n:local bo [get \\$a bytes-out]\\r\\n:set users (\\$users . \\$u . \\",\\" . \\$m . \\",\\" . \\$bi . \\",\\" . \\$bo . \\";\\")\\r\\n}\\r\\n:local body (\\"{\\\\\\"sync_token\\\\\\":\\\\\\"\\". \\$token . \\"\\\\\\"...`
  
  return `# Script v4.1...`
}
```

### Formato do Script de Sync (inline)

O script de sync e salvo como uma unica string com `\r\n` como separador de linha, que o RouterOS interpreta corretamente. Isso evita os problemas de parsing dos blocos `source={...}`.

