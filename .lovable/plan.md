

# Melhorias Finais no MikroTik Script Generator

## Resumo

Duas melhorias não críticas para otimização e segurança:

| # | Melhoria | Tipo | Linhas Afetadas |
|---|----------|------|-----------------|
| 1 | Consolidar Layer 7 em 1 único protocol | Performance | 508-532 |
| 2 | Desabilitar DNS recursivo externo | Segurança | 344 |

---

## Melhoria 1: Consolidar Layer 7 em 1 Único Protocol

**Problema Atual:**
- O código divide domínios em chunks de 5 (linha 510)
- Cada chunk gera um Layer 7 protocol separado
- Com 20 domínios bloqueados = 4 protocols + 4 firewall rules
- Cada L7 protocol inspeciona TODOS os pacotes independentemente

**Solução:**
- Consolidar TODOS os domínios em um único regex
- Gerar apenas 1 Layer 7 protocol + 1 firewall rule
- Reduz overhead de CPU significativamente

**Alteração (linhas 508-532):**

```typescript
// ANTES: chunks de 5
const chunkSize = 5
let l7Index = 0
for (let i = 0; i < domainsArray.length; i += chunkSize) {
  // cria múltiplos protocols...
}

// DEPOIS: um único protocol consolidado
const allPatterns = domainsArray
  .map(d => d.replace(/^\*\./, '').replace(/\./g, '\\\\.'))
  .join('|')

script += `add name="navspot-block-all" regexp="^.*(${allPatterns}).*$" comment="navspot-${hotspotSlug}"\n`

// E apenas 1 firewall rule:
script += `add chain=forward layer7-protocol="navspot-block-all" action=drop comment="navspot-${hotspotSlug}-block-all"\n`
```

**Resultado:**
| Métrica | Antes (20 domínios) | Depois |
|---------|---------------------|--------|
| L7 Protocols | 4 | 1 |
| Firewall Rules | 4 | 1 |
| Overhead CPU | Alto | Mínimo |

---

## Melhoria 2: Restringir DNS Recursivo

**Problema Atual:**
- Linha 344: `set allow-remote-requests=yes`
- Permite que o router aceite consultas DNS de qualquer IP externo
- Pode ser usado como **DNS amplification attack** (DDoS)
- Roteadores em navios frequentemente têm IP público via Starlink

**Solução:**
- Mudar para `allow-remote-requests=no`
- O DNS do router ainda funciona para clientes locais (via interface)
- Consultas DNS externas são bloqueadas

**Alteração (linha 344):**

```routeros
# ANTES (risco de amplificação DNS)
/ip dns
set allow-remote-requests=yes

# DEPOIS (seguro - apenas consultas locais)
/ip dns
set allow-remote-requests=no
```

**Comportamento:**
| Fonte da Consulta | allow-remote-requests=yes | allow-remote-requests=no |
|-------------------|---------------------------|--------------------------|
| Cliente hotspot (192.168.88.x) | Responde | Responde |
| IP externo (internet) | Responde (RISCO) | Ignora (SEGURO) |

---

## Arquivo a Modificar

| Arquivo | Alterações |
|---------|------------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Linhas 344 e 508-532 |

---

## Código Final (Layer 7)

```typescript
// FIX #6 IMPROVED: Single consolidated L7 protocol for maximum performance
if (blockedDomains.size > 0) {
  script += `
# ============================================
# Layer 7 Protocols (Single Consolidated)
# ============================================
# Maximum performance: 1 protocol, 1 rule for all blocked domains
/ip firewall layer7-protocol
:foreach l in=[find comment~"navspot-${hotspotSlug}"] do={ remove \\$l }

`
  // Consolidate ALL domains into single regexp
  const domainsArray = Array.from(blockedDomains)
  const allPatterns = domainsArray
    .map(d => d.replace(/^\*\./, '').replace(/\./g, '\\\\.'))
    .join('|')
  
  script += `add name="navspot-block-all" regexp="^.*(${allPatterns}).*\\$" comment="navspot-${hotspotSlug}"\n`

  script += `
# ============================================
# Firewall Rules (Block Domains - Single Rule)
# ============================================
/ip firewall filter
:foreach f in=[find comment~"navspot-${hotspotSlug}-block"] do={ remove \\$f }

add chain=forward layer7-protocol="navspot-block-all" action=drop comment="navspot-${hotspotSlug}-block-all"
`
}
```

---

## Benefícios

1. **Performance melhorada**: CPU processa apenas 1 L7 protocol em vez de múltiplos
2. **Segurança DNS**: Router não pode ser usado como amplificador DDoS
3. **Simplicidade**: Menos regras de firewall para gerenciar
4. **Compatibilidade**: Funciona em todos os modelos MikroTik

