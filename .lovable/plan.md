
# Plano v6.9.21: Correção de Whitelists + Reset Automático de Quota

## Problemas Identificados

### Problema 1: Reset de Quota Não Funciona

**Diagnóstico:**
- O `quota_reset_at` do tripulante Alexandre Silva é `2026-02-02 15:09:55 UTC`
- Hoje é `2026-02-03` - deveria ter resetado à meia-noite!
- Consumo atual: 65 MB (não foi resetado)

**Causa Raiz:**
A lógica de reset de quota (linhas 555-571 do mikrotik-sync) só é executada quando o usuário está na lista de `active_users`. 

Logs mostram: `"active_users_csv":""` - o campo está **VAZIO**!

O reset só ocorre durante o processamento de usuários ativos conectados. Se o usuário não estava conectado no momento do sync após a meia-noite, a quota não foi resetada.

---

### Problema 2: Whitelists Não Funcionam ("bloquear_tudo" muito restritivo)

**Diagnóstico:**
- O perfil "Tripulação Googlemarine" tem `modo_acesso: bloquear_tudo`
- As regras de whitelist (Email, Google Workspace, Notícias) estão cadastradas e ativas
- O backend está coletando 17 domínios de whitelist corretamente
- Gmail funciona (é uma lista template), mas Notícias (uol.com.br, r7.com.br, g1.globo.com) não funcionam

**Causa Raiz 1 - Ordem das Regras Invertida:**

O código no action processor usa `place-before=$ftPos` duas vezes:

```routeros
# Primeiro: adiciona ACCEPT (fica antes do fasttrack)
/ip firewall filter add ... action=accept dst-address-list=NAVSPOT-ALLOWED ... place-before=$ftPos

# Depois: adiciona DROP (place-before coloca ANTES do ACCEPT!)
/ip firewall filter add ... action=drop ... place-before=$ftPos
```

Resultado no firewall:
1. DROP (bloqueia tudo) ← Processada primeiro!
2. ACCEPT (permite lista) ← Nunca alcançada!

**Causa Raiz 2 - Resolução DNS Inadequada:**

O código resolve apenas UM IP por domínio, mas sites como g1.globo.com usam múltiplos IPs e CDNs. O acesso pode funcionar para um IP e falhar para outro.

**Causa Raiz 3 - Timeout de 1 dia nos IPs:**

```routeros
/ip firewall address-list add ... timeout=1d
```

Após 24h, os IPs expiram e o domínio fica bloqueado até a próxima sincronização com mudança de hash.

---

## Solução Proposta

### 1. Reset de Quota Independente do Usuário Ativo

Criar uma verificação de reset de quota que roda **a cada sync**, mesmo sem usuários ativos.

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Mudança:** Adicionar função `resetExpiredQuotas()` que verifica TODOS os tripulantes da embarcação, não apenas os ativos.

```typescript
// Nova função a ser adicionada (após linha 182)
async function resetExpiredQuotas(
  supabase: ReturnType<typeof createClient>,
  embarcacaoId: string,
  timezone: string
): Promise<number> {
  const now = new Date().toISOString()
  
  // Buscar tripulantes com quota_reset_at que precisa reset
  const { data: tripulantes } = await supabase
    .from('tripulantes')
    .select(`
      id, bytes_consumidos, quota_reset_at,
      perfis_velocidade(limite_dados_mb, quota_periodo)
    `)
    .eq('embarcacao_id', embarcacaoId)
    .gt('bytes_consumidos', 0) // Só verificar quem tem consumo
  
  if (!tripulantes || tripulantes.length === 0) return 0
  
  let resetCount = 0
  
  for (const t of tripulantes) {
    const perfil = t.perfis_velocidade as { limite_dados_mb: number | null; quota_periodo: string } | null
    if (!perfil?.limite_dados_mb || !perfil.quota_periodo) continue
    
    if (shouldResetQuota(t.quota_reset_at, perfil.quota_periodo, timezone)) {
      await supabase
        .from('tripulantes')
        .update({
          bytes_consumidos: 0,
          quota_reset_at: now,
          status: 'ativo', // Reativar se estava bloqueado por quota
          bloqueio_motivo: null,
          bloqueado_at: null
        })
        .eq('id', t.id)
        .eq('status', 'bloqueado')
        .eq('bloqueio_motivo', 'quota_exceeded')
      
      // Reset consumo mesmo se não estava bloqueado
      await supabase
        .from('tripulantes')
        .update({
          bytes_consumidos: 0,
          quota_reset_at: now
        })
        .eq('id', t.id)
      
      resetCount++
    }
  }
  
  return resetCount
}
```

**Chamar no início do processamento (após linha 462):**

```typescript
// v6.9.21: Reset quotas expiradas para TODOS os tripulantes
if (embarcacao) {
  const resetCount = await resetExpiredQuotas(supabase, hotspot.embarcacao_id, effectiveTimezone)
  if (resetCount > 0) {
    console.log(`[mikrotik-sync] v6.9.21: Reset quota for ${resetCount} tripulante(s)`)
  }
}
```

---

### 2. Corrigir Ordem das Regras de Firewall

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Problema:** `place-before` na mesma posição inverte a ordem.

**Solução:** Criar ACCEPT primeiro, salvar posição, criar DROP após.

