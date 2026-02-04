

# Plano: v6.9.34 — Construção Segura de URL ✅ IMPLEMENTADO

## Problema Resolvido

O erro `expected end of command (line 102 column 176)` ocorria porque linhas longas de comando com múltiplos escapes `\$(...)` confundiam o parser do RouterOS 6.x.

## Solução Implementada

### 1. Construção de URL em Etapas

Em vez de uma linha gigante, o script agora constrói a URL em variáveis locais:

```routeros
:local urlBase "https://navspot.lovable.app/hotspot-login?h=..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
/ip hotspot profile add name="hsprof-navspot" ... login-url="$fullUrl"
```

### 2. Aspas de Segurança

Adicionadas aspas duplas ao redor de `$fullUrl` no comando final para prevenir erros com caracteres especiais.

### 3. Nova Regra de Linter

Bloqueio de linhas de comando longas (>150 chars) com variáveis escapadas:

```typescript
{ regex: /^\/[^#\n]{150,}\\\$\(/m, desc: 'Long command line (>150 chars) with escaped vars' }
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.34, URL em etapas, linter |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.34, URL em etapas, linter |
| `ScriptModal.tsx` | scriptVersion 6.9.34 |

---

## Script .rsc Final (v6.9.34)

### Bootstrap:
```routeros
:local urlBase "https://navspot.lovable.app/hotspot-login?h=..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
/ip hotspot profile add name="hsprof-navspot" ... login-url="$fullUrl"
```

### Recovery:
```routeros
:local urlBase "https://navspot.lovable.app/hotspot-login?h=..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do {
/ip hotspot profile set $_hsprof login-url="$fullUrl"
} on-error={ ... }
```

---

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.34.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar a URL completa com $(mac), $(ip), etc.

/log print where message~"NAVSPOT"
# Deve mostrar: "Hotspot v6.9.34 com portal externo ativo (URL segura)"
```
