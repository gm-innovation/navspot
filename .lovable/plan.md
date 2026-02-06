

# Plano: NAVSPOT v7.1.40 - Ajustes Finos de Robustez

## Resumo dos 3 Ajustes Solicitados

| Ajuste | Problema | Solução |
|--------|----------|---------|
| 1. Guardrail RouterOS | `[:find ...]` pode ser sensível em ROS 7 | Usar operador regex `~` com pattern `^networkBase\.` |
| 2. Migração WiFi | Interfaces WifiWave2 podem travar se movidas rapidamente | Adicionar `:delay 1s` após remover da bridge antiga |
| 3. WAN na Bridge | ether1 pode estar na bridge padrão em alguns firmwares | Remover ether1 de qualquer bridge antes de configurar DHCP |

---

## Arquivos a Modificar

### 1. supabase/functions/mikrotik-script-generator/index.ts

---

### Mudança 1: VERSION = "7.1.40" (linha 8)

```typescript
const VERSION = "7.1.40"
```

---

### Mudança 2: Adicionar função isBlockedNetwork (após linha 56)

```typescript
/**
 * v7.1.40: Block reserved networks that conflict with MikroTik factory defaults
 */
function isBlockedNetwork(cidr: string): { blocked: boolean; reason: string } {
  if (!cidr) return { blocked: false, reason: '' }
  const net = cidr.split('/')[0].trim()
  const base = net.replace(/\.\d+$/, '')
  if (base === '192.168.88' || net === '192.168.88.0' || net.startsWith('192.168.88.')) {
    return { 
      blocked: true, 
      reason: 'Rede 192.168.88.0/24 e reservada para gerencia do MikroTik (Winbox). Use outra rede, ex: 10.10.10.0/24.' 
    }
  }
  return { blocked: false, reason: '' }
}
```

---

### Mudança 3: Adicionar validação de rede bloqueada (após linha 167, após verificar hotspot existe)

