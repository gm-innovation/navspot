

# Correção da Detecção de Interface (v3.5)

## Problema Identificado

A lista de prioridade de interfaces (linha 251) inclui `bridgeLocal` que em alguns ambientes é a **interface WAN** (com internet), não uma interface adequada para Hotspot.

```routeros
:local interfacePriority {"bridge1";"bridgeLocal";"wlan1";"wlan2";"ether2";"ether3";"ether4";"ether5";"ether1"}
```

**O que acontece:**
1. O script detecta `bridgeLocal` como primeira interface disponivel
2. Monta o Hotspot na interface que tem a internet
3. Causa "curto-circuito" na rede
4. Internet cai, WinBox trava, sincronizacao falha

---

## Solucao Proposta

### Alteracao 1: Remover interfaces de sistema da lista de prioridade

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 251 - Antes:**
```routeros
:local interfacePriority {"bridge1";"bridgeLocal";"wlan1";"wlan2";"ether2";"ether3";"ether4";"ether5";"ether1"}
```

**Linha 251 - Depois:**
```routeros
:local interfacePriority {"bridge1";"wlan1";"wlan2";"ether3";"ether4";"ether5"}
```

**Interfaces removidas:**
- `bridgeLocal` - Frequentemente usada para WAN/gerencia
- `ether2` - Pode ser porta WAN secundaria
- `ether1` - Quase sempre e WAN

### Logica da Nova Lista de Prioridade

| Prioridade | Interface | Justificativa |
|------------|-----------|---------------|
| 1 | `bridge1` | Bridge padrao para clientes (mais comum) |
| 2 | `wlan1` | WiFi integrado do MikroTik |
| 3 | `wlan2` | WiFi secundario |
| 4 | `ether3` | Porta LAN tipica |
| 5 | `ether4` | Porta LAN alternativa |
| 6 | `ether5` | Porta LAN de backup |

---

## Comportamento Apos Correcao

```text
ANTES (Problemático):
Script detecta → bridgeLocal (WAN) → Hotspot na WAN → Internet cai

DEPOIS (Correto):
Script detecta → bridge1 (LAN) → Hotspot na LAN → Internet OK
```

---

## Seguranca Mantida

- Se nenhuma interface da lista existir, o script aborta com erro
- O usuario pode forcar uma interface especifica via configuracao do Hotspot
- Interfaces WAN (ether1, bridgeLocal) nao serao selecionadas automaticamente

---

## Versao do Script

Atualizar a versao de **3.3** para **3.5** na linha 233:

```typescript
# Version: 3.5 - Safe Interface Detection (exclude WAN interfaces)
```

---

## Arquivo a Modificar

| Arquivo | Linhas | Alteracao |
|---------|--------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 233, 251 | Remover interfaces WAN da lista de prioridade |

