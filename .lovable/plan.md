

# Correções Críticas no MikroTik Script Generator

## Resumo das Falhas Identificadas

| # | Falha | Severidade | Status Atual |
|---|-------|------------|--------------|
| 1 | Variável global não persiste entre scripts | CRÍTICA | Linha 288 usa `:global` |
| 2 | Firewall rules sem `in-interface` | MÉDIA | Linhas 557-562 |
| 3 | Arquivo executed.txt pode não existir | BAIXA | Linhas 616-619 |
| 4 | Action processor pode duplicar ações | MÉDIA | Linhas 859-860 |
| 5 | Walled Garden IP sem `in-interface` | MÉDIA | Linhas 461-471 |
| 6 | Layer 7 protocols múltiplos (CPU) | MÉDIA | Linhas 486-491 |
| 7 | Rate-limit vazio no profile | BAIXA | Já está correto |
| 8 | Scheduler start-time incorreto | MÉDIA | Linhas 916-921 |
| 9 | Sem validação de IP | BAIXA | Linha 296 |
| 10 | Sem validação de resposta sync | BAIXA | Linhas 625-668 |

---

## Correções Detalhadas

### Falha 1 (CRÍTICA): Variável Global Não Persiste

**Problema:** `:global navspotInterface` definida no script principal não é acessível nos scripts `navspot-sync` e `navspot-health` porque cada script roda em escopo isolado.

**Solução:** Salvar interface em arquivo e ler nos outros scripts.

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Alteração 1a - Salvar interface em arquivo (após linha 288):**

```routeros
:global navspotInterface $targetIf

# NOVO: Salvar interface em arquivo para persistência entre scripts
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
:log info ("NAVSPOT: Interface salva em arquivo: " . $targetIf)
```

**Alteração 1b - Ler interface no navspot-health (linhas 871-879):**

```routeros
add name="navspot-health" owner=admin policy=read,write,test source={
  :local hotspotName "hs-${hotspotSlug}"
  :local dhcpName "dhcp-${hotspotSlug}"
  :local issues 0
  
  # CORRIGIDO: Ler interface do arquivo em vez de variável global
  :local navspotInterface ""
  :do {
    :set navspotInterface [/file get "navspot-interface.txt" contents]
  } on-error={
    :log error "NAVSPOT: Arquivo navspot-interface.txt nao encontrado!"
    :set navspotInterface ""
  }
  
  # Check if interface still exists
  :if ([:len $navspotInterface] > 0 && [/interface find name=$navspotInterface] = "") do={
    :log error ("NAVSPOT: Interface " . $navspotInterface . " desapareceu!")
    :set issues ($issues + 1)
  }
  ...
}
```

**Alteração 1c - Ler interface nas regras de firewall (linhas 520-554):**

O firewall usa `$navspotInterface` durante a execução do script principal, então ainda funciona. Mas para robustez, vamos usar `$targetIf` diretamente (já está no escopo).

---

### Falha 2 (MÉDIA): Firewall Rules em Ordem Frágil

**Problema:** Regras de gateway e isolation sem `in-interface`, podem afetar outras interfaces.

**Solução:** Adicionar `in-interface=$targetIf` nas regras de forward.

**Alteração (linhas 556-562):**

```routeros
# Allow access to gateway - with in-interface for security
add chain=forward action=accept in-interface=$targetIf src-address=${networkCidr} dst-address=${gateway} \
    comment="navspot-security-allow-gateway"

# Client Isolation - prevent clients from reaching each other
add chain=forward action=drop in-interface=$targetIf src-address=${networkCidr} dst-address=${networkCidr} \
    comment="navspot-security-client-isolation"
```

---

### Falha 3 (BAIXA): Arquivo executed.txt Pode Não Existir

**Problema:** O script tenta ler arquivo que pode não existir na primeira execução.

**Solução:** Verificar existência antes de ler.

**Alteração (linhas 614-619 do navspot-sync):**

