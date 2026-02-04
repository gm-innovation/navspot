

# Correção: Action Processor Não Recebe Ações do Sync

## Diagnóstico Completo

Analisando os logs do MikroTik na imagem:

| Hora | Log | Observação |
|------|-----|------------|
| 14:06:40 | `fetch: file "navspot-resp.txt" downloaded` | ✅ Resposta recebida |
| 14:06:41 | `pending_actions_pipe extraido (187 chars)` | ✅ Ações extraídas |
| 14:06:41 | `NAVSPOT-SYNC: OK` | ✅ Sync concluído |
| 14:06:43 | `login failed: invalid username or password` | ❌ Usuário não existe |

**O que FALTA nos logs:** `NAVSPOT-ACTION v7.1.2: Iniciando - ...`

Isso significa que o action-processor está recebendo `$navspotActions` como **vazio** e retornando imediatamente com `Sem acoes pendentes` (que também não aparece porque o log seria silencioso).

## Causa Raiz

O problema está no **escopo de variáveis globais** do RouterOS:

1. **Script sync** define:
   ```routeros
   :global navspotActions $actions      # Define com valor
   /system script run navspot-action-processor
   ```

2. **Script action-processor** começa com:
   ```routeros
   :global navspotActions               # Redeclara SEM valor
   :local rawData $navspotActions       # Lê vazio!
   ```

Quando você declara `:global varname` **sem valor**, no RouterOS 6.x isso pode sobrescrever ou não pegar o valor definido em outro contexto, especialmente quando o script é chamado via `/system script run` em sequência rápida.

## Solução

Modificar o action-processor para **verificar se a variável existe antes de usar**, e adicionar fallback:

### Mudanças no `supabase/functions/mikrotik-scripts/index.ts`

#### 1. Script Sync - Garantir que a variável persista

Adicionar um pequeno delay e log extra para debugging:

```routeros
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:log info ("NAVSPOT-SYNC: Acionando action-processor...")
:delay 500ms   # <- Aumentar de 250ms para 500ms
/system script run navspot-action-processor
```

#### 2. Script Action-Processor - Melhorar leitura da variável

```routeros
# Antes:
:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
:local rawData $navspotActions

# Depois:
:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
:log info ("NAVSPOT-ACTION: Lendo variavel global, len=" . [:len $navspotActions])
:local rawData $navspotActions
```

#### 3. Alternativa Mais Robusta: Passar Via Argumento

Ao invés de usar variável global, passar as ações como **argumento do script**:

**Script Sync:**
```routeros
:global navspotActions $actions
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:delay 500ms
# Usar :execute com variável de ambiente ao invés de /system script run
:do {
  /system script run [find name="navspot-action-processor"]
} on-error={
  :log error "NAVSPOT-SYNC: Falha ao executar action-processor"
}
```

**Script Action-Processor (início):**
```routeros
:global navspotActions
:global navspotLock
:log info ("NAVSPOT-ACTION: Iniciando com len=" . [:len $navspotActions])
:if ([:len $navspotActions] = 0) do={
  :log warning "NAVSPOT-ACTION: Variavel navspotActions vazia ou nao definida"
  :set navspotLock "0"
  :return
}
```

### Solução Definitiva Recomendada

A solução mais robusta é **aumentar o delay** e **adicionar logs de debug** para confirmar que a variável está sendo passada:

## Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

### Mudança 1: generateSyncSource() - Aumentar delay (linha 421)

```typescript
// De:
:delay 250ms
/system script run navspot-action-processor

// Para:
:log info ("NAVSPOT-SYNC: Variavel global setada, len=" . [:len $actions])
:delay 500ms
/system script run navspot-action-processor
```

### Mudança 2: generateActionProcessorSource() - Adicionar log de debug (linha 436)

```typescript
// De:
:local rawData $navspotActions
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log info "NAVSPOT: Sem acoes pendentes"
:return
}

// Para:
:local rawData $navspotActions
:log info ("NAVSPOT-ACTION: Variavel recebida, len=" . [:len $rawData])
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log warning "NAVSPOT-ACTION: Variavel navspotActions VAZIA - nada a processar"
:return
}
```

### Mudança 3: Versão bump

Atualizar `VERSION` para `7.1.3` para rastrear a mudança.

## Fluxo Corrigido

```text
                  SYNC SCRIPT                    ACTION-PROCESSOR
                      │                                 │
   1. Extrai ações ──►│                                 │
   2. Define global ──►:global navspotActions $actions  │
   3. Log debug ──────►"len=187"                        │
   4. Delay 500ms ────►                                 │
   5. Run ────────────►/system script run ─────────────►│
                                                        │◄─ :global navspotActions
                                                        │◄─ Log "len=187"
                                                        │◄─ Processa ações
                                                        │◄─ Cria usuário
                                                        │
```

## Checklist de Implementação

| # | Tarefa | Arquivo | Linha |
|---|--------|---------|-------|
| 1 | Aumentar delay de 250ms para 500ms | mikrotik-scripts/index.ts | 421 |
| 2 | Adicionar log de debug no sync | mikrotik-scripts/index.ts | 420 |
| 3 | Adicionar log de debug no action-processor | mikrotik-scripts/index.ts | 437 |
| 4 | Mudar log de "Sem acoes" para warning | mikrotik-scripts/index.ts | 439 |
| 5 | Bump versão para 7.1.3 | mikrotik-scripts/index.ts | 26 |
| 6 | Re-deploy mikrotik-scripts | - | - |

## Após a Correção

1. **Gerar novo script bootstrap** via painel
2. **Reimportar no MikroTik** com `/import navspot-bootstrap-v7.1.3.rsc`
3. Aguardar o próximo sync e verificar se aparece:
   - `NAVSPOT-SYNC: Variavel global setada, len=XXX`
   - `NAVSPOT-ACTION: Variavel recebida, len=XXX`
   - `NAVSPOT: Usuario criado - alexandre.silva`

## Nota Importante

**SIM, você precisará atualizar o script no MikroTik** após esta correção, pois a mudança está no código dos scripts `navspot-sync` e `navspot-action-processor` que são instalados durante o bootstrap.

