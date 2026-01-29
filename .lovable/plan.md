

# Correções Críticas NAVSPOT v6.5

## Problemas Identificados

| # | Problema | Localização | Severidade |
|---|----------|-------------|------------|
| 1 | Token não criado corretamente | Linhas 307-311 | CRÍTICO |
| 2 | Parsing de `\|` usando `[:len $p1] > 0` (incorreto) | Linha 226 | CRÍTICO |
| 3 | Verificação de `[[ ]]` usando `[:len $start] > 0` (incorreto) | Linha 223 | CRÍTICO |
| 4 | Faltam regras NTP e ICMP no Walled Garden | Linhas 300-305 | MENOR |

---

## Correção 1: Token (Seção 9)

### Código Atual (Linhas 307-311)

```routeros
# 9. TOKEN
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token salvo"
```

### Problema

O comando `/file print file="navspot-token.txt" where name=""` não cria o arquivo corretamente. O `/file set` falha porque o arquivo não existe.

### Solução

Usar `/file add` que cria o arquivo e define o conteúdo em um único comando:

```routeros
# 9. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token criado"
```

---

## Correção 2: Parsing de `|` no Action Processor

### Código Atual (Linha 226)

```
:if ([:len $p1] > 0) do={
```

### Problema

O `[:find]` retorna um número (posição) ou `-1` se não encontrar. Usar `[:len $p1]` não faz sentido para números - isso tenta calcular o comprimento de um número, não verificar se é válido.

### Solução

Verificar se `$p1 >= 0`:

```
:if ($p1 >= 0) do={
```

---

## Correção 3: Extração de `[[ ]]` no Sync Script

### Código Atual (Linha 223)

```
:if (([:len $start] > 0) && ([:len $end] > 0)) do={
```

### Problema

Mesmo problema - `[:find]` retorna um número, não uma string. `[:len]` de um número não é a forma correta de verificar.

### Solução

Verificar se os valores são >= 0:

```
:if (($start >= 0) && ($end >= 0)) do={
```

---

## Correção 4: Walled Garden (Seção 8)

### Código Atual (Linhas 300-305)

```routeros
# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
```

### Problema

Faltam regras para NTP (sincronização de relógio) e ICMP (ping/diagnóstico).

### Solução

Adicionar regras para NTP e ICMP:

```routeros
# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"
:log info "NAVSPOT: Walled Garden configurado"
```

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Corrigir 4 problemas |

---

## Detalhes Técnicos das Mudanças

### 1. Linha 223 - syncScriptSource

**De:**
```typescript
:if (([:len \\$start] > 0) && ([:len \\$end] > 0)) do={
```

**Para:**
```typescript
:if ((\\$start >= 0) && (\\$end >= 0)) do={
```

### 2. Linha 226 - actionProcessorSource

**De:**
```typescript
:if ([:len \\$p1] > 0) do={
```

**Para:**
```typescript
:if (\\$p1 >= 0) do={
```

### 3. Linhas 300-311 - Template do Bootstrap

**De:**
```typescript
# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 9. TOKEN
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token salvo"
```

**Para:**
```typescript
# 8. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"
:log info "NAVSPOT: Walled Garden configurado"

# 9. TOKEN
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
:log info "NAVSPOT: Token criado"
```

---

## Resumo das Correções

| Problema | Causa | Solução |
|----------|-------|---------|
| Token não criado | `/file print` não cria arquivo | Usar `/file add` |
| Parsing `\|` quebrado | `[:len $p1]` em número | Usar `$p1 >= 0` |
| Extração `[[ ]]` quebrada | `[:len $start]` em número | Usar `$start >= 0` |
| Faltam NTP/ICMP | Regras incompletas | Adicionar regras |

---

## Fluxo Após Correções

```text
1. MikroTik executa navspot-bootstrap.rsc
   ├── Seção 8: Walled Garden com DNS, DHCP, NTP, ICMP ✓
   └── Seção 9: Token criado com /file add ✓

2. Scheduler executa navspot-sync a cada 1 min
   ├── Envia heartbeat
   ├── Recebe: { pending_actions_pipe: "[[ create_user|joao|123|Tripulacao; ]]" }
   ├── Extração [[ ]] funciona com $start >= 0 ✓
   ├── :global navspotActions = "create_user|joao|123|Tripulacao;"
   └── Chama navspot-action-processor

3. navspot-action-processor executa
   ├── Parsing de | funciona com $p1 >= 0 ✓
   └── Cria usuário "joao" com sucesso
```