```typescript
// v7.1.40: Validate network is not reserved
const networkValidation = isBlockedNetwork(hotspot.rede)
if (networkValidation.blocked) {
  console.error(`[script-generator ${VERSION}] Blocked network: ${hotspot.rede}`)
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: networkValidation.reason 
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

---

### Mudança 4: Ajuste no Script RouterOS - Guardrail com Regex (após IDENTIDADE, antes de CRIAR BRIDGE1)

Inserir entre linhas 330-331 (após IDENTIDADE):

```routeros
# 4.5. GUARDRAIL: Verificar conflito de rede ANTES de criar bridge1 (v7.1.40)
:local networkBase "${networkBase}"
:local conflict false
:foreach addr in=[/ip address find] do={
:local addrStr [/ip address get $addr address]
# v7.1.40: Usar operador regex para match robusto em ROS 7
:if ($addrStr ~ ("^" . $networkBase . "\\\\.")) do={
:set conflict true
:log error ("NAVSPOT v${VERSION}: CONFLITO - IP " . $addrStr . " ja existe na faixa " . $networkBase . ".x!")
}
}
:if ($conflict = true) do={
:log error "NAVSPOT v${VERSION}: ABORTANDO - Rede em uso"
:log error "NAVSPOT v${VERSION}: Altere a rede do hotspot no painel para outra faixa"
:error "NAVSPOT_ABORT_NETWORK_CONFLICT"
}
:log info "NAVSPOT v${VERSION}: Guardrail OK - nenhum conflito de rede"
```

Nota sobre o regex:
- `^` = inicio da string
- `$networkBase` = ex: "10.10.10"
- `\\.` = ponto literal escapado (em RouterOS, `\\` dentro de aspas = `\`)
- O pattern final sera algo como `^10\.10\.10\.` que casa com IPs tipo 10.10.10.1, 10.10.10.254, etc.

---

### Mudança 5: Remover ether1 de qualquer bridge ANTES de configurar WAN (seção 3)

Inserir no início da seção 3 (linha 326, antes de wanConfig):

```routeros
# 3. CONFIGURAR WAN
# v7.1.40: Garantir que WAN nao esta em nenhuma bridge (alguns firmwares incluem ether1 na bridge padrao)
:do { /interface bridge port remove [find interface=${wanInterface}] } on-error={}
```

O código completo da seção 3 fica:

```routeros
# 3. CONFIGURAR WAN
# v7.1.40: Garantir que WAN nao esta em nenhuma bridge
:do { /interface bridge port remove [find interface=${wanInterface}] } on-error={}
${wanConfig}
```

---

### Mudança 6: Adicionar delay na migração WiFi (nova seção 9.5)

Inserir após seção 9 (MIGRAR PORTAS LAN), antes de seção 10 (HOTSPOT MINIMO):

```routeros
# 9.5. MIGRAR INTERFACES WIFI (v7.1.40 - hAP ax² / WifiWave2)
:log info "NAVSPOT v${VERSION}: Verificando interfaces WiFi..."
:local wifiCount 0
# Tentar WifiWave2 (ROS 7.x - hAP ax²)
:do {
:foreach i in=[/interface wifi find] do={
:local wName [/interface wifi get $i name]
:log info ("NAVSPOT: Detectada interface WifiWave2: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
# v7.1.40: Delay para kernel processar mudanca de estado do radio
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
# Fallback: Tentar wireless legacy (ROS 6.x)
:if ($wifiCount = 0) do={
:do {
:foreach i in=[/interface wireless find] do={
:local wName [/interface wireless get $i name]
:log info ("NAVSPOT: Detectada interface wireless legacy: " . $wName)
:do { /interface bridge port remove [find interface=$wName] } on-error={}
:delay 1s
:do { /interface bridge port add bridge=bridge1 interface=$wName comment="navspot-lan" } on-error={}
:set wifiCount ($wifiCount + 1)
}
} on-error={}
}
:if ($wifiCount > 0) do={
:log info ("NAVSPOT: " . $wifiCount . " interface(s) WiFi migrada(s) para bridge1")
} else={
:log info "NAVSPOT: Nenhuma interface WiFi detectada"
}
```

---

## 2. supabase/functions/mikrotik-scripts/index.ts

### Mudança: VERSION = "7.1.40" (linha 38)

```typescript
/**
 * mikrotik-scripts v7.1.40
```

---

## 3. src/pages/Embarcacoes.tsx

### Mudança: VERSION = "7.1.40" (linha 67)

```typescript
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.40");
```

---

## 4. Frontend - Validação de Rede Reservada

### src/components/forms/EmbarcacaoForm.tsx

**Mudanças:**
- Linhas 76, 117, 124: Mudar default de `"192.168.88.0/24"` para `"10.10.10.0/24"`
- Adicionar função `validateRede` antes do componente
- Adicionar validação no `handleSubmit`
- Adicionar tooltip de aviso no campo rede

### src/components/forms/HotspotForm.tsx

**Mudanças similares:**
- Defaults de `"192.168.88.0/24"` para `"10.10.10.0/24"`
- Validação no submit

### src/hooks/useEmbarcacoesWithHotspot.ts

**Mudança:**
- Linha 39: `rede: hotspot?.rede || '10.10.10.0/24'`

---

## Fluxo do Script v7.1.40 (Ordem Final)

```text
# 0. CLEANUP
  - Remove arquivos, scripts, schedulers, hotspot, pools, addresses
  - Remove bridge1
  - NAO TOCA na ether2 nem na bridge padrao

# 1. VALIDACAO WAN
  - Verifica se ether1 existe

# 2. CONFIGURAR DNS

# 3. CONFIGURAR WAN
  - >>> NOVO: Remove ether1 de qualquer bridge <<<
  - Configura DHCP client

# 4. IDENTIDADE

# 4.5. GUARDRAIL (v7.1.40)
  - >>> NOVO: Usa regex ~ para match robusto <<<
  - Verifica se existe IP na faixa do hotspot
  - Se SIM: :error "NAVSPOT_ABORT_NETWORK_CONFLICT"
  - Se NAO: continua

# 5. CRIAR BRIDGE1

# 6. CONFIGURAR REDE (10.10.10.0/24)

# 7. NAT

# 8. GERENCIA WINBOX

# 9. MIGRAR PORTAS LAN (ether3-5 → bridge1)

# 9.5. MIGRAR WIFI (v7.1.40)
  - Detecta WifiWave2 (ROS 7) ou wireless (ROS 6)
  - >>> NOVO: Delay 1s entre remove e add <<<
  - Move wifi1, wifi2 → bridge1

# 10. HOTSPOT MINIMO

# 11. TOKEN

# 12-15. ESTABILIZACAO, DETECTAR ROS, FETCH, SYNC
```

---

## Resultado Esperado

### Logs no hAP ax² (ROS 7)

```text
NAVSPOT v7.1.40: Iniciando bootstrap ULTRA-THIN...
NAVSPOT v7.1.40: Cleanup concluido
NAVSPOT: Interface WAN (ether1) validada
NAVSPOT: DNS configurado (8.8.8.8, 1.1.1.1)
NAVSPOT v7.1.40: Guardrail OK - nenhum conflito de rede
NAVSPOT: Bridge1 criada
NAVSPOT: Rede IP configurada (10.10.10.0/24)
NAVSPOT: NAT configurado
NAVSPOT: Gerencia configurada
NAVSPOT: ether5 migrada
NAVSPOT: ether4 migrada
NAVSPOT: ether3 migrada
NAVSPOT v7.1.40: Verificando interfaces WiFi...
NAVSPOT: Detectada interface WifiWave2: wifi1
NAVSPOT: Detectada interface WifiWave2: wifi2
NAVSPOT: 2 interface(s) WiFi migrada(s) para bridge1
NAVSPOT v7.1.40: Hotspot criado
...
NAVSPOT v7.1.40: BOOTSTRAP ULTRA-THIN CONCLUIDO!
```

### Estado Final

```text
+------------------------+
|     hAP ax² (ROS 7)    |
+------------------------+
| ether1 (WAN)           | → Internet (DHCP) - FORA de qualquer bridge
| ether2                  | → Bridge padrao (192.168.88.1 - gerencia intocada)
| ether3-5 + wifi1/wifi2  | → bridge1 (10.10.10.1/24 + Hotspot)
+------------------------+
```

---

## Migração de Dados SQL (Executar Manualmente)

```sql
-- 1. Adicionar colunas de auditoria
ALTER TABLE public.hotspots  
ADD COLUMN IF NOT EXISTS rede_prev text NULL,  
ADD COLUMN IF NOT EXISTS migration_state text DEFAULT 'idle';

-- 2. Migrar hotspots com rede conflitante
UPDATE public.hotspots  
SET rede_prev = rede,  
    rede = '10.10.10.0/24',  
    migration_state = 'pending'  
WHERE rede LIKE '192.168.88%';
```

---

## Checklist Pre-Deploy

| Item | Status |
|------|--------|
| DB: migrar hotspot para 10.10.10.0/24 | Pendente (SQL manual) |
| Backend: validacao bloqueando 192.168.88.x | A implementar |
| Backend: guardrail RouterOS com regex | A implementar |
| Backend: remover WAN de bridge antes de DHCP | A implementar |
| Backend: delay 1s na migracao WiFi | A implementar |
| Backend: deteccao WifiWave2 + fallback wireless | A implementar |
| Frontend: defaults 10.10.10.0/24 | A implementar |
| Frontend: validacao no submit | A implementar |
| Testes em hAP ax² (ROS 7) | Apos deploy |

