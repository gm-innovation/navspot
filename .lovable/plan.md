
# Plano: Correção Definitiva v6.9.29 — Fix do /import para Variáveis RouterOS

## Problema Identificado

O erro `expected end of command (line 644 column 33)` ocorre porque o RouterOS 6.x **parseia variáveis dentro de strings** durante o `/import`, antes de executar o script.

Linha problemática:
```routeros
/ip hotspot profile set $hsprof login-url="$correctLoginUrl"
```

O parser vê `$hsprof` e `$correctLoginUrl` e tenta expandi-las no momento do parse, mas elas não existem ainda — gerando erro de sintaxe.

---

## Solução Implementada (v6.9.29) ✅

### Estratégia

1. **Eliminar `$correctLoginUrl`** — não usar variável intermediária para a URL
2. **Escapar variável `$hsprof`** — usar `\\$hsprof` no TypeScript para gerar `\$hsprof` no .rsc
3. **Escrever URL diretamente** no comando `set`, já interpolada pelo TypeScript

### Código Corrigido (no .rsc final)

```routeros
# 6. HOTSPOT PROFILE - Verificar/corrigir login-url para portal externo v6.9.29
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile login-url..."
:local hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \$hsprof] > 0) do={
/ip hotspot profile set \$hsprof login-url="https://navspot.lovable.app/hotspot-login?h=XXXX&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:log info "NAVSPOT-RECOVERY: login-url configurada"
} else={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado"
}
```

**Como funciona o escape:**
- TypeScript `\\$hsprof` → arquivo .rsc `\$hsprof` → RouterOS runtime expande para o valor
- TypeScript `\\$(mac)` → arquivo .rsc `\$(mac)` → MikroTik expande em runtime do hotspot

---

## Arquivos Modificados

### 1. `supabase/functions/mikrotik-recovery-download/index.ts` ✅

- Versão atualizada para 6.9.29
- Removida variável `$correctLoginUrl` 
- Adicionado escape `\\$hsprof` para compatibilidade com /import
- URL agora é escrita inline (interpolada pelo TypeScript)
- Linter expandido com 2 novos padrões proibidos

### 2. `supabase/functions/mikrotik-script-generator/index.ts` ✅

- Versão atualizada para 6.9.29
- Linter expandido com mesmos padrões do recovery
- Bootstrap já estava correto (usa URL inline na linha 733)

### 3. Linter Atualizado ✅

Novos padrões detectados:
```typescript
{ regex: /login-url="\$/, desc: 'login-url="$... (variable in string breaks /import)' },
{ regex: /set \$[a-zA-Z]+ login-url/, desc: 'set $var login-url (unescaped variable breaks /import)' },
```

### 4. Frontend ✅

- ScriptModal: versão padrão atualizada para 6.9.29

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
