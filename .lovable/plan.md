# v6.9.39 - Correção do erro "syntax error (line 119 column 8)"

## Problema

O erro `syntax error (line 119 column 8)` ocorreu durante `/import` no RouterOS 6.x na versão 6.9.38.

## Causa Raiz

O bloco `:if ([:len $_hsprof] = 0) do={...}` com múltiplas linhas (lines 845-849) causou o erro de parsing. O RouterOS 6.x tem problemas com blocos `:if...do={}` que abrangem várias linhas durante `/import`.

## Solução Aplicada (v6.9.39)

### Mudança no Hotspot Profile

**DE (multi-linha problemático):**
```routeros
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}
```

**PARA (idempotente com :do {} on-error={}):**
```routeros
# Passo A: Criar profile (idempotente - on-error ignora se ja existe)
:do { /ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} } on-error={}

# Passo B: Obter handle do profile
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
```

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-script-generator/index.ts` | VERSION=6.9.39, removido bloco :if [:len] |
| `mikrotik-recovery-download/index.ts` | VERSION=6.9.39, removido bloco :if [:len] |
| `ScriptModal.tsx` | scriptVersion=6.9.39 |

## Teste

```routeros
/import navspot-bootstrap-v6.9.39.rsc
# Deve completar SEM "syntax error"

/log print where message~"NAVSPOT"
# Deve mostrar: INSTALACAO CONCLUIDA!
```
