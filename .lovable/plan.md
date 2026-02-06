

# Plano: Corrigir Sincronização de Versão e Garantir Estabilidade

## Status Atual: v7.1.32 - CRITICAL FIX APLICADO

### Problema Resolvido em v7.1.32

O bug de "action-processor INVALIDO (0 bytes)" ocorria porque:
1. O instalador lia `[/file get contents]` para **validação** (prefix)
2. Depois lia `[/file get contents]` **novamente** para criar o script
3. A segunda leitura podia falhar (timing de flash) mesmo que a primeira passasse

**Fix v7.1.32:** Leitura única do conteúdo completo para uma variável `$scriptContent`:
- Retry loop para garantir conteúdo completo (>50 bytes)
- Validação do prefix a partir da variável
- Criação do script usando `source=$scriptContent` (não lê arquivo novamente)
- Elimina a race condition entre validação e criação

## Logs que Comprovam o Problema (v7.1.31)

```text
08:51:00  action baixado (4387 bytes)     <- Arquivo OK
08:51:00  action content INVALIDO         <- Leitura do prefix falhou
08:51:00  prefix=                          <- STRING VAZIA!
08:51:01  action-processor INVALIDO (0 bytes) <- Script criado vazio
08:51:01  Fallback inline v7.1.30F instalado  <- Fallback acionado
```

## Alterações v7.1.32

### 1. mikrotik-scripts/index.ts
- `generateAllScripts()` agora lê o conteúdo completo para `$scriptContent`
- Retry loop verifica se `[:len $scriptContent] < 50`
- Script criado com `source=$scriptContent` (variável, não arquivo)
- Aplica-se a sync, action-processor e guardian

### 2. mikrotik-script-generator/index.ts  
- Versão atualizada para 7.1.32

### 3. src/pages/Embarcacoes.tsx
- Default de versão atualizado para 7.1.32

## Roteiro de Teste

### Passo 1: Gerar Bootstrap v7.1.32
- Acessar /embarcacoes
- Gerar script para "Engenharia Googlemarine"
- Confirmar que modal mostra v7.1.32

### Passo 2: Testar no MikroTik
```routeros
/import navspot-bootstrap-v7.1.32.rsc
/log print where message~"NAVSPOT"
```

**Resultado esperado:**
```text
NAVSPOT-INSTALL: action baixado (4387 bytes)
NAVSPOT-INSTALL: action content valido (4387 bytes)  <- NOVO: mostra tamanho
NAVSPOT-INSTALL: navspot-action-processor v7.1.32 instalado <- SEM fallback "F"
```

## Diagrama do Fix

```text
v7.1.31 (PROBLEMA):
Fetch -> delay -> [:pick contents 0 100] -> OK
                  |
                  v
        [/file get contents] para criar script -> VAZIO!
                  |
                  v
        Script criado vazio -> Fallback

v7.1.32 (FIX):
Fetch -> delay -> [/file get contents] -> $scriptContent (retry até >50 bytes)
                  |
                  v
        [:pick $scriptContent 0 100] -> Validação
                  |
                  v
        source=$scriptContent -> Script completo (sem re-leitura)
```
