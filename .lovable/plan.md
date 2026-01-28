

# Correção Universal de Sintaxe RouterOS v6/v7 (v3.11)

## Problemas Identificados no v3.10

O script v3.10 ainda falha no RouterOS v6 por **dois motivos críticos**:

### Problema 1: Barras Invertidas para Quebra de Linha (`\`)

O RouterOS v6 **NÃO suporta** `\` como caractere de continuação de linha em scripts. Ele interpreta a barra como caractere literal, causando `expected end of command`.

| Linha | Código Atual | Problema |
|-------|--------------|----------|
| 413-415 | `add name="hsprof-..." \` | Quebra de linha com `\` |
| 471-472 | `add name="hs-..." \` | Quebra de linha com `\` |
| 605-606 | `add chain=input action=accept ... \` | Quebra de linha com `\` |
| 609-610 | `add chain=input action=accept ... \` | Quebra de linha com `\` |
| 611-612 | `add chain=input action=accept ... \` | Quebra de linha com `\` |
| 617-628 | Várias regras WinBox/SSH | Múltiplas quebras com `\` |
| 633-648 | Regras de firewall | Múltiplas quebras com `\` |
| 652-657 | Forward rules | Quebras com `\` |
| 1042-1047 | Schedulers | Quebras com `\` |

### Problema 2: `/file add ... contents=`

O RouterOS v6 **NÃO aceita** o parâmetro `contents=` no comando `/file add`. A sintaxe universal é:

```routeros
# MÉTODO UNIVERSAL (v6 + v7)
/file print file="nome.txt" where name=""
:delay 1s
/file set "nome.txt" contents=$variavel
```

| Linha | Código Atual | Problema |
|-------|--------------|----------|
| 360 | `/file add name="navspot-interface.txt" contents=$targetIf` | `contents=` inválido |
| 680 | `/file add name="navspot-token.txt" contents="..."` | `contents=` inválido |
| 764 | `/file add name="navspot-actions.txt" contents=$cleanContent` | `contents=` inválido |
| 963 | `/file add name="navspot-executed.txt" contents=$executed` | `contents=` inválido |

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Remover todas as quebras de linha com `\` e corrigir criação de arquivos |

---

## Correções Detalhadas

### 1. Versão do Script

```typescript
# Version: 3.11 - Universal Syntax (No Backslashes)
```

### 2. Hotspot Profile (Linhas 413-415)

**Antes:**
```routeros
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" \\
    html-directory=hotspot login-by=http-chap,http-pap \\
    http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""
```

**Depois:**
```routeros
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=hotspot login-by=http-chap,http-pap http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""
```

### 3. Hotspot Server (Linhas 471-472)

**Antes:**
```routeros
add name="hs-${hotspotSlug}" interface=\$targetIf address-pool="hs-pool-${hotspotSlug}" \\
    profile="hsprof-${hotspotSlug}" disabled=no
```

**Depois:**
```routeros
add name="hs-${hotspotSlug}" interface=\$targetIf address-pool="hs-pool-${hotspotSlug}" profile="hsprof-${hotspotSlug}" disabled=no
```

### 4. Todas as Regras de Firewall (Linhas 605-666)

Todas as regras de firewall que usam `\` devem ser convertidas para linha única.

**Exemplo - Antes:**
```routeros
add chain=input action=accept connection-state=established,related \\
    comment="navspot-security-established"
```

**Depois:**
```routeros
add chain=input action=accept connection-state=established,related comment="navspot-security-established"
```

### 5. Schedulers (Linhas 1042-1047)

**Antes:**
```routeros
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" \\
    policy=read,write,test comment="NAVSPOT sync every ${hotspot.sync_interval_minutes}min"
```

**Depois:**
```routeros
add name="navspot-sync-scheduler" interval=${hotspot.sync_interval_minutes}m on-event="/system script run navspot-sync" policy=read,write,test comment="NAVSPOT sync every ${hotspot.sync_interval_minutes}min"
```

### 6. Criação de Arquivos (4 locais)

**Antes (v3.10):**
```routeros
:do { /file remove "navspot-interface.txt" } on-error={}
:delay 500ms
/file add name="navspot-interface.txt" contents=$targetIf
```

**Depois (v3.11):**
```routeros
/file print file="navspot-interface.txt" where name=""
:delay 1s
/file set "navspot-interface.txt" contents=$targetIf
```

---

## Lista Completa de Correções

| Linha | Tipo | Correção |
|-------|------|----------|
| 233 | Versão | Atualizar para 3.11 |
| 357-361 | File Creation | Usar `/file print file=... where name=""` |
| 413-415 | Hotspot Profile | Remover `\`, linha única |
| 471-472 | Hotspot Server | Remover `\`, linha única |
| 605-666 | Firewall | Remover todos os `\`, linhas únicas |
| 677-681 | Token File | Usar `/file print file=... where name=""` |
| 761-764 | Actions File | Usar `/file print file=... where name=""` |
| 960-963 | Executed File | Usar `/file print file=... where name=""` |
| 1042-1047 | Schedulers | Remover `\`, linhas únicas |
| 1064 | Log Final | Atualizar versão |

---

## Seção Técnica

### Padrão de Criação de Arquivos (Universal v6/v7)

```typescript
// v3.11 - Método universal
script += `/file print file="navspot-interface.txt" where name=""
:delay 1s
/file set "navspot-interface.txt" contents=\\$targetIf
:log info ("NAVSPOT: Interface salva em arquivo: " . \\$targetIf)`
```

### Padrão de Comandos Longos (Sem Quebra de Linha)

```typescript
// v3.11 - Linha única (pode ser longa, mas funciona)
script += `add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" html-directory=hotspot login-by=http-chap,http-pap http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""\n`
```

### Regra de Ouro para v3.11

> 1. **NUNCA** usar `\` para quebra de linha
> 2. **NUNCA** usar `contents=` no `/file add`
> 3. **SEMPRE** usar `/file print file=... where name=""` seguido de `/file set`
> 4. **SEMPRE** aspas em strings com caracteres especiais

---

## Compatibilidade

| RouterOS | v3.10 | v3.11 |
|----------|-------|-------|
| v6.x | ERRO (backslash + file add) | OK |
| v7.x | Funciona | OK |

---

## Comportamento Após Correção

| Antes (v3.10) | Depois (v3.11) |
|---------------|----------------|
| `expected end of command (line 188)` | Script executa completamente |
| Parsing falha em `\` | Sem quebras de linha problemáticas |
| `file add contents=` falha | Arquivos criados corretamente |
| Hotspot não configurado | Hotspot funcional |

---

## Fluxo do Script v3.11

```text
1. Header (v3.11 - Universal Syntax)
2. Bridge Infrastructure
3. Interface Detection
4. Salvar interface (método universal)
5. IP Address/Pool/DHCP (linhas únicas)
6. DNS
7. Hotspot Profile (linha única)
8. IP Binding
9. User Profiles
10. Hotspot Server (linha única)
11. Walled Garden
12. Firewall (todas linhas únicas)
13. NAT
14. Token file (método universal)
15. Sync Scripts (file creation universal)
16. Schedulers (linhas únicas)
17. Final Log (v3.11)
```

Todas as linhas serão compatíveis com RouterOS v6 e v7.

