

# Plano: Implementação Completa de Bloqueio de Sites v6.9.14

## Resumo Executivo

Este plano implementa a solução de bloqueio de sites que você detalhou, corrigindo duas falhas críticas:

1. **Pré-login**: Walled Garden já funciona com `action=deny` no action-processor (linha 435-446), mas precisa de ajuste para usar `action=reject`
2. **Pós-login**: Falta completamente - não existe comando `add_firewall_block` para inserir regras de firewall

---

## Análise do Código Atual

### O que já existe e funciona:

**action-processor (script-generator linhas 435-446)**:
```routeros
:if ($cmd = "create_blacklist_domain") do={
  :local p2 [:find $rest "|"]
  :local bName [:pick $rest 0 $p2]
  :local domain [:pick $rest ($p2 + 1) [:len $rest]]
  :if ([:len $domain] > 0) do={
    :if ([:len [/ip hotspot walled-garden find dst-host=$domain action=deny]] = 0) do={
      /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
      :log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
    }
  }
}
```

**mikrotik-sync pipe formatter (linhas 1115-1118)**:
```typescript
case 'add_firewall_filter':
case 'add_blacklist_domain':
  return `create_blacklist_domain|${p.list_name || 'default'}|${p.domain || ''}`
```

### O que está faltando:

1. **Firewall Filter para bloqueio pós-login**: O `create_blacklist_domain` só cria regra no Walled Garden (pré-login). Após autenticação, o usuário passa livre.

2. **Inserção antes do Fasttrack**: As regras precisam ser inseridas ANTES de regras de fasttrack-connection para serem efetivas.

3. **Geração automática de ações de firewall**: O `firewallRules` é retornado no JSON (linha 1139) mas não é convertido em comandos no pipe.

---

## Mudanças Propostas

### 1. Atualizar action-processor no script-generator

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

Adicionar novo comando `add_firewall_block` após linha 446:

```routeros
:if ($cmd = "add_firewall_block") do={
  :local domain $rest
  :if ([:len $domain] > 0) do={
    # Verificar se regra já existe
    :if ([:len [/ip firewall filter find comment=("NAVSPOT-BLOCK-" . $domain)]] = 0) do={
      # Inserir antes do fasttrack para garantir inspeção
      :local pos [/ip firewall filter find where action=fasttrack-connection]
      :if ([:len $pos] = 0) do={:set pos 0}
      /ip firewall filter add chain=forward action=drop protocol=tcp dst-port=80,443 content=$domain comment=("NAVSPOT-BLOCK-" . $domain) place-before=$pos
      :log info ("NAVSPOT: Firewall block added - " . $domain)
    } else={
      :log info ("NAVSPOT: Firewall block exists - " . $domain)
    }
  }
}
```

### 2. Adicionar case no pipe formatter

**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`

Adicionar novo case após linha 1118:

```typescript
case 'add_firewall_block':
  return `add_firewall_block|${p.domain || ''}`
```

### 3. Gerar ações de firewall a partir de firewallRules

**Arquivo**: `supabase/functions/mikrotik-sync/index.ts`

Após o loop de firewallRules (linha ~906), adicionar lógica para injetar ações:

```typescript
// v6.9.14: Convert firewallRules to pending actions for MikroTik
if (firewallRules.length > 0) {
  for (const rule of firewallRules) {
    if (rule.action === 'block' && rule.domains.length > 0) {
      for (const domain of rule.domains) {
        if (domain) {
          // Walled Garden (pré-login)
          formattedActions.push({
            id: `auto-blacklist-${domain.replace(/[^a-z0-9]/gi, '')}`,
            type: 'add_blacklist_domain',
            payload: { list_name: 'blacklist', domain }
          })
          
          // Firewall Filter (pós-login)
          formattedActions.push({
            id: `auto-firewall-${domain.replace(/[^a-z0-9]/gi, '')}`,
            type: 'add_firewall_block',
            payload: { domain }
          })
        }
      }
    } else if (rule.action === 'allow' && rule.domains.length > 0) {
      for (const domain of rule.domains) {
        if (domain) {
          // Whitelist no Walled Garden
          formattedActions.push({
            id: `auto-whitelist-${domain.replace(/[^a-z0-9]/gi, '')}`,
            type: 'add_whitelist_domain',
            payload: { list_name: 'whitelist', domain }
          })
        }
      }
    }
  }
  console.log(`[mikrotik-sync] v6.9.14: Injected ${firewallRules.reduce((acc, r) => acc + r.domains.length, 0)} domain actions`)
}
```

### 4. Atualizar Walled Garden para usar action=reject

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

Alterar linha 441 de `action=deny` para `action=reject` conforme especificado:

```routeros
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
  /ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