```routeros
# Read executed actions from file (with existence check)
:local executedActions ""
:if ([/file find name="navspot-executed.txt"] != "") do={
  :set executedActions [/file get "navspot-executed.txt" contents]
  /file remove "navspot-executed.txt"
}
```

---

### Falha 4 (MÉDIA): Action Processor Pode Duplicar Ações

**Problema:** Se houver erro durante processamento, arquivo não é removido e ações são reprocessadas.

**Solução:** Mover remoção do arquivo para dentro do bloco de sucesso, após salvar executed.

**Alteração (linhas 853-864):**

```routeros
# Save executed actions for next sync
:if ([:len $executed] > 0) do={
  /file print file="navspot-executed" where name=""
  :delay 1s
  /file set "navspot-executed.txt" contents=$executed
  
  # CORRIGIDO: Remover arquivo de ações APENAS após salvar executed com sucesso
  :do { /file remove $actionFile } on-error={}
  :log info ("NAVSPOT: Processadas " . [:len $executed] . " acoes")
} else={
  # Nenhuma ação executada, mas ainda remover arquivo para evitar reprocessamento
  :do { /file remove $actionFile } on-error={}
}
```

---

### Falha 5 (MÉDIA): Walled Garden IP Sem Interface

**Problema:** Regras de DNS/DHCP/NTP sem `in-interface` permitem tráfego de qualquer interface.

**Solução:** Adicionar `in-interface` para restringir ao hotspot.

**Alteração (linhas 460-471):**

```routeros
# DNS (UDP + TCP) - restrito à interface do hotspot
add in-interface=$targetIf dst-address=0.0.0.0/0 dst-port=53 protocol=udp action=accept comment="navspot-${hotspotSlug}-dns"
add in-interface=$targetIf dst-address=0.0.0.0/0 dst-port=53 protocol=tcp action=accept comment="navspot-${hotspotSlug}-dns-tcp"

# DHCP - restrito à interface do hotspot
add in-interface=$targetIf dst-address=0.0.0.0/0 dst-port=67-68 protocol=udp action=accept comment="navspot-${hotspotSlug}-dhcp"

# NTP - restrito à interface do hotspot
add in-interface=$targetIf dst-address=0.0.0.0/0 dst-port=123 protocol=udp action=accept comment="navspot-${hotspotSlug}-ntp"

# ICMP - restrito à interface do hotspot
add in-interface=$targetIf protocol=icmp action=accept comment="navspot-${hotspotSlug}-icmp"
```

---

### Falha 6 (MÉDIA): Layer 7 Protocols Sobrecarregam CPU

**Problema:** 17+ Layer 7 protocols diferentes, cada um inspecionando todos os pacotes.

**Solução:** Consolidar em um único regexp ou limitar quantidade.

**Alteração (linhas 476-507):**

```typescript
// Consolidate blocked domains into fewer L7 protocols (max 5 patterns per protocol)
if (blockedDomains.size > 0) {
  script += `
# ============================================
# Layer 7 Protocols (Consolidated for Performance)
# ============================================
/ip firewall layer7-protocol
:foreach l in=[find comment~"navspot-${hotspotSlug}"] do={ remove $l }

`
  // Group domains into chunks of 5 for consolidated regexp
  const domainsArray = Array.from(blockedDomains)
  const chunkSize = 5
  let l7Index = 0
  
  for (let i = 0; i < domainsArray.length; i += chunkSize) {
    const chunk = domainsArray.slice(i, i + chunkSize)
    const patterns = chunk.map(d => d.replace(/^\*\./, '').replace(/\./g, '\\\\.')).join('|')
    script += `add name="navspot-block-${l7Index}" regexp="^.*(${patterns}).*$" comment="navspot-${hotspotSlug}"\n`
    l7Index++
  }
  
  // Single firewall rule per consolidated L7 protocol
  script += `
/ip firewall filter
:foreach f in=[find comment~"navspot-${hotspotSlug}-block"] do={ remove $f }

