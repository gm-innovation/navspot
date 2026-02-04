

# Plano: Ajuste de Segurança v6.9.34 — Aspas em `$fullUrl`

## Ajuste Solicitado

Adicionar aspas duplas ao redor da variável `$fullUrl` no comando de set do hotspot profile:

**Antes:**
```routeros
/ip hotspot profile set $_hsprof login-url=$fullUrl
```

**Depois (com aspas de segurança):**
```routeros
/ip hotspot profile set $_hsprof login-url="$fullUrl"
```

## Justificativa

- O MikroTik aceita variáveis sem aspas quando não há espaços
- Porém, aspas duplas previnem erros com caracteres especiais inesperados
- É uma boa prática defensiva para URLs que podem conter `&`, `=`, `?`, etc.

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

#### Linhas 693-703 — Bloco do Hotspot Profile com aspas:

```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.34
# Safe URL construction: build URL in local vars, then set profile with quotes
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:do {
/ip hotspot profile set \$_hsprof login-url="\$fullUrl"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

#### Bloco do Hotspot Profile com aspas:

```typescript
# 7. HOTSPOT v6.9.34 (safe URL construction with quotes)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspot.id}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m login-url="\$fullUrl"
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v6.9.34 com portal externo ativo (URL segura)"
```

---

## Script .rsc Final (v6.9.34)

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

### Bootstrap:
```routeros
:local urlBase "https://navspot.lovable.app/hotspot-login?h=..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)
/ip hotspot profile add name="hsprof-navspot" ... login-url="$fullUrl"
```

---

## Resumo

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-recovery-download/index.ts` | `login-url="$fullUrl"` (com aspas) |
| `mikrotik-script-generator/index.ts` | `login-url="$fullUrl"` (com aspas) |

Este ajuste será incluído junto com a implementação completa do v6.9.34 (construção de URL em etapas).

