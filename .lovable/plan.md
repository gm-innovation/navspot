

# NAVSPOT Bootstrap Script v6.0 - Backwards Safe Migration

## Problema Atual (v5.3)

O script atual tem duas falhas críticas:

| Problema | Causa | Resultado |
|----------|-------|-----------|
| Portas movidas antes da rede estar pronta | Bridge1 criada e portas adicionadas antes de IP/DHCP/Hotspot | Se migração falhar, MikroTik fica sem rede |
| Winbox cai no meio do script | ether2 migrado junto com outras portas | Script aborta antes de completar |
| Ordem incorreta | Infraestrutura (IP, DHCP, NAT) vem DEPOIS das portas | Estado inconsistente |

---

## Solução: v6.0 com "Backwards Safe Migration"

Nova ordem de execução que garante que a rede esteja 100% funcional ANTES de mover qualquer porta.

### Princípios v6.0

1. **Bridge1 vazia primeiro** - Criar bridge sem portas inicialmente
2. **Rede completa na bridge1** - IP, DHCP, Hotspot, NAT, Scripts, Token ANTES das portas
3. **Migração reversa** - ether5 → ether4 → ether3 → ether2 (usuário conectado por ether2)
4. **ether2 sempre por último** - Winbox só cai quando tudo está pronto
5. **Idempotente** - Pode rodar múltiplas vezes sem duplicar

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar - nova ordem v6.0 |
| `src/components/modals/ScriptModal.tsx` | Modificar - atualizar versão exibida e instrução de /import |

---

## Nova Estrutura do Script v6.0

```text
# 1. LIMPEZA INICIAL
  - Remover configurações navspot existentes
  - Remover bridge1 (sem tocar em outras bridges)
  - Delay 2s

# 2. CRIAR BRIDGE1 VAZIA
  - /interface bridge add name=bridge1 protocol-mode=rstp
  - NÃO adicionar portas ainda
  - Delay 1s

# 3. CONFIGURAR REDE NA BRIDGE1
  - IP address (192.168.88.1/24)
  - IP pool
  - DHCP server network
  - DHCP server
  - DNS
  - Log: "Rede IP configurada"

# 4. CONFIGURAR NAT
  - Masquerade na WAN
  - Log: "NAT configurado"

# 5. CONFIGURAR HOTSPOT
  - Profile
  - Server
  - Log: "Hotspot ativo"

# 6. WALLED GARDEN
  - DNS, DHCP, Supabase

# 7. TOKEN + SYNC
  - Criar arquivo token
  - Criar script sync
  - Criar scheduler

# 8. IDENTIDADE
  - /system identity set name

# 9. CONFIGURAR WAN (se DHCP)
  - DHCP client na interface WAN

# 10. MIGRAÇÃO SEGURA DE PORTAS (ORDEM REVERSA)
  - ether5 → bridge1
  - ether4 → bridge1
  - ether3 → bridge1
  - ether2 → bridge1 (ÚLTIMO - derruba Winbox)

# 11. LOGS FINAIS
  - "Portas migradas com sucesso"
  - "Bridge1 ativa e funcional"
  - "Bootstrap v6.0 concluido!"
```

---

## Comparação v5.3 vs v6.0

| Aspecto | v5.3 (Atual) | v6.0 (Novo) |
|---------|--------------|-------------|
| Ordem de portas | Todas juntas (ether2-5) | Reversa (5→4→3→2) |
| Quando rede está pronta | Depois de adicionar portas | ANTES de mover portas |
| Winbox cai quando | No meio da config | No FINAL (tudo pronto) |
| Risco de estado inconsistente | Alto | Zero |
| Cada porta | Uma linha (sem remove) | Remove + Add individual |

---

## Lógica de Migração de Portas

```typescript
// Gerar migração reversa (excluindo WAN)
const allPorts = ['ether2', 'ether3', 'ether4', 'ether5']
const lanPorts = allPorts.filter(p => p !== wanInterface)

// Ordenar para que ether2 seja sempre o último (se estiver na lista)
const migrationOrder = [...lanPorts].sort((a, b) => {
  // ether2 sempre por último
  if (a === 'ether2') return 1
  if (b === 'ether2') return -1
  // Restante em ordem reversa (5, 4, 3)
  return b.localeCompare(a)
})

// Gerar comandos de migração
const portMigrationCommands = migrationOrder.map(port => 
  `:do { /interface bridge port remove [find interface=${port}] } on-error={}
/interface bridge port add bridge=bridge1 interface=${port} comment="navspot-lan"`
).join('\n')
```

Resultado para WAN=ether1:
```routeros
:do { /interface bridge port remove [find interface=ether5] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether5 comment="navspot-lan"
:do { /interface bridge port remove [find interface=ether4] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether4 comment="navspot-lan"
:do { /interface bridge port remove [find interface=ether3] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether3 comment="navspot-lan"
:do { /interface bridge port remove [find interface=ether2] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether2 comment="navspot-lan"
```

---

## Atualização do ScriptModal

Mudanças necessárias:

| Item | Antes | Depois |
|------|-------|--------|
| Versão exibida | v5.2 | v6.0 |
| Nome do arquivo | navspot-{hotspot}.rsc | navspot-bootstrap.rsc |
| Instrução principal | Copiar no terminal | Usar /import |
| Recomendação | Copy/paste com cuidado | Download + upload + /import |

---

## Diagrama de Execução v6.0