`
  for (let i = 0; i < Math.ceil(domainsArray.length / chunkSize); i++) {
    script += `add chain=forward layer7-protocol="navspot-block-${i}" action=drop comment="navspot-${hotspotSlug}-block-group-${i}"\n`
  }
}
```

---

### Falha 8 (MÉDIA): Scheduler start-time Incorreto

**Problema:** `start-time=00:00:30` significa "execute às 00:00:30 todos os dias", não "30s após boot".

**Solução:** Remover start-time e confiar no delay inicial + interval.

**Alteração (linhas 914-921):**

```routeros
/system scheduler
:do { remove [find name="navspot-sync-scheduler"] } on-error={}
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" \
    policy=read,write,test comment="NAVSPOT sync every ${hotspot.sync_interval_minutes}min"

:do { remove [find name="navspot-health-scheduler"] } on-error={}
add name="navspot-health-scheduler" interval=1h on-event="/system script run navspot-health" \
    policy=read,write,test comment="NAVSPOT health check every hour"
```

---

### Falha 9 (BAIXA): Sem Validação de IP

**Problema:** Não verifica se o IP foi realmente adicionado.

**Solução:** Adicionar verificação com log de erro.

**Alteração (linhas 293-296):**

```routeros
/ip address
:do { remove [find interface=$targetIf comment~"navspot"] } on-error={}
:do { remove [find address="${gateway}/24"] } on-error={}
:do {
  add address=${gateway}/24 interface=$targetIf comment="navspot-${hotspotSlug}"
  :log info "NAVSPOT: IP ${gateway}/24 adicionado com sucesso"
} on-error={
  :log error "NAVSPOT: ERRO ao adicionar IP ${gateway}/24 - hotspot pode nao funcionar!"
}
```

---

### Falha 10 (BAIXA): Sem Validação de Resposta Sync

**Problema:** Se a URL estiver errada ou resposta inválida, falha silenciosamente.

**Solução:** Validar tamanho da resposta.

**Alteração (linhas 625-668 do navspot-sync):**

```routeros
:do {
  :local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$payload http-header-field="Content-Type: application/json" output=user as-value]
  :local response ($result->"data")
  
  # NOVO: Validar resposta
  :if ([:len $response] < 10) do={
    :log warning "NAVSPOT: Resposta vazia ou invalida do servidor"
  } else={
    :log info "NAVSPOT: Sync completed successfully"
    
    # Extract pending_actions_pipe from JSON response
    # ... resto do código ...
  }
  
} on-error={
  :log warning "NAVSPOT: Sync failed - will retry on next interval"
}
```

---

## Arquivos a Modificar

| Arquivo | Alterações |
|---------|------------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Todas as 10 correções |

---

## Resumo das Mudanças

```text
+----------------------------------+
|      ANTES (Problemático)        |
+----------------------------------+
| :global navspotInterface         | <- Não persiste entre scripts
| Firewall sem in-interface        | <- Afeta outras interfaces
| L7 protocols individuais         | <- Alto uso de CPU
| start-time=00:00:30              | <- Não é delay após boot
+----------------------------------+

+----------------------------------+
|      DEPOIS (Corrigido)          |
+----------------------------------+
| /file navspot-interface.txt      | <- Persiste entre scripts
| Firewall com in-interface        | <- Restrito ao hotspot
| L7 protocols consolidados        | <- Menor uso de CPU
| Sem start-time (interval only)   | <- Funciona corretamente
+----------------------------------+
```

---

## Benefícios

1. **Scripts funcionais**: navspot-sync e navspot-health agora conseguem ler a interface corretamente
2. **Segurança melhorada**: Firewall restrito à interface do hotspot
3. **Performance**: L7 protocols consolidados reduzem carga de CPU
4. **Confiabilidade**: Schedulers funcionam corretamente após boot
5. **Rastreabilidade**: Logs mais claros para debugging

