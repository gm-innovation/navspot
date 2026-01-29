

# Correção do Bootstrap Script v6.1 - Problemas Críticos

## Problemas Identificados no v6.0

| # | Problema | Causa | Criticidade |
|---|----------|-------|-------------|
| 1 | DHCP client duplicado na WAN | Adiciona sem remover o existente (defconf) | Crítico |
| 2 | Falta de delay entre migrações | Portas migradas muito rápido, conflitos | Crítico |
| 3 | Falta validação da interface WAN | Script falha silenciosamente se ether1 não existe | Crítico |
| 4 | Bridge defconf fica vazia | Lixo de configuração após migração | Opcional |
| 5 | Falta logs intermediários | Difícil debugar qual porta falhou | Opcional |

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar - adicionar correções críticas |

---

## Correções a Aplicar

### 1. Adicionar Validação Inicial da WAN (Nova Seção 0)

Antes de qualquer operação, validar que a interface WAN existe:

```routeros
# 0. VALIDACAO INICIAL
:if ([:len [/interface find name="${wanInterface}"]] = 0) do={
  :log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
  :error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"
```

Esta validação aborta o script imediatamente se a WAN não existir, evitando configuração parcial.

---

### 2. Mover Configuração WAN para Antes da Bridge (Nova Seção 2)

Ordem atual (problemática):
```
1. Limpeza → 2. Bridge → ... → 10. WAN
```

Nova ordem (correta):
```
0. Validação → 1. Limpeza → 2. WAN → 3. Identidade → 4. Bridge → ...
```

Isso garante que a WAN esteja pronta antes de qualquer outra configuração.

---

### 3. Remover DHCP Client Existente Antes de Adicionar

Código atual:
```routeros
/ip dhcp-client add interface=ether1 disabled=no comment="navspot-wan"
```

Código corrigido:
```routeros
:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
```

Isso previne duplicação de DHCP clients na mesma interface.

---

### 4. Adicionar Delays e Logs nas Migrações de Portas

Código atual:
```typescript
const portMigrationCommands = migrationOrder.map(port => 
  `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"`
).join('\n')
```

Código corrigido:
```typescript
// Última porta não precisa de delay (script termina logo após)
const portMigrationCommands = migrationOrder.map((port, index) => {
  const isLast = index === migrationOrder.length - 1
  const delay = isLast ? '' : ':delay 500ms'
  const logMessage = isLast 
    ? `NAVSPOT: ${port} migrada - Winbox vai reconectar`
    : `NAVSPOT: ${port} migrada`
  
  return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "${logMessage}"${delay ? '\n' + delay : ''}`
}).join('\n')
```

---

### 5. Adicionar Limpeza Final da Bridge Defconf

Nova seção após migração de portas:
```routeros
# 12. LIMPEZA FINAL (remover bridge defconf vazia)
:do { /interface bridge remove [find name="bridge"] } on-error={}
:log info "NAVSPOT: Bridge defconf removida"
```

---

## Nova Estrutura do Script v6.1

```text
# 0. VALIDACAO INICIAL
  - Verificar se interface WAN existe
  - Abortar se não existir

# 1. LIMPEZA INICIAL
  - Remover configs navspot existentes
  - Delay 2s

# 2. CONFIGURAR WAN (ANTES da bridge)
  - Remover DHCP client existente na interface
  - Adicionar DHCP client novo
  - Log

# 3. IDENTIDADE
  - Set system identity

# 4. CRIAR BRIDGE1 VAZIA
  - Delay 1s

# 5. CONFIGURAR REDE NA BRIDGE1
  - IP, Pool, DHCP, DNS

# 6. NAT
  - Masquerade na WAN

# 7. HOTSPOT
  - Profile + Server

# 8. WALLED GARDEN
  - DNS, DHCP, Supabase

# 9. TOKEN
  - Criar arquivo e salvar

# 10. SYNC SCRIPT + SCHEDULER

# 11. MIGRACAO SEGURA DE PORTAS
  - ether5 → log → delay 500ms
  - ether4 → log → delay 500ms
  - ether3 → log → delay 500ms
  - ether2 → log (sem delay - última)

# 12. LIMPEZA FINAL
  - Remover bridge defconf

# 13. FINALIZACAO
  - Logs finais
```

---

## Mudanças Técnicas no Código

### Atualizar wanConfig

```typescript
// Configuração WAN com remoção prévia
const wanConfig = wanType === 'dhcp' 
  ? `:do { /ip dhcp-client remove [find interface=${wanInterface}] } on-error={}
/ip dhcp-client add interface=${wanInterface} disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ${wanInterface}"`
  : `:log info "NAVSPOT: WAN ${wanInterface} configurada como ${wanType} (manual)"`
```

### Atualizar portMigrationCommands

```typescript
// Gerar comandos com delays e logs individuais
const portMigrationCommands = migrationOrder.map((port, index) => {
  const isLast = index === migrationOrder.length - 1
  const delay = isLast ? '' : '\n:delay 500ms'
  const logMessage = isLast 
    ? `NAVSPOT: ${port} migrada - Winbox vai reconectar`
    : `NAVSPOT: ${port} migrada`
  
  return `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"
:log info "${logMessage}"${delay}`
}).join('\n\n')
```

### Atualizar Template Principal

```typescript
return `:log info "NAVSPOT v6.1: Iniciando instalacao..."

# 0. VALIDACAO INICIAL
:if ([:len [/interface find name="${wanInterface}"]] = 0) do={
  :log error "NAVSPOT: ERRO CRITICO - Interface ${wanInterface} nao existe!"
  :error "Abortando: WAN inexistente"
}
:log info "NAVSPOT: Interface WAN (${wanInterface}) validada"

# 1. LIMPEZA INICIAL (remover configs antigas)
...

# 2. CONFIGURAR WAN (antes de criar bridge)
${wanConfig}

# 3. IDENTIDADE
/system identity set name="${embarcacao.nome}"

# 4. CRIAR BRIDGE1 VAZIA (sem portas ainda)
...

# 5-10. [resto igual]

# 11. MIGRACAO SEGURA DE PORTAS
:log info "NAVSPOT: Iniciando migracao de portas..."
${portMigrationCommands}

# 12. LIMPEZA FINAL (remover bridge defconf vazia)
:do { /interface bridge remove [find name="bridge"] } on-error={}
:log info "NAVSPOT: Bridge defconf removida"

# 13. FINALIZACAO
...`
```

---

## Comparação v6.0 vs v6.1

| Aspecto | v6.0 (Atual) | v6.1 (Novo) |
|---------|--------------|-------------|
| Validação WAN | Nenhuma | Aborta se não existe |
| Ordem da WAN | Seção 10 (após tudo) | Seção 2 (início) |
| DHCP client | Apenas add | Remove + Add |
| Delay entre portas | Nenhum | 500ms cada |
| Log por porta | Apenas no final | Cada porta individualmente |
| Bridge defconf | Permanece vazia | Removida |
| Versão | 6.0 | 6.1 |

---

## Resultado Esperado

| Benefício | Descrição |
|-----------|-----------|
| Zero DHCP duplicado | Remove antes de adicionar |
| WAN validada | Aborta cedo se interface não existe |
| Migração estável | Delays previnem conflitos de switch chip |
| Debug facilitado | Log por porta individual |
| Config limpa | Bridge defconf removida |
| Ordem correta | WAN antes da bridge |

