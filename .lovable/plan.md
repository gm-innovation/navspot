

# Plano: Corrigir Timing de Leitura do Action Processor

## ✅ IMPLEMENTADO em v7.1.31

### Alterações Realizadas

1. **Docblock atualizado** (linhas 8-41)
   - Versão: v7.1.25 → v7.1.31
   - Documentada nova correção de content read timing

2. **Sync script** (linhas 362-405)
   - Delay pós-fetch: 1500ms → 2500ms
   - Adicionado retry loop para leitura do conteúdo (3 tentativas)
   - Log diferenciado: "sync size retry" vs "sync content retry"

3. **Action processor** (linhas 419-464)
   - Delay pós-fetch: 1500ms → 2500ms
   - Adicionado retry loop para leitura do conteúdo (3 tentativas)
   - Log diferenciado: "action size retry" vs "action content retry"

4. **Guardian** (linhas 521-564)
   - Delay pós-fetch: 1500ms → 2500ms
   - Adicionado retry loop para leitura do conteúdo (3 tentativas)
   - Log diferenciado: "guardian size retry" vs "guardian content retry"

### Fluxo de Validação Corrigido

```text
/tool fetch --> OK (4387 bytes)
       |
       v
:delay 2500ms  (aumentado de 1500ms)
       |
       v
/file get size --> Retry até 3x --> OK (4387)
       |
       v
/file get contents --> Retry até 3x --> OK (":log info...")
       |                    ^
       |                    |
       +-- se vazio, :delay 1500ms e retry
       |
       v
Validação [:find ":log info"] --> PASSOU
       |
       v
/system script add --> action-processor COMPLETO instalado
```

### Logs Esperados no MikroTik (caso precise retry)

```text
NAVSPOT-INSTALL: action baixado (4387 bytes)
NAVSPOT-INSTALL: action content retry 1/3      <- Novo log
NAVSPOT-INSTALL: action content retry 2/3      <- Se necessário
NAVSPOT-INSTALL: action content valido         <- Sucesso após retry
NAVSPOT-INSTALL: navspot-action-processor v7.1.31 instalado
```

### Próximo Passo

Executar novo bootstrap no MikroTik para validar a correção:

```routeros
/tool fetch url="https://focqrhkozhdefohroqyi.supabase.co/functions/v1/mikrotik-scripts?type=all&token=SEU_TOKEN" dst-path=ns-install.rsc check-certificate=no
:delay 3s
/import ns-install.rsc
```

Verificar nos logs se o action-processor foi instalado como v7.1.31 (não v7.1.31F fallback).
