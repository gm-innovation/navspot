
# Plano v6.9.1: Script de Instalação Única + Correções Críticas

## Resumo Executivo

Este plano implementa a versão v6.9.1 com **5 correções críticas**:

1. **Eliminação do fluxo de duas etapas** - Instalação completa em script único (sem navspot-finalize-ether2.rsc)
2. **ether2 como porta de gerência fixa** - Não participa mais da bridge, apenas Winbox/MNDP
3. **Correção do rate-limit** - Enviar formato `3M/3M` (maiúsculo) em vez de `3mb/3mb`
4. **Extração robusta do pipe** - Buscar `[[` e `]]` sem depender de espaços
5. **Delay + log antes do processor** - Reduzir condições de corrida

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `mikrotik-script-generator/index.ts` | Script único, ether2 fixa, extrair `[[`/`]]` sem espaço, delay extra |
| `mikrotik-sync/index.ts` | Formato rate-limit em maiúsculas |
| `ScriptModal.tsx` | Remover referências à Parte 2 (navspot-finalize) |

---

## Correção 1: Instalação em Script Único (Sem Parte 2)

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### 1.1 Remover geração do `finalizeScript`

**Linhas 99-101 - Código Atual:**
```typescript
const finalizeScript = generateFinalizeScript(
  hotspot as unknown as Hotspot
)
```

**Código Corrigido:**
```typescript
// v6.9.1: Script único - sem necessidade de navspot-finalize
const finalizeScript = ''
```

### 1.2 Remover função `generateFinalizeScript`

**Linhas 188-229** - Remover ou simplificar para retornar string vazia:
```typescript
function generateFinalizeScript(_hotspot: Hotspot): string {
  // v6.9.1: Fluxo simplificado - ether2 permanece como gerência
  return ''
}
```

### 1.3 Atualizar seção de migração de portas (apenas ether3, 4, 5 - ether2 NUNCA entra na bridge)

**Linhas 248-263 - Código Atual:**
```typescript
// Gerar migração de portas em ordem reversa (excluindo ether2 na Parte 1)
const allPorts = ['ether2', 'ether3', 'ether4', 'ether5']
const lanPorts = allPorts.filter(p => p !== wanInterface)

// Portas para migrar na Parte 1: excluir ether2 e ordenar em ordem reversa (5, 4, 3)
const partialPorts = lanPorts.filter(p => p !== 'ether2')
const partialMigrationOrder = [...partialPorts].sort((a, b) => b.localeCompare(a))
```

**Código Corrigido:**
```typescript
// v6.9.1: ether2 é porta de gerência fixa - NUNCA entra na bridge
// Apenas ether3, 4, 5 serão portas do Hotspot
const allLanPorts = ['ether3', 'ether4', 'ether5'].filter(p => p !== wanInterface)
const migrationOrder = [...allLanPorts].sort((a, b) => b.localeCompare(a))
```

### 1.4 Atualizar comandos de migração (sem avisos de troca de cabo)

**Linhas 588-606 - Código Atual:**
```routeros
# 11. MIGRACAO PARCIAL DE PORTAS (apenas ether3, 4, 5 - NAO migra ether2)
...
# 12. PAUSA PARA TROCA DE CABO
:log warning "=========================================="
:log warning "NAVSPOT: MIGRACAO PARCIAL CONCLUIDA"
:log warning "ACAO NECESSARIA:"
...
# 13. FINALIZACAO PARCIAL
:log info "NAVSPOT v6.9 Parte 1: Bootstrap parcial concluido"
```

**Código Corrigido:**
```routeros
# 11. MIGRACAO DE PORTAS LAN (ether3, 4, 5 - ether2 permanece como gerencia)
:log info "NAVSPOT: Migrando portas LAN para bridge1..."

${migrationCommands}

# 12. FINALIZACAO
:log info "=========================================="
:log info "NAVSPOT v6.9.1: INSTALACAO CONCLUIDA!"
:log info "Portas LAN (ether3-5) ativas no Hotspot"
:log info "Porta de gerencia (ether2) configurada para Winbox"
:log info "Sync rodando a cada ${syncIntervalMinutes} minuto(s)"
:log info "=========================================="
```

---

## Correção 2: Extração Robusta do Pipe `[[...]]`

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### 2.1 Atualizar syncScriptSource (linhas 283-286)

**Código Atual:**
```routeros
:local start [:find $resp "[[ "]
:local end [:find $resp " ]]"]
:if (($start >= 0) && ($end >= 0)) do={
:local actions [:pick $resp ($start + 3) $end]
```

**Código Corrigido:**
```routeros
:local start [:find $resp "[["]
:local end [:find $resp "]]"]
:if (($start >= 0) && ($end > $start)) do={
:local actions [:pick $resp ($start + 2) $end]
:log info ("NAVSPOT-SYNC: pending_actions_pipe extraido (" . [:len $actions] . " chars)")
:delay 250ms
```

Isso busca `[[` e `]]` sem depender de espaços e adiciona log/delay antes de chamar o processor.

---

## Correção 3: Formato Rate-Limit em Maiúsculas

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

### 3.1 Atualizar geração de rate-limit (linhas 626)

**Código Atual:**
```typescript
const rateLimit = `${p.velocidade_upload || '2M'}/${p.velocidade_download || '5M'}`
```

**Código Corrigido:**
```typescript
// v6.9.1: Garantir formato maiúsculo para compatibilidade RouterOS
const uploadRate = String(p.velocidade_upload || '2M').toUpperCase()
const downloadRate = String(p.velocidade_download || '5M').toUpperCase()
const rateLimit = `${uploadRate}/${downloadRate}`
```

