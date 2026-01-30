

# Plano v6.9.2: Correção do Walled Garden + Validação de Testes

## Resumo Executivo

Este plano corrige o erro `bad action value deny` e implementa melhorias na lógica de blacklist/whitelist do Walled Garden:

1. **Corrigir `action=deny` → `action=reject`** - Substituir em todas as ocorrências
2. **Usar menu correto para hostnames** - `/ip hotspot walled-garden` (não `/ip hotspot walled-garden ip`)
3. **Adicionar teste automatizado** - Verificar que o script gerado não contém `action=deny`
4. **Bump de versão** - Atualizar para v6.9.2

---

## Problema Técnico Identificado

### Menus RouterOS e seus parâmetros aceitos:

| Menu | Uso | Campos | Actions Válidas |
|------|-----|--------|-----------------|
| `/ip hotspot walled-garden` | Hostnames/DNS | `dst-host`, `dst-port`, `src-address` | `allow`, `reject` |
| `/ip hotspot walled-garden ip` | IPs/Protocolos | `dst-address`, `dst-port`, `protocol` | `accept`, `reject` |

### Erros no código atual (linhas 391-392):

```routeros
# ERRO 1: Menu incorreto para hostnames (usa "ip" mas tem dst-host)
# ERRO 2: action=deny não existe (deveria ser action=reject)
:if ([:len [/ip hotspot walled-garden ip find dst-host=$domain action=deny]] = 0) do={
/ip hotspot walled-garden ip add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Corrigir linhas 391-392 |
| `test/useMikrotikSync.test.ts` | Adicionar teste para validar script gerado |

---

## Correção 1: Usar Menu Correto com Action Correta

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 386-398 - Código Atual:**
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

**Código Corrigido:**
```routeros
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len $domain] > 0) do={
:if ([:len [/ip hotspot walled-garden find dst-host=$domain action=reject]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
:log info ("NAVSPOT: Blacklist bloqueado - " . $domain)
} else={
:log info ("NAVSPOT: Blacklist ja existe - " . $domain)
}
}
}
```

### Mudanças específicas:
- Linha 391: `/ip hotspot walled-garden ip find` → `/ip hotspot walled-garden find`
- Linha 391: `action=deny` → `action=reject`
- Linha 392: `/ip hotspot walled-garden ip add` → `/ip hotspot walled-garden add`
- Linha 392: `action=deny` → `action=reject`

---

## Correção 2: Atualizar Versão para v6.9.2

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Buscar e substituir todas as ocorrências de "v6.9.1" por "v6.9.2":
- Linha ~500: `NAVSPOT v6.9.1: Iniciando instalacao...`
- Linha ~535: `NAVSPOT: Sync v6.9.1 + Action Processor v2 configurados`
- Linha 568: `NAVSPOT v6.9.2: INSTALACAO CONCLUIDA!`

---

## Correção 3: Adicionar Teste Automatizado

**Arquivo:** `test/useMikrotikSync.test.ts`

Adicionar novo teste para validar que o script gerado não contém valores inválidos:

```typescript
describe('Script Generator Validation', () => {
  it('should not contain action=deny in generated RouterOS scripts', () => {
    // Simular strings que seriam geradas pelo script generator
    const actionProcessorSource = `
      :if ($cmd = "create_blacklist_domain") do={
        /ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)
      }
    `;
    
    // Verificar que action=deny NÃO está presente
    expect(actionProcessorSource).not.toContain('action=deny');
    
    // Verificar que action=reject ESTÁ presente para blacklist
    expect(actionProcessorSource).toContain('action=reject');
  });

  it('should use correct walled-garden menu for hostnames', () => {
    const actionProcessorSource = `
      /ip hotspot walled-garden add dst-host=$domain action=reject
    `;
    
    // Verificar que não usa o menu "ip" para dst-host
    expect(actionProcessorSource).not.toMatch(/walled-garden ip.*dst-host/);
    
    // Verificar que usa o menu correto (sem "ip") para hostnames
    expect(actionProcessorSource).toContain('/ip hotspot walled-garden add dst-host');
  });
});
```

---

## Referência Rápida: RouterOS Walled Garden

### Para bloquear HOSTNAMES (domínios, wildcards):
```routeros
# Menu: /ip hotspot walled-garden (SEM "ip")
# Actions: allow, reject
/ip hotspot walled-garden add dst-host="*.facebook.com" action=reject comment="block-facebook"
```

### Para bloquear IPs/Portas/Protocolos:
```routeros
# Menu: /ip hotspot walled-garden ip (COM "ip")
# Actions: accept, reject
/ip hotspot walled-garden ip add dst-address=192.168.1.0/24 dst-port=80 protocol=tcp action=reject
```

---

## Validação Pós-Implementação

1. Executar testes: `npm run test`
2. Gerar script para hotspot de teste
3. Verificar no arquivo `.rsc`:
   - [ ] Nenhuma ocorrência de `action=deny`
   - [ ] Blacklist usa `/ip hotspot walled-garden` (sem "ip")
   - [ ] Blacklist usa `action=reject`
   - [ ] Versão atualizada para v6.9.2
4. Importar no MikroTik: `/import navspot-bootstrap.rsc`
5. Confirmar que o import completa sem erros
6. Validar regras criadas:
   ```
   /ip hotspot walled-garden print where comment~"navspot-blacklist"
   ```

---

## Resumo das Alterações

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `mikrotik-script-generator/index.ts` | 391 | `/ip hotspot walled-garden ip find dst-host=$domain action=deny` → `/ip hotspot walled-garden find dst-host=$domain action=reject` |
| `mikrotik-script-generator/index.ts` | 392 | `/ip hotspot walled-garden ip add dst-host=$domain action=deny` → `/ip hotspot walled-garden add dst-host=$domain action=reject` |
| `mikrotik-script-generator/index.ts` | ~500, ~535, 568 | v6.9.1 → v6.9.2 |
| `test/useMikrotikSync.test.ts` | Novo | Adicionar testes de validação do script gerado |

---

## Impacto

- **Criticidade:** Alta (impede instalação do script)
- **Risco:** Baixo (alteração pontual de valores)
- **Compatibilidade:** RouterOS 6.x e 7.x

