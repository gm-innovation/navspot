

# Plano: NAVSPOT v7.1.35 - Cleanup Conservador (Preservar Bridge Padrao)

## Problema Identificado

O cleanup atual remove configuracoes que NAO deveriam ser removidas:

| Linha | Comando Problematico | Efeito |
|-------|---------------------|--------|
| 309 | `bridge remove [find name="bridge1"]` | Remove bridge NAVSPOT anterior (OK) |
| 311 | `dhcp-server remove [find name="defconf"]` | Remove DHCP padrao do MikroTik (PROBLEMA!) |
| 312 | `dhcp-server remove [find name="dhcp1"]` | Remove DHCP padrao alternativo (PROBLEMA!) |
| 313 | `pool remove [find name="default-dhcp"]` | Remove pool padrao (PROBLEMA!) |

A bridge padrao do hAP ax² (chamada "bridge") vem de fabrica com ether2-ether5 incluidas. Quando o script remove configuracoes de DHCP relacionadas, o Winbox perde conectividade.

---

## Arquitetura Correta (conforme definida no inicio)

```text
+------------------+
|   MikroTik hAP   |
+------------------+
| ether1 (WAN)     | <-- Internet (DHCP client)
| ether2           | <-- Gerencia Winbox (NAO TOCAR)
| ether3-5         | <-- Mover para bridge1 (Hotspot)
+------------------+
| bridge (padrao)  | <-- MANTER (nao interfere)
| bridge1 (navspot)| <-- CRIAR para hotspot
+------------------+
```

### O que o script DEVE fazer:

1. Limpar hotspot NAVSPOT anterior (se houver)
2. Limpar scripts/schedulers NAVSPOT anteriores
3. Criar bridge1 NOVA
4. Remover ether3-5 da bridge padrao
5. Adicionar ether3-5 na bridge1
6. Configurar hotspot na bridge1
7. NAO TOCAR em ether2 ou bridge padrao

### O que o script NAO DEVE fazer:

1. Remover a bridge padrao
2. Remover DHCP server padrao (defconf, dhcp1)
3. Remover pool padrao (default-dhcp)
4. Interferir na ether2

---

## Mudancas no Cleanup (v7.1.35)

### REMOVER do cleanup (nao deve tocar):

```routeros
# REMOVER ESTAS LINHAS:
:do { /ip dhcp-server remove [find name="defconf"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp1"] } on-error={}
:do { /ip pool remove [find name="default-dhcp"] } on-error={}
```

### MANTER no cleanup (apenas NAVSPOT):

```routeros
# Limpar instalacao NAVSPOT anterior
:do { /ip hotspot remove [find name="hs-navspot"] } on-error={}
:do { /ip hotspot profile remove [find name="hsprof-navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip pool remove [find name="hs-pool-navspot"] } on-error={}
:do { /ip address remove [find comment="navspot"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
```

---

## Migracao de Portas Ajustada

O script atual ja faz a migracao correta:

```routeros
# Remove porta da bridge atual (qualquer que seja)
:do { /interface bridge port remove [find interface=ether3] } on-error={}
# Adiciona na bridge1
:do { /interface bridge port add bridge=bridge1 interface=ether3 comment="navspot-lan" } on-error={}
```

Isso funciona porque:
1. Remove ether3 de QUALQUER bridge (inclusive a padrao)
2. Adiciona na bridge1 (NAVSPOT)
3. A bridge padrao continua existindo, apenas sem ether3-5

---

## Arquivo a Modificar

### supabase/functions/mikrotik-script-generator/index.ts

Remover as linhas 311-313 do cleanup:

```diff
  # 0. CLEANUP
  :log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."
  :do { /file remove [find where name="navspot-token.txt"] } on-error={}
  ...
  :do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
  :do { /interface bridge remove [find name="bridge1"] } on-error={}
  :do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
- :do { /ip dhcp-server remove [find name="defconf"] } on-error={}
- :do { /ip dhcp-server remove [find name="dhcp1"] } on-error={}
- :do { /ip pool remove [find name="default-dhcp"] } on-error={}
  :delay 2s
  :log info "NAVSPOT v${VERSION}: Cleanup concluido"
```

### Atualizar versao para 7.1.35

---

## Resumo das Mudancas

| Item | v7.1.34 | v7.1.35 |
|------|---------|---------|
| Remove defconf DHCP | Sim | Nao |
| Remove dhcp1 | Sim | Nao |
| Remove default-dhcp pool | Sim | Nao |
| Remove bridge padrao | Nao (apenas bridge1) | Nao (apenas bridge1) |
| Migra ether3-5 | Sim | Sim |
| Preserva ether2 | Sim | Sim |

---

## Resultado Esperado

1. Admin importa script no hAP ax²
2. Script limpa apenas configs NAVSPOT anteriores
3. Bridge padrao continua funcionando (com ether2)
4. Winbox permanece conectado via ether2
5. ether3-5 sao movidas para bridge1
6. Hotspot configurado na bridge1
7. Instalacao completa sem perda de conectividade

---

## Secao Tecnica

### Arquivo: supabase/functions/mikrotik-script-generator/index.ts

Modificar a funcao `generateBootstrapScript()`:
- Linha 311-313: REMOVER comandos que deletam defconf/dhcp1/default-dhcp
- Linha 1 (VERSION): Atualizar para "7.1.35"

### Arquivo: supabase/functions/mikrotik-scripts/index.ts

- Atualizar VERSION para "7.1.35"

### Arquivo: src/pages/Embarcacoes.tsx

- Atualizar defaultScriptVersion para "7.1.35"

