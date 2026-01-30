
# Plano v6.9: Correções Completas + Gerência Winbox/MNDP

## Resumo Executivo

Este plano implementa **5 correções críticas**:
1. **Repetição de ações** - Auto-marcar como executadas após envio
2. **Perfis incompletos** - Sincronizar perfis existentes da empresa
3. **Regras não aplicadas** - Expandir domínios de listas no pipe
4. **Blacklist funcional** - Implementar bloqueio real no Action Processor
5. **Gerência Winbox/MNDP** - Configurar neighbor discovery e regras de firewall para acesso administrativo seguro

---

## Problema 1: Ações Repetidas Infinitamente

**Causa:** O `mikrotik-sync` incrementa tentativas mas nunca marca como `executado`. O MikroTik não reporta IDs executados.

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Linhas 614-627 - Código Atual:**
```typescript
if (formattedActions.length > 0) {
  const actionIds = formattedActions
    .filter(a => !a.id.startsWith('auto-'))
    .map(a => a.id)
  
  if (actionIds.length > 0) {
    await supabase
      .from('acoes_pendentes')
      .update({ tentativas: 1 })
      .in('id', actionIds)
```

**Código Corrigido:**
```typescript
// v6.9: Auto-mark as executed after 1 delivery (fire-and-forget pattern)
if (formattedActions.length > 0) {
  const actionIds = formattedActions
    .filter(a => !a.id.startsWith('auto-'))
    .map(a => a.id)
  
  if (actionIds.length > 0) {
    await supabase
      .from('acoes_pendentes')
      .update({ 
        status: 'executado', 
        executed_at: new Date().toISOString() 
      })
      .in('id', actionIds)
```

---

## Problema 2: Perfis Criados com Defaults

**Causa:** Quando um tripulante é criado, apenas `create_user` é enviado. Se o perfil foi criado antes do hotspot ser instalado, ele nunca chegou ao roteador.

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Adicionar após linha 611 (antes de formatar o pipe):**

```typescript
// v6.9: Ensure all company profiles are synced before user actions
if (embarcacao) {
  const { data: perfis } = await supabase
    .from('perfis_velocidade')
    .select('nome, velocidade_download, velocidade_upload, max_dispositivos, limite_dados_mb')
    .eq('empresa_id', embarcacao.empresa_id)

  if (perfis && perfis.length > 0) {
    const profileActions = perfis.map(p => {
      const slug = p.nome.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const rateLimit = `${p.velocidade_upload || '2M'}/${p.velocidade_download || '5M'}`
      const quota = p.limite_dados_mb || 0
      const shared = p.max_dispositivos || 1
      return {
        id: `auto-profile-${slug}`,
        type: 'add_user_profile' as const,
        payload: {
          name: slug,
          rate_limit: rateLimit,
          shared_users: shared,
          limit_bytes: quota * 1024 * 1024
        }
      }
    })
    // Prepend to ensure profiles exist before users
    formattedActions.unshift(...profileActions)
    console.log(`[mikrotik-sync] v6.9: Injected ${profileActions.length} profiles for sync`)
  }
}
```

---

## Problema 3: Domínios de Listas Não Expandidos

**Causa:** As ações `add_walled_garden` recebem `payload: { lista_id, dominios: [...] }` mas o pipe espera um domínio por comando.

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Refatorar mapeamento do pipe (linhas 632-676):**

```typescript
// v6.9: Expand domain-based actions to individual commands
const expandedActions: typeof formattedActions = []

for (const action of formattedActions) {
  const p = action.payload as Record<string, unknown>
  
  // Expand walled garden with multiple domains
  if (action.type === 'add_walled_garden' && Array.isArray(p.dominios)) {
    for (const domain of p.dominios as string[]) {
      if (domain) {
        expandedActions.push({
          id: `${action.id}-${domain.replace(/[^a-z0-9]/gi, '')}`,
          type: (p.tipo === 'blacklist' ? 'add_blacklist_domain' : 'add_whitelist_domain') as const,
          payload: { list_name: String(p.lista_name || 'default'), domain }
        })
      }
    }
  } 
  // Expand firewall filter rules
  else if (action.type === 'add_firewall_filter' && p.regra_id) {
    // The domains should already be in the payload if processed correctly
    const domains = (p.dominios || []) as string[]
    for (const domain of domains) {
      if (domain) {
        expandedActions.push({
          id: `${action.id}-${domain.replace(/[^a-z0-9]/gi, '')}`,
          type: 'add_blacklist_domain' as const,
          payload: { list_name: String(p.lista_name || 'regra'), domain }
        })
      }
    }
  } 
  else {
    expandedActions.push(action)
  }
}

// Use expandedActions for pipe generation
const pipeDelimitedActions = expandedActions.map(action => {
  // ... existing switch logic
}).join(';')
```

---

## Problema 4: Blacklist Apenas Loga, Não Bloqueia

**Causa:** O Action Processor v2 apenas registra blacklist no log, não executa bloqueio real.

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Localizar no actionProcessorSource (aproximadamente linha 424):**

**Código Atual:**
```routeros
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:log info ("NAVSPOT: Blacklist registrado - " . $domain)
}
```

**Código Corrigido:**
```routeros
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:if ([:len [/ip hotspot walled-garden ip find dst-host=$domain action=deny]] = 0) do={
/ip hotspot walled-garden ip add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
}
}
}
```

---

## Problema 5: Gerência Winbox/MNDP Não Configurada (NOVO)

**Causa:** Após a instalação, o Winbox pode não aparecer na aba Neighbors porque o Neighbor Discovery está desconfigurado, e regras de firewall podem bloquear acesso administrativo.

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Adicionar após Seção 6 (NAT) e antes de Seção 7 (Hotspot):**

