

# Plano: Corrigir Erro de Sintaxe no Recovery Script v6.9.24

## Diagnóstico

O erro "expected end of command (line 764 column 33)" ocorre porque a variável `loginUrl` está com escape excessivo de backslashes.

### Código atual (linha 265 do recovery-download):
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\\\\\$(mac)&ip=\\\\\\$(ip)&link-login-only=\\\\\\$(link-login-only)`
```

Isso resulta em `\\\$(mac)` no script final, que o RouterOS não entende.

### Código correto (como está no bootstrap):
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)`
```

Isso resulta em `\$(mac)` no script final, que é o formato correto para o MikroTik expandir as variáveis em runtime.

---

## Correção

**Arquivo:** `supabase/functions/mikrotik-recovery-download/index.ts`

**Linha 265 - DE:**
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\\\\\$(mac)&ip=\\\\\\$(ip)&link-login-only=\\\\\\$(link-login-only)`
```

**PARA:**
```typescript
const loginUrl = `https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)`
```

---

## Comparativo com Bootstrap

O script-generator usa corretamente `\\$` (2 backslashes no TypeScript = 1 backslash no output):

```typescript
// script-generator (linha 733) - CORRETO
login-url="...&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
```

O recovery estava usando `\\\\\\$` (6 backslashes = 3 no output), que é errado:

```typescript
// recovery-download (linha 265) - ERRADO
&mac=\\\\\\$(mac)
```

---

## Teste Após Correção

1. Deploy da Edge Function atualizada
2. Baixar novo Recovery v6.9.24 do painel
3. Importar no MikroTik: `/import navspot-recovery-v6.9.24.rsc`
4. Deve executar sem erros
5. Verificar login-url: `/ip hotspot profile print`

---

## Resultado Esperado

Script importa sem erros e configura corretamente:
```routeros
login-url="https://navspot.lovable.app/hotspot-login?h=UUID&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)"
```

