# ✅ Correção v6.9.28 — Wildcard Apple CPD Removido

## Problema Resolvido
O erro `expected end of command (line 644 column 33)` era causado por `dst-host="*.apple.com"` que o parser do RouterOS 6.x não aceita durante `/import`.

## Correções Aplicadas

### 1. Recovery (`mikrotik-recovery-download`)
- Removido: `*.apple.com`
- Adicionado: `www.apple.com` (host explícito)
- Mantido: `captive.apple.com` (já existia)

### 2. Bootstrap (`mikrotik-script-generator`)
- Mesmo ajuste do Recovery para manter consistência

### 3. Linter Expandido
- Ambos os arquivos agora bloqueiam o padrão `dst-host="*.apple.com"` com mensagem de erro clara

## Versão
- v6.9.28 deployed

## Teste no MikroTik
```routeros
/import navspot-recovery-v6.9.28.rsc
# Deve completar sem "expected end of command"

# Verificar walled-garden
/ip hotspot walled-garden print where comment~"navspot-cpd-apple"
# Deve mostrar captive.apple.com e www.apple.com (não *.apple.com)
```