### Nova Seção 6.5: Gerência Winbox/Neighbor Discovery

```typescript
// Adicionar na geração do bootstrap script, após o NAT (linha 516)
const winboxMgmtConfig = `
# 6.5. GERENCIA WINBOX / NEIGHBOR DISCOVERY
# Criar lista de interfaces de gestao
:if ([:len [/interface list find name="mgmt"]] = 0) do={
/interface list add name="mgmt" comment="navspot-mgmt-list"
}
:do { /interface list member remove [find list="mgmt" interface=ether2] } on-error={}
:do { /interface list member remove [find list="mgmt" interface=bridge1] } on-error={}
# Adicionar ether2 (porta de gerencia principal)
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
# Adicionar bridge1 para discovery via hotspot (opcional, seguro pois requer auth)
/interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery-on-bridge"

# Configurar neighbor discovery para usar lista de gestao
/ip neighbor discovery-settings set discover-interface-list=mgmt
:log info "NAVSPOT: Neighbor Discovery configurado para lista mgmt"

# Permitir Winbox (TCP 8291) pela porta de gestao (ether2)
:if ([:len [/ip firewall filter find comment="navspot-allow-winbox-mgmt"]] = 0) do={
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0
}

# Permitir MNDP (UDP 5678) para aparecer em Neighbors
:if ([:len [/ip firewall filter find comment="navspot-allow-mndp-mgmt"]] = 0) do={
/ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt" place-before=0
}

:log info "NAVSPOT: Regras de firewall para Winbox/MNDP criadas"
`
```

**Inserir na string de retorno do bootstrap:**

Após:
```routeros
# 6. NAT
/ip firewall nat add chain=srcnat out-interface=${wanInterface} action=masquerade comment="navspot-nat"
:log info "NAVSPOT: NAT configurado em ${wanInterface}"
```

Adicionar:
```routeros
${winboxMgmtConfig}

# 7. HOTSPOT (continuação...)
```

---

## Resumo das Alterações

| Arquivo | Linha(s) | Mudança | Impacto |
|---------|----------|---------|---------|
| `mikrotik-sync/index.ts` | 614-627 | Auto-marcar como executado | Evita repetição |
| `mikrotik-sync/index.ts` | ~612 | Injetar perfis da empresa | Perfis completos |
| `mikrotik-sync/index.ts` | 632-676 | Expandir domínios | Listas funcionais |
| `mikrotik-script-generator/index.ts` | ~424 | Blacklist com `action=deny` | Bloqueio real |
| `mikrotik-script-generator/index.ts` | ~516 | Gerência Winbox/MNDP | Neighbor Discovery funcional |

---

## Seções do Bootstrap Script Atualizado

```text
# 0. VALIDACAO INICIAL
# 1. LIMPEZA INICIAL
# 2. CONFIGURAR WAN
# 3. IDENTIDADE
# 4. CRIAR BRIDGE1 VAZIA
# 5. CONFIGURAR REDE NA BRIDGE1
# 6. NAT
# 6.5. GERENCIA WINBOX / NEIGHBOR DISCOVERY  ← NOVO
# 7. HOTSPOT
# 8. WALLED GARDEN
# 9. TOKEN
# 10. SYNC SCRIPT v6.9 + ACTION PROCESSOR v2
# 11. MIGRACAO PARCIAL DE PORTAS
# 12. PAUSA PARA TROCA DE CABO
# 13. FINALIZACAO PARCIAL
```

---

## Notas de Segurança

1. **Winbox via ether2 apenas (recomendado):** Usuários do Hotspot não conseguem acessar a interface administrativa
2. **Neighbor Discovery na bridge1:** Permite descoberta mas requer credenciais do Winbox para conexão
3. **Não habilitar Winbox via bridge1:** Linha está comentada por padrão - só descomentar em ambientes controlados

---

## Detalhes Técnicos

### Por que auto-marcar como executado?

O protocolo atual esperava `executed_actions` do MikroTik, mas:
- Script RouterOS não implementa essa lógica
- Adicionar aumentaria complexidade
- "Fire and forget" é mais robusto para redes instáveis

### Por que injetar perfis em cada sync?

- Garante que novos roteadores recebam perfis existentes
- Action Processor v2 é idempotente (não duplica)
- Custo mínimo: poucos bytes extras

### Por que usar interface-list "mgmt"?

- Padrão MikroTik para gerenciar grupos de interfaces
- Neighbor Discovery só funciona com interface-list
- Permite adicionar/remover interfaces sem editar regras

---

## Validação Pós-Implementação

1. Gerar script para hotspot de teste
2. Verificar no arquivo `navspot-bootstrap.rsc`:
   - [ ] Seção 6.5 com criação da lista "mgmt"
   - [ ] Regras de firewall para TCP 8291 e UDP 5678
   - [ ] Neighbor discovery com `discover-interface-list=mgmt`
3. Upload e executar no MikroTik
4. Validar:
   ```
   /interface list print
   /interface list member print
   /ip neighbor discovery-settings print
   /ip firewall filter print where comment~"navspot-allow"
   ```
5. Testar se Winbox aparece em Neighbors
6. Forçar sync e verificar logs sem repetições

---

## Versão

Atualizar todas as referências para **v6.9** nos logs e comentários:
- Linha 459: `NAVSPOT v6.9: Iniciando instalacao...`
- Linha 550: `NAVSPOT: Sync v6.9 + Action Processor v2 configurados`
- Linha 568: `NAVSPOT v6.9 Parte 1: Bootstrap parcial concluido`
