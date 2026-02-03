
# Plano: Correção Definitiva v6.9.27 - Eliminar TODOS os Padrões Problemáticos

## Diagnóstico Confirmado

O erro `expected end of command (line 670)` ocorre porque o RouterOS 6.x não consegue parsear expressões com colchetes aninhados contendo comandos durante `/import`:

```routeros
# PADRÃO QUE QUEBRA no /import do RouterOS 6.x:
:if ([:len [/ip hotspot walled-garden ip find dst-port=53 protocol=udp comment~"navspot-dns"]] = 0) do={
```

## Localização Exata dos Problemas

### Recovery (`mikrotik-recovery-download/index.ts`)

| Linha TS | Conteúdo Problemático |
|----------|----------------------|
| 466 | `:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0)` |
| 476 | `:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0)` |
| 602 | `:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0)` |
| 611-656 | 14x `:if ([:len [/ip hotspot walled-garden find ...]] = 0)` |
| 660-672 | 5x `:if ([:len [/ip hotspot walled-garden ip find ...]] = 0)` |

### Bootstrap (`mikrotik-script-generator/index.ts`)

| Linha TS | Conteúdo Problemático |
|----------|----------------------|
| 444 | `:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0)` |
| 454 | `:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0)` |
| 664 | `:if ([:len [/interface list find name="mgmt"]] = 0)` |
| 679 | `:if ([:len [/ip firewall filter find comment="..."]] = 0)` |
| 684 | `:if ([:len [/ip firewall filter find comment="..."]] = 0)` |
| 798 | `:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0)` |

---

## Solução: Padrão "Remove-then-Add" Idempotente

Substituir TODOS os blocos problemáticos por comandos diretos com `on-error={}`:

```text
ANTES (quebra):
:if ([:len [/ip hotspot walled-garden ip find comment~"navspot-dns"]] = 0) do={
  /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
}

DEPOIS (v6.9.27):
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-udp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
```

### Por que funciona

1. O padrão `remove [find ...]` FORA de `[:len [...]]` é válido no RouterOS 6.x
2. O `on-error={}` ignora silenciosamente se a entrada não existir
3. O `add` subsequente sempre cria a entrada
4. Resultado: idempotente e compatível com /import

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

**Mudanças no action-processor (linhas 462-482):**

```typescript
// ANTES (linha 466)
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
  /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName)

// DEPOIS (v6.9.27) - comando direto com on-error
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
```

**Mudanças no Netwatch (linha 602):**

```typescript
// ANTES
:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0) do={
  /tool netwatch add ...
}

// DEPOIS (v6.9.27)
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s down-script="" up-script=":delay 5s; :do { /system script run navspot-sync } on-error={}" comment="navspot-netwatch"
```

**Mudanças no Walled Garden hostnames (linhas 611-656):**

```typescript
// ANTES
:if ([:len [/ip hotspot walled-garden find dst-host="navspot.lovable.app"]] = 0) do={
  /ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
}

// DEPOIS (v6.9.27)
:do { /ip hotspot walled-garden remove [find dst-host="navspot.lovable.app"] } on-error={}
/ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
```

**Mudanças no Walled Garden IP (linhas 660-674):**

```typescript
// ANTES
:if ([:len [/ip hotspot walled-garden ip find dst-port=53 protocol=udp comment~"navspot-dns"]] = 0) do={
  /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
}

// DEPOIS (v6.9.27) - com COMMENT CONSISTENTE
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-udp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
```

**Importante (dica do usuário):** Garantir que o comment usado no `remove` seja EXATAMENTE igual ao usado no `add`.

---

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

**Mudanças no action-processor (linhas 440-461):**

```typescript
// ANTES (linha 444)
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
  /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName)
  :log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}

// DEPOIS (v6.9.27) - comando direto
:do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName) } on-error={}
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
```

**Mudanças nas verificações de interface/firewall (linhas 664, 679, 684):**

```typescript
// ANTES (linha 664)
:if ([:len [/interface list find name="mgmt"]] = 0) do={
  /interface list add name="mgmt" comment="navspot-mgmt-list"
}

// DEPOIS (v6.9.27) - add direto (on-error para duplicatas)
:do { /interface list add name="mgmt" comment="navspot-mgmt-list" } on-error={}
```

```typescript
// ANTES (linha 679)
:if ([:len [/ip firewall filter find comment="navspot-allow-winbox-mgmt"]] = 0) do={
  /ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0
}

// DEPOIS (v6.9.27) - remove+add para manter posição
:do { /ip firewall filter remove [find comment="navspot-allow-winbox-mgmt"] } on-error={}
/ip firewall filter add chain=input in-interface=ether2 protocol=tcp dst-port=8291 action=accept comment="navspot-allow-winbox-mgmt" place-before=0
```

**Mudanças no Netwatch (linha 798):**

```typescript
// ANTES
:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0) do={

// DEPOIS (v6.9.27)
:do { /tool netwatch remove [find comment="navspot-netwatch"] } on-error={}
/tool netwatch add host=8.8.8.8 interval=30s down-script="" up-script=":delay 5s; :do { /system script run navspot-sync } on-error={}" comment="navspot-netwatch"
```

---

### 3. Atualizar Versão no Frontend

**`src/components/modals/ScriptModal.tsx`:**
- Atualizar referência de versão para `6.9.27`

**`src/pages/Embarcacoes.tsx`:**
- Atualizar default version para `"6.9.27"`

---

## Validação Automática (Linter)

Adicionar função de validação no final de cada generator:

```typescript
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets)' },
    { regex: /comment~"/, desc: 'comment~ (must use comment=)' },
  ]
  
  for (const { regex, desc } of forbiddenPatterns) {
    if (regex.test(script)) {
      console.error(`[${context} ${VERSION}] VALIDATION FAILED: ${desc}`)
      throw new Error(`Script contains forbidden pattern: ${desc}`)
    }
  }
}
```

---

## Resumo das Correções

| Seção | Antes | v6.9.27 |
|-------|-------|---------|
| Action-processor whitelist | `[:len [/... find]]` | Comando direto + `on-error={}` |
| Action-processor blacklist | `[:len [/... find]]` | Comando direto + `on-error={}` |
| Netwatch | `[:len [/tool netwatch find]]` | Remove+add direto |
| Walled Garden hostnames | 14x `[:len [/... find]]` | 14x Remove+add |
| Walled Garden IP | 5x `[:len [/... find]]` | 5x Remove+add por comment |
| Interface list | `[:len [/interface list find]]` | Add direto + `on-error={}` |
| Firewall rules | `[:len [/ip firewall filter find]]` | Remove+add + `place-before=0` |

---

## Como Testar

1. Baixar Recovery v6.9.27 pelo painel
2. No MikroTik:
   ```routeros
   /import navspot-recovery-v6.9.27.rsc
   ```
3. Verificar:
   ```routeros
   /log print where message~"NAVSPOT-RECOVERY"
   /ip hotspot walled-garden print
   /ip hotspot walled-garden ip print
   /system script print where name~"navspot"
   ```