```text
Tempo →
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[LIMPEZA] → [BRIDGE1 VAZIA] → [IP/DHCP/DNS] → [NAT] → [HOTSPOT]
                                    ↓
                            Bridge1 com rede OK
                                    ↓
            [WALLED GARDEN] → [TOKEN] → [SYNC] → [SCHEDULER]
                                    ↓
                            Infraestrutura 100%
                                    ↓
            [MIGRAR ether5] → [MIGRAR ether4] → [MIGRAR ether3]
                                    ↓
                            Usuário ainda conectado
                                    ↓
                           [MIGRAR ether2] ← Winbox cai aqui
                                    ↓
                           Reconectar 192.168.88.1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Script Completo v6.0 (Exemplo)

```routeros
# NAVSPOT Bootstrap v6.0 - Backwards Safe Migration
# Embarcacao: Nome
# WAN: ether1 (dhcp)

:log info "NAVSPOT v6.0: Iniciando instalacao..."

# 1. LIMPEZA INICIAL
:do { /ip hotspot remove [find name="hs-navspot"] } on-error={}
:do { /ip hotspot profile remove [find name~"navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip pool remove [find name="hs-pool-navspot"] } on-error={}
:do { /ip address remove [find comment="navspot"] } on-error={}
:do { /ip firewall nat remove [find comment="navspot-nat"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment~"navspot"] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment~"navspot"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
:do { /system script remove [find name="navspot-sync"] } on-error={}
:do { /system scheduler remove [find name="navspot-sync-scheduler"] } on-error={}
:do { /file remove "navspot-token.txt" } on-error={}
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
:delay 2s
:log info "NAVSPOT: Limpeza concluida"

# 2. CRIAR BRIDGE1 VAZIA
/interface bridge add name="bridge1" protocol-mode=rstp auto-mac=yes comment="navspot"
:delay 1s
:log info "NAVSPOT: Bridge1 criada (vazia)"

# 3. CONFIGURAR REDE NA BRIDGE1
/ip address add address=192.168.88.1/24 interface=bridge1 comment="navspot"
/ip pool add name="hs-pool-navspot" ranges=192.168.88.10-192.168.88.254
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1 comment="navspot"
/ip dhcp-server add name="dhcp-navspot" interface=bridge1 address-pool="hs-pool-navspot" disabled=no
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
:log info "NAVSPOT: Rede IP configurada"

# 4. NAT
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="navspot-nat"
:log info "NAVSPOT: NAT configurado em ether1"

# 5. HOTSPOT
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="embarcacao.navspot.local" html-directory=flash/hotspot login-by=http-chap,http-pap
/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot ativo"

# 6. WALLED GARDEN
/ip hotspot walled-garden add dst-host="navspot.local" action=allow comment="navspot-system"
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-system"
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
/ip hotspot walled-garden ip add dst-port=53 protocol=tcp action=accept comment="navspot-dns-tcp"
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"

# 7. TOKEN
/file print file="navspot-token.txt" where name=""
:delay 2s
/file set "navspot-token.txt" contents="TOKEN_AQUI"
:log info "NAVSPOT: Token salvo"

# 8. SYNC SCRIPT + SCHEDULER
/system script add name="navspot-sync" policy=read,write,policy,test source="..."
/system scheduler add name="navspot-sync-scheduler" interval=5m on-event="navspot-sync" start-time=startup
:log info "NAVSPOT: Sync configurado"

# 9. IDENTIDADE
/system identity set name="Nome Embarcacao"

# 10. WAN (DHCP)
/ip dhcp-client add interface=ether1 disabled=no comment="navspot-wan"
:log info "NAVSPOT: DHCP client em ether1"

# 11. MIGRACAO SEGURA DE PORTAS (ordem reversa, ether2 por ultimo)
:log info "NAVSPOT: Iniciando migracao de portas..."
:do { /interface bridge port remove [find interface=ether5] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether5 comment="navspot-lan"
:do { /interface bridge port remove [find interface=ether4] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether4 comment="navspot-lan"
:do { /interface bridge port remove [find interface=ether3] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether3 comment="navspot-lan"
:log info "NAVSPOT: Portas 5,4,3 migradas"
:do { /interface bridge port remove [find interface=ether2] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether2 comment="navspot-lan"
:log info "NAVSPOT: ether2 migrada - Winbox vai reconectar"

# 12. FINALIZACAO
:log info "NAVSPOT: Portas migradas com sucesso"
:log info "NAVSPOT: Bridge1 ativa e funcional"
:log info "NAVSPOT v6.0: Bootstrap concluido!"
:log info "NAVSPOT: Reconecte via 192.168.88.1"
```

---

## Mudanças no ScriptModal

Atualizar para:

1. Versão exibida: v6.0
2. Nome do arquivo: `navspot-bootstrap.rsc` (fixo)
3. Instrução principal enfatizando `/import`:

```tsx
<AlertDescription>
  <p className="mb-2">
    <strong>IMPORTANTE:</strong> Este script deve ser executado via{" "}
    <code>/import</code>, não por copy/paste no terminal.
  </p>
  <ol>
    <li>Clique em "Download .rsc"</li>
    <li>No Winbox, vá em Files e faça upload do arquivo</li>
    <li>No terminal, execute: <code>/import navspot-bootstrap.rsc</code></li>
    <li>Aguarde 30 segundos e reconecte via 192.168.88.1</li>
  </ol>
</AlertDescription>
```

4. Verificação pós-instalação: `NAVSPOT v6.0: Bootstrap concluido!`

---

## Resultado Esperado

| Benefício | Descrição |
|-----------|-----------|
| Rede pronta antes de migrar | IP, DHCP, NAT funcionam mesmo sem portas |
| Winbox cai no final | Quando tudo já está configurado |
| Reconexão garantida | Bridge1 já tem IP e DHCP rodando |
| Idempotente | Remove antes de adicionar cada item |
| Compatível v6/v7 | Sem variáveis, sem loops |

