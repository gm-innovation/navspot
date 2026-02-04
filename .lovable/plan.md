

# Correção: Erro "item referred by 'place-before' does not exist"

## Problema Identificado

O erro ocorre nas linhas 341 e 343 do `mikrotik-script-generator/index.ts`:

```routeros
/ip firewall filter add ... place-before=0
```

Quando o roteador está limpo (reset ou sem regras de firewall), **não existe posição 0** na tabela de firewall filter. O comando `place-before=0` falha porque não há nenhuma regra para referenciar.

## Causa Raiz

O bootstrap anterior pode ter deixado o roteador sem regras de firewall, ou o roteador foi resetado. O cleanup no script remove as regras do navspot mas **não cria uma regra "âncora"** antes de usar `place-before=0`.

## Solução

Remover o `place-before=0` dos comandos de firewall. As regras serão adicionadas no final da lista, o que é aceitável para regras de gerência.

**Alternativa mais robusta**: Usar `:do { ... } on-error={}` para tornar o `place-before` opcional.

## Mudanças no Arquivo

### `supabase/functions/mikrotik-script-generator/index.ts`

| Linha | Antes | Depois |
|-------|-------|--------|
| 341 | `... place-before=0` | `:do { /ip firewall filter add ... place-before=0 } on-error={ /ip firewall filter add ... }` |
| 343 | `... place-before=0` | `:do { /ip firewall filter add ... place-before=0 } on-error={ /ip firewall filter add ... }` |

### Código Corrigido (Seção 8 - GERENCIA WINBOX)

```routeros
# 8. GERENCIA WINBOX
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
:do { /interface list member add list="mgmt" interface=ether2 } on-error={}
/interface list member add list="mgmt" interface=bridge1 comment="navspot-allow-discovery"
/ip neighbor discovery-settings set discover-interface-list=mgmt
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
# v7.1.2: place-before com fallback para roteadores sem regras
:do {
  /ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0
} on-error={
  /ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt"
}
:do { /ip firewall filter remove [find comment="navspot-allow-mndp-mgmt"] } on-error={}
:do {
  /ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt" place-before=0
} on-error={
  /ip firewall filter add chain=input in-interface=ether2 protocol=udp dst-port=5678 action=accept comment="navspot-allow-mndp-mgmt"
}
:log info "NAVSPOT: Gerencia configurada"
```

## Por Que Esta Correção Funciona

1. **Tenta** adicionar com `place-before=0` (posição prioritária)
2. Se falhar (roteador sem regras), adiciona **sem** `place-before`
3. A regra é criada de qualquer forma, garantindo acesso via Winbox

## Resposta à Pergunta: "Preciso limpar antes?"

**Não**. A limpeza no script está funcionando corretamente (remove as regras antigas). O problema é que **após a limpeza**, o roteador fica sem regras, e o `place-before=0` falha.

A correção torna o script idempotente e funciona tanto em roteadores com regras quanto em roteadores limpos.

## Checklist

| # | Item | Detalhes |
|---|------|----------|
| 1 | Remover place-before rígido | Linhas 341, 343 |
| 2 | Adicionar fallback on-error | Para roteadores limpos |
| 3 | Manter VERSION 7.1.2 | Já atualizado |
| 4 | Re-deploy | mikrotik-script-generator |

