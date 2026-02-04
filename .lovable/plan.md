
# Correção v7.1.12: Sintaxe de Variáveis RouterOS - IMPLEMENTADO ✓

## Problema Identificado

O script `navspot-action-processor` estava marcado como **Invalid (I)** porque:

```routeros
:do { /ip hotspot profile set $hsprof login-url="$loginUrl" } on-error={}
```

**Causa raiz**: Em RouterOS, `"$variavel"` **não expande** a variável — o texto literal `$loginUrl` é passado.

## Solução Implementada (v7.1.12)

Usamos **concatenação explícita** que força o contexto de expressão:

```routeros
:do { /ip hotspot profile set $hsprof login-url=("" . $loginUrl) } on-error={}
:do { /ip hotspot profile set $hsprof dns-name=("" . $dnsName) } on-error={}
```

## Arquivos Alterados

- ✅ `supabase/functions/mikrotik-scripts/index.ts` - VERSION + sintaxe corrigida
- ✅ `supabase/functions/mikrotik-script-generator/index.ts` - VERSION
- ✅ `src/components/modals/ScriptModal.tsx` - default 7.1.12
- ✅ `src/pages/Embarcacoes.tsx` - fallback 7.1.12

## Validação no MikroTik

1. Gerar bootstrap v7.1.12 e importar
2. Verificar script: `/system script print where name="navspot-action-processor"`
   - Esperado: **sem flag I (invalid)**
3. Rodar manualmente: `/system script run navspot-action-processor`
   - Esperado: log `NAVSPOT-ACTION v7.1.12: Start` e `OK`
4. Verificar profile: `/ip hotspot profile print detail where name="hsprof-navspot"`
   - Esperado: `login-url` com a URL completa (incluindo `$(mac)`, `$(ip)`)