### 3.2 Ajustar formatação no pipe (linha 726)

**Código Atual:**
```typescript
return `create_profile|${p.name || ''}|${p.rate_limit || '2M/5M'}|${p.shared_users || 1}|${p.limit_bytes || 0}`
```

**Código Corrigido:**
```typescript
// v6.9.1: Garantir rate-limit em maiúsculas
const rateLimit = String(p.rate_limit || '2M/5M').toUpperCase()
return `create_profile|${p.name || ''}|${rateLimit}|${p.shared_users || 1}|${p.limit_bytes || 0}`
```

---

## Correção 4: Verificação de Scripts Existentes Antes de Criar

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### 4.1 Atualizar seção 10 (linhas 578-586)

**Código Atual:**
```routeros
# 10. SYNC SCRIPT v6.8 + ACTION PROCESSOR v2
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
```

**Código Corrigido:**
```routeros
# 10. SYNC SCRIPT v6.9.1 + ACTION PROCESSOR v2 (revisado)
:if ([:len [/system script find name="navspot-action-processor"]] > 0) do={
/system script remove [find name="navspot-action-processor"]
}
:delay 100ms
/system script add name="navspot-action-processor" policy=read,write,policy,test source={

...

:log info "NAVSPOT: action-processor v2 criado"

:if ([:len [/system script find name="navspot-sync"]] > 0) do={
/system script remove [find name="navspot-sync"]
}
:delay 100ms
/system script add name="navspot-sync" policy=read,write,policy,test source={

...

:if ([:len [/system scheduler find name="navspot-sync-scheduler"]] = 0) do={
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup
}
:log info "NAVSPOT: Sync v6.9.1 + Action Processor v2 configurados"
```

---

## Correção 5: Atualizar ScriptModal (Remover Parte 2)

**Arquivo:** `src/components/modals/ScriptModal.tsx`

### 5.1 Simplificar interface

O modal deve:
- Exibir apenas o script de bootstrap (único)
- Remover referências a "Parte 2" e "Finalize"
- Simplificar instruções de instalação

---

## Resumo das Alterações de Versão

| Local | Valor Antigo | Valor Novo |
|-------|--------------|------------|
| `script-generator/index.ts` linha 70 | v6.9 | v6.9.1 |
| `script-generator/index.ts` linha 168 | '6.9' | '6.9.1' |
| Log inicial bootstrap | v6.9 | v6.9.1 |
| Log final bootstrap | Bootstrap parcial concluido | INSTALACAO CONCLUIDA! |
| Comentário sync | v6.8 | v6.9.1 |

---

## Estrutura Final do Script Gerado

```text
# NAVSPOT v6.9.1 - Bootstrap Completo (Script Único)
:log info "NAVSPOT v6.9.1: Iniciando instalacao..."

# 0. VALIDACAO INICIAL
# 1. LIMPEZA INICIAL
# 2. CONFIGURAR WAN
# 3. IDENTIDADE
# 4. CRIAR BRIDGE1 VAZIA
# 5. CONFIGURAR REDE NA BRIDGE1
# 6. NAT
# 6.5. GERENCIA WINBOX / NEIGHBOR DISCOVERY (ether2 fixa)
# 7. HOTSPOT
# 8. WALLED GARDEN
# 9. TOKEN
# 10. SYNC SCRIPT v6.9.1 + ACTION PROCESSOR v2
# 11. MIGRACAO DE PORTAS LAN (ether3, 4, 5)
# 12. FINALIZACAO

:log info "NAVSPOT v6.9.1: INSTALACAO CONCLUIDA!"
```

---

## Benefícios da v6.9.1

| Problema | Solução |
|----------|---------|
| Técnico precisa trocar cabo e rodar 2º script | Instalação única, ether2 fixa como gerência |
| `3mb/3mb` rejeitado pelo RouterOS | Rate-limit em maiúsculas `3M/3M` |
| Extração falha se JSON tem espaços diferentes | Buscar `[[`/`]]` sem depender de espaços |
| Action Processor executado antes de variável disponível | Delay de 250ms + log de confirmação |
| Scripts duplicados ao reimportar | Verificar existência e remover antes de criar |

---

## Validação Pós-Implementação

1. Gerar script para um hotspot de teste
2. Verificar no arquivo `navspot-bootstrap.rsc`:
   - [ ] Versão v6.9.1 no log inicial
   - [ ] Sem referências a navspot-finalize ou troca de cabo
   - [ ] ether2 configurada apenas em `mgmt` (não em bridge)
   - [ ] Extração usando `[[` e `]]` sem espaços
   - [ ] Delay 250ms antes de chamar action-processor
3. Verificar que o modal não exibe mais "Parte 2"
4. Testar importação no MikroTik:
   ```
   /file print where name~"navspot"
   /system script print where name~"navspot"
   /interface bridge port print
   # Apenas ether3, 4, 5 devem estar na bridge1
   ```

---

## Detalhes Técnicos

### Por que ether2 fixa?

- Manter acesso administrativo garantido durante e após instalação
- Elimina risco de "lockout" se algo der errado
- Simplifica suporte técnico (sempre conectar na porta 2)

### Por que rate-limit em maiúsculas?

RouterOS é sensível ao formato:
- ✅ `3M/3M` - aceito
- ❌ `3mb/3mb` - pode falhar parsing
- ❌ `3Mb/3Mb` - inconsistente

### Por que delay antes do processor?

Variáveis globais no RouterOS precisam de tempo para propagar entre contextos de script. O delay de 250ms garante que `$navspotActions` esteja disponível.
