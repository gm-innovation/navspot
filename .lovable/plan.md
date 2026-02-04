

# Plano v7.1.1 — Bootstrap Robusto com Retry e Diagnóstico

## Objetivo

Implementar todas as melhorias de resiliência no bootstrap para garantir que o fetch dos scripts funcione mesmo em condições de rede instáveis ou lentas.

## Mudanças no Bootstrap (v7.1.0 -> v7.1.1)

### 1. Aumentar Delay de Estabilização

**Linha 366-367:** Aumentar de 10s para 15s

```routeros
# ANTES
:delay 10s

# DEPOIS
:delay 15s
```

### 2. Adicionar Verificação de Rota Default

**Novo bloco após estabilização:** Verificar se DHCP configurou rota default

```routeros
# 12.1. VERIFICAR ROTA DEFAULT
:local hasRoute false
:do {
  :local gw [/ip route get [find dst-address="0.0.0.0/0" active=yes] gateway]
  :if ([:len $gw] > 0) do={ :set hasRoute true }
} on-error={}
:if ($hasRoute = false) do={
  :log warning "NAVSPOT v7.1.1: Rota default NAO encontrada - fetch pode falhar"
} else={
  :log info "NAVSPOT v7.1.1: Rota default OK"
}
```

### 3. Adicionar Verificação de DNS

**Novo bloco:** Testar resolução DNS antes do fetch

```routeros
# 12.2. VERIFICAR DNS
:local dnsOk false
:do {
  :local resolved [/resolve focqrhkozhdefohroqyi.supabase.co]
  :if ([:len $resolved] > 0) do={ :set dnsOk true }
} on-error={}
:if ($dnsOk = false) do={
  :log warning "NAVSPOT v7.1.1: DNS NAO resolvido - tentando fetch mesmo assim"
} else={
  :log info "NAVSPOT v7.1.1: DNS OK"
}
```

### 4. Implementar Retry com Logs Detalhados

**Linhas 369-380:** Substituir fetch simples por loop com 3 tentativas

```routeros
# 13. BAIXAR SCRIPTS VIA API (com retry)
:local apiBase "https://..."
:local tk "TOKEN"
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk)

:local maxRetries 3
:local retryCount 0
:local fetchSuccess false

:log info "NAVSPOT v7.1.1: Iniciando download dos scripts..."

:while (($retryCount < $maxRetries) && ($fetchSuccess = false)) do={
  :set retryCount ($retryCount + 1)
  :log info ("NAVSPOT v7.1.1: Tentativa " . $retryCount . "/" . $maxRetries)
  :do {
    /tool fetch url=$scriptsUrl check-certificate=no dst-path="ns-install.rsc"
    :set fetchSuccess true
  } on-error={
    :log warning ("NAVSPOT v7.1.1: Fetch falhou na tentativa " . $retryCount)
    :if ($retryCount < $maxRetries) do={
      :log info "NAVSPOT v7.1.1: Aguardando 5s antes de retry..."
      :delay 5s
    }
  }
}
```

### 5. Tratamento de Sucesso/Falha

**Após o loop:** Condicional para import ou abort

```routeros
:if ($fetchSuccess = true) do={
  :log info "NAVSPOT v7.1.1: Fetch OK! Aguardando 4s para flash..."
  :delay 4s
  :log info "NAVSPOT v7.1.1: Importando scripts..."
  /import ns-install.rsc
  :delay 1s
  :do { /file remove "ns-install.rsc" } on-error={}
  :log info "NAVSPOT v7.1.1: Scripts instalados com sucesso!"
} else={
  :log error "NAVSPOT v7.1.1: FALHA CRITICA - Fetch falhou apos 3 tentativas"
  :log error "NAVSPOT v7.1.1: Verifique conectividade e execute manualmente:"
  :log error ("/tool fetch url=" . $scriptsUrl . " check-certificate=no dst-path=ns-install.rsc")
}
```

## Fluxo Completo da Seção 12-14

```text
12. AGUARDAR ESTABILIZACAO (15s)
    |
12.1. VERIFICAR ROTA DEFAULT
    - Se OK: log info
    - Se FALHA: log warning (continua)
    |
12.2. VERIFICAR DNS
    - Tenta resolver dominio Supabase
    - Se OK: log info
    - Se FALHA: log warning (continua)
    |
13. FETCH COM RETRY (3 tentativas)
    |-- Tentativa 1 -> FALHA -> delay 5s
    |-- Tentativa 2 -> FALHA -> delay 5s
    |-- Tentativa 3 -> FALHA -> ABORT
    |-- SUCESSO -> continua
    |
13.1. IMPORT (se fetch OK)
    - :delay 4s (flash lento)
    - /import ns-install.rsc
    - Cleanup arquivo
    |
14. PRIMEIRO SYNC (35s delay)
    - /system script run navspot-sync
```

## Alterações Técnicas

| Linha | Mudança |
|-------|---------|
| 8 | `VERSION = "7.1.1"` |
| 366 | Delay de 10s para 15s |
| 367-380 | Novo bloco com verificação de rota, DNS, retry 3x e tratamento de erro |

## Checklist de Implementação

| # | Item | Detalhes |
|---|------|----------|
| 1 | VERSION | Atualizar para 7.1.1 |
| 2 | Delay estabilização | 10s -> 15s |
| 3 | Verificar rota default | Log warning se não existir |
| 4 | Verificar DNS | Log warning se não resolver |
| 5 | Retry 3x | Com delay 5s entre tentativas |
| 6 | Delay pós-fetch | 3s -> 4s |
| 7 | Tratamento de falha | Log erro detalhado com comando manual |
| 8 | Limite de 160 chars | Todas as linhas RouterOS < 160 caracteres |

## Resultado Esperado nos Logs

### Cenário de Sucesso
```
NAVSPOT v7.1.1: Aguardando 15s para rede estabilizar...
NAVSPOT v7.1.1: Rota default OK
NAVSPOT v7.1.1: DNS OK
NAVSPOT v7.1.1: Iniciando download dos scripts...
NAVSPOT v7.1.1: Tentativa 1/3
NAVSPOT v7.1.1: Fetch OK! Aguardando 4s para flash...
NAVSPOT v7.1.1: Importando scripts...
NAVSPOT v7.1.1: Scripts instalados com sucesso!
```

### Cenário de Retry
```
NAVSPOT v7.1.1: Tentativa 1/3
NAVSPOT v7.1.1: Fetch falhou na tentativa 1
NAVSPOT v7.1.1: Aguardando 5s antes de retry...
NAVSPOT v7.1.1: Tentativa 2/3
NAVSPOT v7.1.1: Fetch OK! Aguardando 4s para flash...
```

### Cenário de Falha Total
```
NAVSPOT v7.1.1: Tentativa 3/3
NAVSPOT v7.1.1: Fetch falhou na tentativa 3
NAVSPOT v7.1.1: FALHA CRITICA - Fetch falhou apos 3 tentativas
NAVSPOT v7.1.1: Verifique conectividade e execute manualmente:
/tool fetch url=https://... check-certificate=no dst-path=ns-install.rsc
```

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.1, delay 15s, verificações de rota/DNS, retry 3x, tratamento de erro |

