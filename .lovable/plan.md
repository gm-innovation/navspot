

# Fix v7.1.54: Diagnostico e resiliencia do sync

## Problema

O script `navspot-sync` roda a cada minuto no MikroTik (log "NAVSPOT-SYNC v7.1.53") mas NUNCA chega ao final ("OK"). Nenhuma chamada POST chega ao servidor. A `ultima_sincronizacao` esta parada em 6 de fevereiro.

O script esta crashando silenciosamente em algum ponto entre a primeira linha de log e o final, sem nenhum registro de erro.

## Mudancas (4 pontos cirurgicos)

Arquivo unico: `supabase/functions/mikrotik-scripts/index.ts` (funcao `generateSyncSource`)

### 1. Proteger `uptime-as-secs` com fallback (linha 737)

**ANTES:**
```text
:local us [/system resource get uptime-as-secs]
```

**DEPOIS:**
```text
:local us 0
:do {:set us [/system resource get uptime-as-secs]} on-error={:log warning "NAVSPOT-SYNC: uptime-as-secs indisponivel";:set us 0}
```

Se `uptime-as-secs` nao existir nessa build de ROS 7, o script nao crasha -- apenas desabilita o timeout do lock (us=0).

### 2. Adicionar logging ao on-error do fetch (linha 784)

**ANTES:**
```text
} on-error={:set navspotSyncLock "0"}
```

**DEPOIS:**
```text
} on-error={:log warning "NAVSPOT-SYNC: fetch FALHOU";:set navspotSyncLock "0"}
```

### 3. Wrap global do corpo do sync

Envolver todo o corpo (da linha 733 ate a 830) em `:do { ... } on-error={...}` para capturar qualquer crash inesperado e logar a mensagem de erro.

**Estrutura resultante:**
```text
:log info "NAVSPOT-SYNC v7.1.54"
:do {
  [... todo o corpo existente: lock, coleta, fetch, processamento ...]
} on-error={:log error ("NAVSPOT-SYNC: CRASH=" . [:tostr $error]);:set navspotSyncLock "0"}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v7.1.54: OK"
```

Isso garante:
- Qualquer crash sera logado com a mensagem de erro exata
- O lock sera liberado em todos os caminhos
- O "OK" aparecera sempre, permitindo distinguir "sync completou" de "sync crashou"

### 4. VERSION bump para 7.1.54

Alterar `const VERSION = "7.1.53"` para `"7.1.54"`.

## O que NAO muda

- Nenhuma outra logica do sync (coleta de dados, parsing de resposta, execucao do action-processor)
- Nenhum outro arquivo (mikrotik-script-generator, mikrotik-sync, etc)
- Nenhum handler do action-processor

## Resultado esperado

Apos reinstalacao do sync no roteador:
- Se `uptime-as-secs` era o problema: sync passara a funcionar com fallback
- Se era outro problema: logs mostrarao `NAVSPOT-SYNC: CRASH=mensagem` com a causa exata
- Em todos os casos: `NAVSPOT-SYNC v7.1.54: OK` aparecera no log

## Deploy

Redeployar apenas `mikrotik-scripts`. O usuario precisara reimportar o bootstrap ou aguardar o guardian reparar o script.

