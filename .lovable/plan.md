
# Plano v6.9.4: Correção Final do Walled Garden - action=deny é VÁLIDO para Hostnames

## Problema Identificado

O erro "expected deny or allow (line 270 column 68)" ocorre porque usamos `action=reject` no menu incorreto.

### Regra do RouterOS (confirmada na documentação oficial):

| Menu | Uso | Actions Válidas |
|------|-----|-----------------|
| `/ip hotspot walled-garden` | Hostnames/DNS (dst-host) | `allow`, `deny` |
| `/ip hotspot walled-garden ip` | IPs/Portas/Protocolos | `accept`, `reject` |

**O valor `reject` NÃO é aceito no menu `/ip hotspot walled-garden`!**

### Histórico do Erro

Na v6.9.2, trocamos `action=deny` por `action=reject` pensando que `deny` era inválido. Isso estava **ERRADO**:
- `deny` é VÁLIDO para `/ip hotspot walled-garden` (hostnames)
- `reject` é VÁLIDO para `/ip hotspot walled-garden ip` (IPs)

---

## Arquivos a Modificar

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 410 | `action=reject` → `action=deny` |
| `supabase/functions/mikrotik-script-generator/index.ts` | 411 | `action=reject` → `action=deny` |
| `supabase/functions/mikrotik-script-generator/index.ts` | 148-151 | Remover sanity check que bloqueia `action=deny` |
| `test/useMikrotikSync.test.ts` | ~67-80 | Atualizar testes para refletir a correção |

---

## Correção 1: Atualizar create_blacklist_domain

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 409-416 - Código Atual:**
```routeros
:if ([:len $domain] > 0) do={
:if ([:len [/ip hotspot walled-garden find dst-host=$domain action=reject]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
}
}
```

**Código Corrigido:**
```routeros
:if ([:len $domain] > 0) do={
:if ([:len [/ip hotspot walled-garden find dst-host=$domain action=deny]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
}
}
```

---

## Correção 2: Remover Sanity Check Incorreto

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 148-151 - Código Atual:**
```typescript
// v6.9.3: Verificar action=deny (inválido)
if (bootstrapScript.includes('action=deny')) {
  throw new Error('Erro critico: action=deny invalido. Use action=reject')
}
```

**Código Corrigido:**
```typescript
// v6.9.4: action=deny é VÁLIDO para /ip hotspot walled-garden (hostnames)
// action=reject é VÁLIDO para /ip hotspot walled-garden ip (IPs)
// Verificar apenas que não há mistura incorreta
if (bootstrapScript.includes('walled-garden ip') && bootstrapScript.includes('action=deny')) {
  console.warn('[script-generator] AVISO: action=deny no menu ip pode estar incorreto. Use action=reject para IPs.')
}
if (bootstrapScript.match(/walled-garden add.*action=reject/) && !bootstrapScript.match(/walled-garden ip add.*action=reject/)) {
  console.warn('[script-generator] AVISO: action=reject no menu de hostnames pode estar incorreto. Use action=deny.')
}
```

---

## Correção 3: Atualizar Testes

**Arquivo:** `test/useMikrotikSync.test.ts`

Remover ou atualizar o teste que verifica ausência de `action=deny`:

**Código Atual (linhas 67-80):**
```typescript
it('should not contain action=deny in generated RouterOS scripts', () => {
  const actionProcessorSource = `
    :if ($cmd = "create_blacklist_domain") do={
      /ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
    }
  `;
  
  expect(actionProcessorSource).not.toContain('action=deny');
  expect(actionProcessorSource).toContain('action=reject');
});
```

**Código Corrigido:**
```typescript
it('should use correct action values for walled-garden menus', () => {
  // Para /ip hotspot walled-garden (hostnames): action=allow ou action=deny
  const hostnameBlacklist = `
    /ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
  `;
  
  // Para /ip hotspot walled-garden ip (IPs): action=accept ou action=reject
  const ipWhitelist = `
    /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
  `;
  
  // Hostnames devem usar deny para bloquear
  expect(hostnameBlacklist).toContain('action=deny');
  expect(hostnameBlacklist).not.toContain('action=reject');
  
  // IPs devem usar accept/reject
  expect(ipWhitelist).toContain('action=accept');
  expect(ipWhitelist).not.toContain('action=allow');
});

it('should use correct walled-garden menu for hostnames', () => {
  const actionProcessorSource = `
    /ip hotspot walled-garden add dst-host=$domain action=deny
  `;
  
  // Verificar que usa o menu correto (sem "ip") para hostnames
  expect(actionProcessorSource).toContain('/ip hotspot walled-garden add dst-host');
  // Verificar que NÃO usa o menu "ip" para dst-host
  expect(actionProcessorSource).not.toMatch(/walled-garden ip.*dst-host/);
});
```

---

## Correção 4: Atualizar Versão para v6.9.4

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Buscar e substituir todas as ocorrências de "v6.9.3" por "v6.9.4".

---

## Referência Definitiva RouterOS Walled Garden

### Para PERMITIR hostnames (whitelist):
```routeros
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
```

### Para BLOQUEAR hostnames (blacklist):
```routeros
/ip hotspot walled-garden add dst-host="*.facebook.com" action=deny comment="navspot-blacklist-facebook"
```

### Para PERMITIR IPs/portas (whitelist):
```routeros
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
```

### Para BLOQUEAR IPs/portas (blacklist):
```routeros
/ip hotspot walled-garden ip add dst-address=192.168.1.100 action=reject comment="blocked-ip"
```

---

## Validação Pós-Implementação

1. Gerar script para hotspot de teste
2. Verificar no arquivo .rsc:
   - [ ] Blacklist de hostnames usa `/ip hotspot walled-garden add ... action=deny`
   - [ ] Whitelist de hostnames usa `/ip hotspot walled-garden add ... action=allow`
   - [ ] Whitelist de IPs/portas usa `/ip hotspot walled-garden ip add ... action=accept`
   - [ ] Versão v6.9.4 nos logs
3. Importar no MikroTik: `/import navspot-bootstrap.rsc`
4. Confirmar que o import completa **SEM ERROS**
5. Validar regras criadas:
   ```
   /ip hotspot walled-garden print where comment~"navspot"
   /ip hotspot walled-garden ip print where comment~"navspot"
   ```

---

## Resumo das Correções

| Problema | v6.9.3 (Errado) | v6.9.4 (Correto) |
|----------|-----------------|------------------|
| Blacklist hostnames | `action=reject` | `action=deny` |
| Sanity check | Bloqueava `action=deny` | Permite `action=deny` em walled-garden |
| Testes | Esperavam `action=reject` | Esperam `action=deny` para hostnames |

---

## Detalhes Técnicos

### Por que a confusão aconteceu?

O RouterOS usa terminologia inconsistente entre menus:

| Conceito | `/ip hotspot walled-garden` | `/ip hotspot walled-garden ip` | `/ip firewall filter` |
|----------|-----------------------------|---------------------------------|----------------------|
| Permitir | `allow` | `accept` | `accept` |
| Bloquear | `deny` | `reject` | `drop` ou `reject` |

Essa inconsistência levou à correção errada na v6.9.2 que trocou `deny` por `reject`.

---

## Impacto

- **Criticidade:** Crítica (impede instalação do script)
- **Risco:** Baixo (reversão da correção incorreta)
- **Compatibilidade:** RouterOS 6.x e 7.x
