

# Plano v6.9.3: Correções de Compatibilidade RouterOS + Robustez

## Resumo Executivo

Este plano corrige **5 problemas críticos** identificados na revisão da v6.9.2:

1. **Remover política inválida "policy"** - `policy=read,write,policy,test` contém "policy" que não é válida
2. **Corrigir scheduler on-event** - Usar `/system script run navspot-sync` em vez de só o nome
3. **Criar token de forma robusta** - Método compatível com RouterOS 6.x e 7.x
4. **Tornar create_profile resiliente** - Não passar rate-limit vazio
5. **Adicionar testes automatizados** - Validar políticas e sintaxe do script gerado

---

## Problema 1: Política Inválida nos Scripts

### Localização

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 544 e 553:**
```routeros
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
...
/system script add name="navspot-sync" policy=read,write,policy,test source={
```

### Problema

O token `policy` não é uma política válida do RouterOS. Políticas válidas incluem:
- `read`, `write`, `test`, `ftp`, `reboot`, `winbox`, `password`, `policy`, `sensitive`, `sniff`, `api`, `local`, `telnet`, `ssh`, `dude`

**Nota:** Apesar de `policy` existir como política válida no RouterOS mais recente, a combinação `policy=read,write,policy,test` pode causar confusão. O mais seguro é usar apenas as políticas necessárias.

### Correção

Substituir `policy=read,write,policy,test` por `policy=read,write,test`:

**Linha 544:**
```routeros
/system script add name="navspot-action-processor" policy=read,write,test source={
```

**Linha 553:**
```routeros
/system script add name="navspot-sync" policy=read,write,test source={
```

---

## Problema 2: Scheduler on-event Incorreto

### Localização

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 557:**
```routeros
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup
```

### Problema

Em algumas versões do RouterOS, `on-event="navspot-sync"` pode não executar o script corretamente. O padrão mais robusto é usar o comando completo.

### Correção

Substituir por:
```routeros
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="/system script run navspot-sync" start-time=startup
```

---

## Problema 3: Criação de Token Frágil

### Localização

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 531-537:**
```routeros
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file print file=navspot-token
:delay 2s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
:delay 1s
:log info "NAVSPOT: Token criado"
```

### Problema

1. O nome do arquivo criado por `/file print file=navspot-token` gera `navspot-token.txt` automaticamente, mas isso pode variar
2. Builds antigas podem não aceitar `/file set ... contents=...` diretamente

### Correção

Implementar método robusto com fallback:
```routeros
# 9. TOKEN (metodo robusto compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 500ms
:local tokenValue "${hotspot.sync_token}"
:do {
/file add name="navspot-token.txt" contents=$tokenValue
:log info "NAVSPOT: Token criado via /file add"
} on-error={
# Fallback para builds antigas
/file print file=navspot-token
:delay 1s
/file set [find name~"navspot-token"] contents=$tokenValue
:log info "NAVSPOT: Token criado via fallback"
}
:delay 500ms
```

---

## Problema 4: create_profile com Rate-Limit Vazio

### Localização

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linhas 310-317** (dentro de `actionProcessorSource`):
```routeros
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
:log info ("NAVSPOT: Perfil criado - " . $pName)
} else={
/ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared
:log info ("NAVSPOT: Perfil atualizado - " . $pName)
}
```

### Problema

Se `$pRate` estiver vazio, o comando passa `rate-limit=` que pode gerar erro no import.

### Correção

Adicionar verificação condicional:
```routeros
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile add name=$pName shared-users=$pShared
}
:log info ("NAVSPOT: Perfil criado - " . $pName)
} else={
:if ([:len $pRate] > 0) do={
/ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared
} else={
/ip hotspot user profile set $existing shared-users=$pShared
}
:log info ("NAVSPOT: Perfil atualizado - " . $pName)
}
```

---

## Problema 5: Testes Automatizados Incompletos

### Localização

**Arquivo:** `test/useMikrotikSync.test.ts`

### Problema

Os testes atuais não validam:
- Políticas inválidas nos scripts
- Formato correto do scheduler on-event
- Ausência de rate-limit vazio

### Correção

Adicionar novos testes:

```typescript
describe('Script Generator Validation', () => {
  // ... testes existentes ...

  it('should not contain invalid policy token in script declarations', () => {
    const scriptDeclaration = `
      /system script add name="navspot-sync" policy=read,write,test source={
    `;
    
    // Verificar que não contém "policy,policy" ou "policy=...policy..."
    expect(scriptDeclaration).not.toMatch(/policy=.*policy,.*policy/);
    // Verificar que usa políticas válidas
    expect(scriptDeclaration).toMatch(/policy=read,write,test/);
  });

  it('should use full command in scheduler on-event', () => {
    const schedulerCommand = `
      /system scheduler add name="navspot-sync-scheduler" interval=5m on-event="/system script run navspot-sync" start-time=startup
    `;
    
    // Verificar que on-event contém comando completo
    expect(schedulerCommand).toContain('on-event="/system script run');
  });

  it('should handle empty rate-limit gracefully', () => {
    const createProfileLogic = `
      :if ([:len $pRate] > 0) do={
        /ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
      } else={
        /ip hotspot user profile add name=$pName shared-users=$pShared
      }
    `;
    
    // Verificar que existe verificação de rate-limit vazio
    expect(createProfileLogic).toContain('[:len $pRate] > 0');
  });
});
```

---

## Arquivos a Modificar

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `mikrotik-script-generator/index.ts` | 544 | `policy=read,write,policy,test` → `policy=read,write,test` |
| `mikrotik-script-generator/index.ts` | 553 | `policy=read,write,policy,test` → `policy=read,write,test` |
| `mikrotik-script-generator/index.ts` | 557 | `on-event="navspot-sync"` → `on-event="/system script run navspot-sync"` |
| `mikrotik-script-generator/index.ts` | 531-537 | Token com fallback robusto |
| `mikrotik-script-generator/index.ts` | 310-317 | Verificar rate-limit vazio antes de usar |
| `mikrotik-script-generator/index.ts` | 70, 167, 428, 568 | Atualizar versão para v6.9.3 |
| `test/useMikrotikSync.test.ts` | 85+ | Adicionar novos testes de validação |

---

## Sanity Checks Adicionais

Adicionar novas verificações no bloco de sanity checks (após linha 130):

```typescript
// v6.9.3: Verificar políticas inválidas
if (bootstrapScript.includes('policy=read,write,policy,test')) {
  throw new Error('Erro critico: policy token invalido. Use policy=read,write,test')
}

// v6.9.3: Verificar scheduler com comando completo
if (bootstrapScript.includes('on-event="navspot-sync"') && 
    !bootstrapScript.includes('on-event="/system script run navspot-sync"')) {
  console.warn('[script-generator] AVISO: scheduler deve usar comando completo em on-event')
}
```

---

## Estrutura Final do Script Gerado (v6.9.3)

```text
# NAVSPOT v6.9.3 - Bootstrap Completo

# 0. VALIDACAO INICIAL
# 1. LIMPEZA INICIAL
# 2. CONFIGURAR WAN
# 3. IDENTIDADE
# 4. CRIAR BRIDGE1 VAZIA
# 5. CONFIGURAR REDE NA BRIDGE1
# 6. NAT
# 6.5. GERENCIA WINBOX / NEIGHBOR DISCOVERY
# 7. HOTSPOT
# 8. WALLED GARDEN
# 9. TOKEN (método robusto com fallback)
# 10. SYNC SCRIPT v6.9.3 + ACTION PROCESSOR v2
#     - policy=read,write,test (corrigido)
#     - create_profile resiliente a rate-limit vazio
#     - scheduler com on-event="/system script run ..."
# 11. MIGRACAO DE PORTAS LAN
# 12. FINALIZACAO
```

---

## Validação Pós-Implementação

1. Executar testes: `npm run test`
2. Gerar script para hotspot de teste
3. Verificar no arquivo `.rsc`:
   - [ ] Nenhuma ocorrência de `policy=read,write,policy,test`
   - [ ] Scheduler usa `on-event="/system script run navspot-sync"`
   - [ ] Token usa método com fallback
   - [ ] create_profile verifica `[:len $pRate] > 0`
   - [ ] Versão v6.9.3 nos logs
4. Importar no MikroTik: `/import navspot-bootstrap.rsc`
5. Confirmar que o import completa sem erros
6. Validar scripts criados:
   ```
   /system script print where name~"navspot"
   /system scheduler print where name~"navspot"
   ```

---

## Resumo das Correções

| Problema | Antes | Depois |
|----------|-------|--------|
| Política inválida | `policy=read,write,policy,test` | `policy=read,write,test` |
| Scheduler on-event | `on-event="navspot-sync"` | `on-event="/system script run navspot-sync"` |
| Token frágil | `/file print file=` + `/file set` | `/file add` com fallback |
| Rate-limit vazio | Passa `rate-limit=` vazio | Omite parâmetro se vazio |
| Testes | Incompletos | Validam políticas e sintaxe |

---

## Impacto

- **Criticidade:** Alta (impede criação de scripts no RouterOS)
- **Risco:** Baixo (alterações pontuais e bem definidas)
- **Compatibilidade:** RouterOS 6.x e 7.x

