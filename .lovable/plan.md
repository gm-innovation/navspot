
# Plano: Correção Definitiva v6.9.29 — Fix do /import para Variáveis RouterOS

## Problema Identificado

O erro `expected end of command (line 644 column 33)` ocorre porque o RouterOS 6.x **parseia variáveis dentro de strings** durante o `/import`, antes de executar o script.

Linha problemática:
```routeros
/ip hotspot profile set $hsprof login-url="$correctLoginUrl"
```

O parser vê `$hsprof` e `$correctLoginUrl` e tenta expandi-las no momento do parse, mas elas não existem ainda — gerando erro de sintaxe.

---

## Solução: Inline URL + Escape de Variáveis

### Estratégia

1. **Eliminar `$correctLoginUrl`** — não usar variável intermediária para a URL
2. **Escrever URL diretamente** no comando `set`, com escapes corretos:
   - `\$hsprof` — impede expansão pelo import, mantém para runtime
   - `\$(mac)` etc — já vem escapado corretamente do TypeScript (`\\$(mac)`)

### Código Corrigido

```routeros
# 6. HOTSPOT PROFILE - Verificar/corrigir login-url para portal externo v6.9.29
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile login-url..."
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \$hsprof] > 0) do={
  /ip hotspot profile set \$hsprof login-url="https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
  :log info "NAVSPOT-RECOVERY: login-url configurada"
} else={
  :log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
```

**Nota sobre escapes no TypeScript:**
- Para gerar `\$hsprof` no .rsc, usamos `\\$hsprof` no TypeScript
- Para gerar `\$(mac)` no .rsc (que o MikroTik expande em runtime), usamos `\\$(mac)` no TypeScript

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

**Seção do Hotspot Profile (linhas ~679-695):**

Remover:
```typescript
:local correctLoginUrl "${loginUrl}"
...
/ip hotspot profile set $hsprof login-url="$correctLoginUrl"
```

Substituir por (com escapes corretos):
```typescript
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \\$hsprof] > 0) do={
/ip hotspot profile set \\$hsprof login-url="${loginUrl}"
:log info "NAVSPOT-RECOVERY: login-url configurada"
} else={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado"
}
```

**Onde `loginUrl` já contém os escapes corretos:**
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)`
```

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

Verificar se há o mesmo padrão problemático no bootstrap. Se houver, aplicar a mesma correção.

### 3. Atualizar Linter

Adicionar detecção de `login-url="$` para prevenir regressões:

```typescript
{ regex: /login-url="\$/, desc: 'login-url="$... (variable in string breaks /import)' },
```

### 4. Atualizar Versão

- Recovery e Bootstrap: `6.9.29`
- Frontend: ScriptModal e Embarcacoes.tsx

---

## Auditoria de Outros Padrões de Risco

### Variáveis Usadas Dentro de Strings (potencialmente problemáticas)

| Arquivo | Linha | Código | Status |
|---------|-------|--------|--------|
| recovery | ~578 | `contents="${syncToken}"` | OK — `syncToken` é substituído pelo TypeScript |
| recovery | ~688 | `login-url="$correctLoginUrl"` | **ERRO** — variável MikroTik dentro de string |
| bootstrap | ~733 | `login-url="...\\$(mac)..."` | OK — escapes corretos |
| bootstrap | ~770 | `contents=$tokenValue` | OK — sem aspas na atribuição |

### Wildcards no Walled Garden

| Padrão | Risco |
|--------|-------|
| `*.lovable.app` | Baixo (funciona na maioria dos 6.x) |
| `*.supabase.co` | Baixo |
| `*.cloudfront.net` | Baixo |
| `*.amazonaws.com` | Baixo |
| `*.gstatic.com` | Baixo |
| `*.apple.com` | **REMOVIDO** v6.9.28 |

---

## Resultado Esperado

Após v6.9.29:
1. O `/import navspot-recovery-v6.9.29.rsc` deve completar sem erros
2. O hotspot profile terá a `login-url` correta
3. O linter bloqueará futuras regressões com variáveis em strings

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.29.rsc
# Deve completar sem "expected end of command"

# Verificar hotspot profile
/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

# Verificar logs
/log print where message~"NAVSPOT-RECOVERY"
```