**Código atual (linhas 495-504):**
```routeros
:if ([:len [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]] = 0) do={
:local ftPos [/ip firewall filter find where action=fasttrack-connection]
:if ([:len $ftPos] = 0) do={:set ftPos 0}
# Create ACCEPT rule for allowed list first
/ip firewall filter add chain=forward action=accept dst-address-list=NAVSPOT-ALLOWED comment="NAVSPOT-ALLOW-ACCEPT" place-before=$ftPos
:log info "NAVSPOT: Allow accept rule created"
# Then create DROP for everything else (will be after the accept due to place-before logic)
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" place-before=$ftPos
:log info "NAVSPOT: Allow master drop rule created"
}
```

**Código corrigido:**
```routeros
:if ([:len [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]] = 0) do={
:local ftPos [/ip firewall filter find where action=fasttrack-connection]
:if ([:len $ftPos] = 0) do={:set ftPos 0}
# v6.9.21: First create DROP (master block), then ACCEPT before it
# This ensures correct order: ACCEPT -> DROP -> fasttrack
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" place-before=$ftPos
:log info "NAVSPOT: Allow master drop rule created"
# Now add ACCEPT BEFORE the drop (so it's processed first)
:local dropPos [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]
/ip firewall filter add chain=forward action=accept dst-address-list=NAVSPOT-ALLOWED comment="NAVSPOT-ALLOW-ACCEPT" place-before=$dropPos
:log info "NAVSPOT: Allow accept rule created (before drop)"
}
```

---

### 3. Melhorar Resolução de Domínios para Whitelists

**Problema:** Sites usam múltiplos IPs/CDNs. Resolver apenas um IP é insuficiente.

**Solução:** Usar regras de Layer 7 (content match) em vez de apenas address-list para domínios.

**Código atual (linhas 506-518):**
```routeros
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:if ([:len [/ip firewall address-list find list="NAVSPOT-ALLOWED" address=$resolvedIp]] = 0) do={
/ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=1d comment=("navspot-allow-" . $domain)
:log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
}
}
} on-error={
:log warning ("NAVSPOT: Failed to resolve allowed domain " . $domain)
}
```

**Código corrigido:**
```routeros
# v6.9.21: Dual approach - DNS resolution + Walled Garden allow (mais robusto)
# 1. Adicionar ao Walled Garden como ALLOW (funciona pré-login)
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain)
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
}
# 2. Tentar resolver IP para address-list (backup pós-login)
:do {
:local resolvedIp [:resolve $domain]
:if ([:len $resolvedIp] > 0) do={
:if ([:len [/ip firewall address-list find list="NAVSPOT-ALLOWED" address=$resolvedIp]] = 0) do={
/ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=none comment=("navspot-allow-" . $domain)
:log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
}
}
} on-error={
:log warning ("NAVSPOT: DNS failed for " . $domain . " - using Walled Garden only")
}
```

**Mudanças importantes:**
- Adiciona domínio ao **Walled Garden** com `action=allow` (funciona com wildcards e hostnames)
- Mantém address-list como backup
- Remove `timeout=1d` - IPs ficam permanentes até próxima sincronização
- Walled Garden é mais robusto para hostnames/CDNs

---

### 4. Forçar Reavaliação das Regras de Firewall

Como a correção só será aplicada em novos syncs, precisamos forçar o hash a mudar para que as regras sejam reaplicadas.

**Ação necessária:** Limpar o `firewall_rules_hash` do hotspot para forçar reenvio.

Adicionar no script de recovery e/ou expor como função.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Adicionar `resetExpiredQuotas()` e chamá-la no início do processamento |
| `supabase/functions/mikrotik-script-generator/index.ts` | Corrigir ordem das regras ACCEPT/DROP + melhorar resolução de domínios com Walled Garden |

---

## Resumo das Correções

1. **Reset de Quota Diário**: Agora verifica TODOS os tripulantes da embarcação a cada sync, não apenas os ativos. Isso garante que a quota seja resetada à meia-noite mesmo que o usuário não esteja online.

2. **Ordem das Regras de Firewall**: Corrigida a ordem para garantir que ACCEPT seja processado antes de DROP no modo "bloquear_tudo".

3. **Resolução de Domínios**: Usar abordagem dual com Walled Garden (mais confiável para hostnames) + Address-List (backup para IPs). Remove timeout que expirava os IPs após 24h.

---

## Teste Após Implementação

### No Painel:
1. Verificar que o consumo do tripulante foi resetado (deveria ser 0 MB ou próximo)
2. Gerar novo script de Recovery e importar no MikroTik

### No MikroTik:
```routeros
# Verificar ordem das regras de firewall
/ip firewall filter print where comment~"NAVSPOT"
# Deve mostrar: NAVSPOT-ALLOW-ACCEPT (accept) ANTES de NAVSPOT-ALLOW-MASTER (drop)

# Verificar Walled Garden
/ip hotspot walled-garden print where comment~"navspot-allow"
# Deve mostrar os domínios das whitelists

# Verificar address-list
/ip firewall address-list print where list=NAVSPOT-ALLOWED

# Testar acesso
/tool fetch url="https://g1.globo.com" output=none
```

---

## Versão

Atualizar versão para `v6.9.21` em todos os scripts e logs afetados.