```

> **Nota**: `action=reject` é mais agressivo que `deny` - envia resposta de rejeição ao cliente.

---

## Fluxo de Dados Corrigido

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUXO v6.9.14 (CORRIGIDO)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Admin cria blacklist (ex: facebook.com, netflix.com)       │
│     ↓                                                           │
│  2. Regras salvas em listas_acesso.dominios                    │
│     ↓                                                           │
│  3. mikrotik-sync busca regras_acesso + listas_acesso          │
│     ↓                                                           │
│  4. Para cada domínio bloqueado, gera 2 ações:                 │
│     - add_blacklist_domain|blacklist|*.facebook.com            │
│     - add_firewall_block|*.facebook.com                        │
│     ↓                                                           │
│  5. pending_actions_pipe enviado ao MikroTik:                  │
│     [[create_blacklist_domain|blacklist|*.facebook.com;        │
│       add_firewall_block|*.facebook.com;]]                     │
│     ↓                                                           │
│  6. action-processor executa:                                   │
│     a) /ip hotspot walled-garden add ... action=reject         │
│     b) /ip firewall filter add ... action=drop place-before=0 │
│     ↓                                                           │
│  7. Resultado:                                                  │
│     - Pré-login: Walled Garden bloqueia acesso                 │
│     - Pós-login: Firewall Filter dropa pacotes                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 441 | Alterar `action=deny` para `action=reject` |
| `supabase/functions/mikrotik-script-generator/index.ts` | 458+ | Adicionar handler `add_firewall_block` |
| `supabase/functions/mikrotik-sync/index.ts` | ~907 | Converter `firewallRules` em ações pendentes |
| `supabase/functions/mikrotik-sync/index.ts` | ~1119 | Adicionar case `add_firewall_block` no formatter |

---

## Comandos de Verificação no MikroTik

Após sincronização, execute para confirmar:

```routeros
# Ver regras Walled Garden (pré-login)
/ip hotspot walled-garden print where comment~"navspot-blacklist"

# Ver regras Firewall (pós-login)
/ip firewall filter print where comment~"NAVSPOT-BLOCK"

# Monitorar counters durante teste
/ip firewall filter print stats where comment~"NAVSPOT-BLOCK"
```

---

## Testes de Aceitação

1. **Criar blacklist** com domínios `*.facebook.com`, `*.netflix.com`
2. **Aguardar sync** (ou forçar via /system script run navspot-sync)
3. **Verificar Walled Garden**: `print where comment~"navspot"` deve mostrar regras
4. **Verificar Firewall**: `print where comment~"NAVSPOT-BLOCK"` deve mostrar regras
5. **Testar pré-login**: Conectar ao WiFi sem autenticar, tentar facebook.com → bloqueado
6. **Testar pós-login**: Autenticar, tentar facebook.com → bloqueado (firewall)
7. **Verificar counters**: Devem incrementar durante tentativas de acesso

---

## Observações Técnicas

### Sobre content match vs Layer 7

O método `content=` funciona para:
- HTTP (porta 80) - match no Host header
- HTTPS (porta 443) - match no SNI durante handshake TLS

Limitações:
- DoH (DNS over HTTPS) pode bypassar
- Apps que não usam SNI podem escapar

Para v6.9.15, considerar:
- Address-list dinâmica via resolução DNS
- Layer 7 protocol regex (mais CPU intensivo)

### Sobre place-before=fasttrack

Crítico porque o fasttrack estabelece conexões "rápidas" que bypassam inspeção. Inserir ANTES garante que a primeira verificação bloqueia.

