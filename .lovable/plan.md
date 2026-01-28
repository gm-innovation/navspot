

# Correcao de Strings sem Aspas para RouterOS v6 (v3.10)

## Problema Identificado

O erro `expected end of command (line 188 column 29)` ocorre porque o RouterOS v6 nao aceita strings contendo caracteres especiais (hifens `-`, pontos `.`, underscores `_`) sem aspas.

### Exemplo do Problema

```routeros
# ERRO no RouterOS v6:
add name=hsprof-engenharia-googlemarine hotspot-address=192.168.88.1 dns-name=engenharia-googlemarine.navspot.local

# O parser v6 interpreta assim:
# name=hsprof-engenharia-googlemarine → OK ate aqui
# .navspot.local → "Isso e um comando novo?" → ERRO!
```

O RouterOS v7 e mais flexivel, mas v6 requer aspas em todas as strings com caracteres especiais.

---

## Localizacoes das Strings Sem Aspas

| Linha | Codigo Atual | Problema |
|-------|--------------|----------|
| 252 | `add name=bridge1` | Sem aspas |
| 382-383 | `name="hs-pool-${hotspotSlug}"` | OK (ja tem aspas) |
| 391 | `comment="navspot-${hotspotSlug}"` | OK |
| 397-398 | `name="dhcp-${hotspotSlug}"`, `address-pool=hs-pool-${hotspotSlug}` | address-pool SEM aspas |
| 412-413 | `name=hsprof-${hotspotSlug}`, `dns-name=${hotspotSlug}.navspot.local` | **SEM ASPAS** |
| 426-429 | `comment="navspot-admin..."` | OK |
| 447-448 | `name="${profileSlug}"` | OK |
| 461 | `name="default-navspot"` | OK |
| 470-472 | `name=hs-${hotspotSlug}`, `address-pool=hs-pool-${hotspotSlug}`, `profile=hsprof-${hotspotSlug}` | **SEM ASPAS** |
| 506-507 | `dst-host="navspot.local"` | OK |
| 532 | `dst-host="${domain}"` | OK |

---

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar aspas em todos os campos de string |

---

## Correcoes Detalhadas

### 1. Linha 252 - Bridge Name

**Antes:**
```routeros
add name=bridge1 comment="navspot-hotspot-bridge"
```

**Depois:**
```routeros
add name="bridge1" comment="navspot-hotspot-bridge"
```

### 2. Linha 398 - DHCP Server (address-pool)

**Antes:**
```routeros
add name="dhcp-${hotspotSlug}" interface=$targetIf address-pool=hs-pool-${hotspotSlug} disabled=no
```

**Depois:**
```routeros
add name="dhcp-${hotspotSlug}" interface=$targetIf address-pool="hs-pool-${hotspotSlug}" disabled=no
```

### 3. Linhas 412-415 - Hotspot Profile (CRITICO)

**Antes:**
```routeros
add name=hsprof-${hotspotSlug} hotspot-address=${gateway} dns-name=${hotspotSlug}.navspot.local \
    html-directory=hotspot login-by=http-chap,http-pap \
    http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""
```

**Depois:**
```routeros
add name="hsprof-${hotspotSlug}" hotspot-address=${gateway} dns-name="${hotspotSlug}.navspot.local" \
    html-directory=hotspot login-by=http-chap,http-pap \
    http-cookie-lifetime=1d keepalive-timeout=5m rate-limit=""
```

### 4. Linhas 470-472 - Hotspot Server

**Antes:**
```routeros
add name=hs-${hotspotSlug} interface=$targetIf address-pool=hs-pool-${hotspotSlug} \
    profile=hsprof-${hotspotSlug} disabled=no
```

**Depois:**
```routeros
add name="hs-${hotspotSlug}" interface=$targetIf address-pool="hs-pool-${hotspotSlug}" \
    profile="hsprof-${hotspotSlug}" disabled=no
```

### 5. Todos os `find name=` precisam de aspas

**Antes:**
```routeros
:do { remove [find name="hs-pool-${hotspotSlug}"] } on-error={}
:do { remove [find name=hs-${hotspotSlug}] } on-error={}
```

**Depois:**
```routeros
:do { remove [find name="hs-pool-${hotspotSlug}"] } on-error={}
:do { remove [find name="hs-${hotspotSlug}"] } on-error={}
```

---

## Lista Completa de Campos que Precisam de Aspas

| Campo | Motivo |
|-------|--------|
| `name=` | Contém hifens |
| `dns-name=` | Contém pontos E hifens |
| `address-pool=` | Contém hifens |
| `profile=` | Contém hifens |
| `comment=` | Contém hifens e texto |
| `dst-host=` | Contém pontos |
| `html-directory=` | String simples (pode manter sem) |

### Regra de Ouro

> Toda string que contém letras + caracteres especiais (hifens, pontos, underscores) DEVE usar aspas no RouterOS v6.

---

## Versao do Script

Atualizar para:
```typescript
# Version: 3.10 - RouterOS v6 String Quoting Fix
```

---

## Comportamento Apos Correcao

| Antes (v3.9) | Depois (v3.10) |
|--------------|----------------|
| `expected end of command` | Script executa normalmente |
| Parsing falha na linha 188 | Todas as linhas parseadas corretamente |
| Hotspot nao configurado | Hotspot funcional |

---

## Secao Tecnica

### Padroes de String a Corrigir

```typescript
// ANTES (v3.9) - causa erro no v6
script += `add name=hs-pool-${hotspotSlug} ranges=...`
script += `add name=hs-${hotspotSlug} interface=...`
script += `add name=hsprof-${hotspotSlug} dns-name=${hotspotSlug}.navspot.local`

// DEPOIS (v3.10) - funciona em v6 e v7
script += `add name="hs-pool-${hotspotSlug}" ranges=...`
script += `add name="hs-${hotspotSlug}" interface=...`
script += `add name="hsprof-${hotspotSlug}" dns-name="${hotspotSlug}.navspot.local"`
```

### Campos Especificos a Modificar

1. **Linha 252**: `add name=bridge1` → `add name="bridge1"`
2. **Linha 383**: `add name=hs-pool-${hotspotSlug}` → `add name="hs-pool-${hotspotSlug}"`
3. **Linha 398**: `address-pool=hs-pool-${hotspotSlug}` → `address-pool="hs-pool-${hotspotSlug}"`
4. **Linha 412-413**: `name=hsprof-${hotspotSlug}` → `name="hsprof-${hotspotSlug}"` e `dns-name=${hotspotSlug}.navspot.local` → `dns-name="${hotspotSlug}.navspot.local"`
5. **Linha 470-472**: `name=hs-${hotspotSlug}`, `address-pool=...`, `profile=...` → Todos com aspas

---

## Compatibilidade

| RouterOS | v3.9 (sem aspas) | v3.10 (com aspas) |
|----------|-----------------|-------------------|
| v6.x | ERRO de parsing | OK |
| v7.x | Funciona | OK |

Aspas em strings sao aceitas em ambas as versoes.

---

## Fluxo do Script v3.10

```text
1. Header (v3.10)
2. Bridge Infrastructure (name="bridge1")
3. Interface Detection
4. IP Address
5. IP Pool (name="hs-pool-xxx")
6. DHCP (address-pool="hs-pool-xxx")
7. Hotspot Profile (name="hsprof-xxx", dns-name="xxx.navspot.local")
8. IP Binding
9. User Profiles
10. Hotspot Server (name="hs-xxx", profile="hsprof-xxx")
11. Walled Garden
12. Firewall + NAT
13. Sync + Schedulers
14. Final Log
```

Todas as strings com caracteres especiais estarao entre aspas.

