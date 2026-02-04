

# Correção: Action Processor Não Executa - Problema de Escopo de Variável Global

## Diagnóstico Confirmado

Analisando a imagem dos logs do MikroTik:

| Linha | Hora | Log | Status |
|-------|------|-----|--------|
| 975 | 15:02:41 | `NAVSPOT-SYNC: pending_actions_pipe extraido (187 chars)` | ✅ OK |
| 976 | 15:02:41 | `NAVSPOT-SYNC: Variavel global setada, acionando action-processor...` | ✅ OK |
| 977 | 15:02:41 | `NAVSPOT-SYNC: OK` | ⚠️ Executou muito rápido |
| 979 | 15:02:43 | `NAVSPOT-SYNC: Falha` | ❌ ERRO |

O log **não mostra** `NAVSPOT-ACTION: Variavel recebida, len=...` porque:
1. O script está com versão **7.1.2** (instalado às 15:02:33)
2. A edge function já está em **7.1.3** (deploy recente)
3. Os scripts precisam ser **reinstalados** para pegar a nova versão

Mas o problema real é mais profundo: mesmo com v7.1.3, a variável global pode não estar persistindo.

## Causa Raiz: Race Condition no RouterOS 6.x

No RouterOS 6.x, quando você define uma variável global e imediatamente chama outro script:

```routeros
:global navspotActions $actions     # Define
:delay 500ms                        # Delay
/system script run navspot-action-processor  # Chama
```

O script chamado pode não ver o valor porque:
1. A variável é definida no contexto do script pai
2. O script filho redeclara `:global navspotActions` **sem valor**
3. No RouterOS 6.x, isso pode resetar a variável

## Solução: Usar Arquivo Temporário ao invés de Variável Global

A solução mais robusta para RouterOS 6.x é passar os dados via **arquivo temporário** ao invés de variável global.

### Mudanças no Arquivo `supabase/functions/mikrotik-scripts/index.ts`

#### 1. Sync Script - Salvar ações em arquivo

**Alteração nas linhas 417-424:**

```routeros
# ANTES:
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:log info ("NAVSPOT-SYNC: Variavel global setada, acionando action-processor...")
:delay 500ms
/system script run navspot-action-processor

# DEPOIS:
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
# v7.1.4: Usar arquivo ao invés de variavel global para evitar race condition
:do { /file remove "navspot-actions.txt" } on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 500ms
/file set [find name="navspot-actions.txt"] contents=$actions
:log info ("NAVSPOT-SYNC: Acoes salvas em arquivo, acionando action-processor...")
:delay 500ms
/system script run navspot-action-processor
```

#### 2. Action Processor - Ler ações do arquivo

**Alteração nas linhas 430-443:**

```routeros
# ANTES:
:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
:local rawData $navspotActions
:log info ("NAVSPOT-ACTION: Variavel recebida, len=" . [:len $rawData])
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Variavel navspotActions VAZIA - nada a processar"
:return
}

# DEPOIS:
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
# v7.1.4: Ler acoes de arquivo ao inves de variavel global
:local actionsFile [/file find name="navspot-actions.txt"]
:if ([:len $actionsFile] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Arquivo navspot-actions.txt NAO encontrado"
:return
}
:local rawData [/file get "navspot-actions.txt" contents]
:log info ("NAVSPOT-ACTION: Acoes lidas do arquivo, len=" . [:len $rawData])
:do { /file remove "navspot-actions.txt" } on-error={}
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Arquivo vazio - nada a processar"
:return
}
```

#### 3. Bump de Versão

- Alterar `VERSION` de `7.1.3` para `7.1.4`

## Resumo das Mudanças

| # | Arquivo | Linha | Mudança |
|---|---------|-------|---------|
| 1 | mikrotik-scripts/index.ts | 26 | Bump VERSION para 7.1.4 |
| 2 | mikrotik-scripts/index.ts | 417-424 | Sync salva ações em arquivo |
| 3 | mikrotik-scripts/index.ts | 430-443 | Action-processor lê do arquivo |
| 4 | Deploy | - | Redeploy edge function |

## Fluxo Corrigido

```text
             SYNC SCRIPT                         ACTION-PROCESSOR
                 │                                      │
   1. Extrai ações (187 chars)                          │
   2. Salva em navspot-actions.txt ──────────────────►  │
   3. Delay 500ms                                       │
   4. /system script run ─────────────────────────────► │
                                                        │◄─ Verifica arquivo existe
                                                        │◄─ Lê conteúdo do arquivo
                                                        │◄─ Log "len=187"
                                                        │◄─ Remove arquivo
                                                        │◄─ Processa ações
                                                        │◄─ Cria usuário
```

## Por Que Isso Funciona

1. **Persistência Garantida**: Arquivos no RouterOS são persistentes entre contextos de script
2. **Sem Race Condition**: O arquivo é escrito completamente antes do script ser chamado
3. **Atomicidade**: O action-processor remove o arquivo após leitura, evitando reprocessamento
4. **Compatibilidade**: Funciona tanto no RouterOS 6.x quanto no 7.x

## Passos Após Implementação

1. Deploy da edge function `mikrotik-scripts`
2. Gerar novo bootstrap script (v7.1.4)
3. Reimportar no MikroTik: `/import navspot-bootstrap-v7.1.4.rsc`
4. Aguardar sync e verificar logs:
   - `NAVSPOT-SYNC: Acoes salvas em arquivo...`
   - `NAVSPOT-ACTION: Acoes lidas do arquivo, len=187`
   - `NAVSPOT: Usuario criado - alexandre.silva`

