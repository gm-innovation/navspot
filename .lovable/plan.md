

# Correção de Sintaxe RouterOS v6 (v3.9)

## Problema Identificado

O script v3.8 contém uma sintaxe incompatível com RouterOS v6:

```routeros
/file print file="navspot-interface" where name=""
```

Esta linha causa um erro de parsing que **aborta o script inteiro antes mesmo de executar a primeira linha**. Por isso nenhum log aparece no console do MikroTik.

### Ocorrências do Erro

| Linha | Arquivo/Contexto | Propósito |
|-------|------------------|-----------|
| 363 | navspot-interface.txt | Persistir interface detectada |
| 689 | navspot-token.txt | Armazenar token de sync |
| 773 | navspot-actions.txt | Armazenar ações pendentes |
| 971 | navspot-executed.txt | Armazenar ações executadas |

---

## Problemas Adicionais Identificados

### DNS (Linha 410)

```routeros
set allow-remote-requests=no
```

**Problema:** Com `no`, os clientes do hotspot não conseguem resolver DNS antes do login. O portal cativo não funciona.

**Correção:** Mudar para `allow-remote-requests=yes` para que o MikroTik atue como servidor DNS local.

### Walled Garden (Linha 512)

```routeros
add dst-host="*.navspot.local" action=allow
```

**Problema:** RouterOS v6 tem problemas com wildcards `*` no início sem protocolo. Pode não funcionar corretamente.

**Correção:** Usar regex: `dst-host=":^.*navspot\\\\.local$"` ou simplesmente `navspot.local` (sem wildcard).

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Corrigir sintaxe de criação de arquivos |

---

## Solução Proposta

### Sintaxe Corrigida para Criação de Arquivos

**Antes (v3.8 - INCORRETA):**
```routeros
:do {
  /file add name="navspot-interface.txt" contents=$targetIf
} on-error={
  /file print file="navspot-interface" where name=""
  :delay 1s
  /file set "navspot-interface.txt" contents=$targetIf
}
```

**Depois (v3.9 - CORRETA):**
```routeros
:do {
  /file add name="navspot-interface.txt" contents=$targetIf
} on-error={
  :do { /tool fetch url="" mode=https dst-path="navspot-interface.txt" } on-error={}
  :delay 500ms
  :do { /file set "navspot-interface.txt" contents=$targetIf } on-error={}
}
```

**Alternativa mais simples (recomendada):**
```routeros
# Remove se existir e recria
:do { /file remove "navspot-interface.txt" } on-error={}
:delay 500ms
/file add name="navspot-interface.txt" contents=$targetIf
```

---

## Mudanças Detalhadas

### 1. Versão do Script

```typescript
# Version: 3.9 - RouterOS v6/v7 Universal Syntax
```

### 2. Correção da Criação de Arquivos

Substituir o padrão `file print file=... where name=""` por:

```routeros
# Método universal que funciona em v6 e v7
:do { /file remove "nome-arquivo.txt" } on-error={}
:delay 500ms
/file add name="nome-arquivo.txt" contents=$conteudo
```

Este método:
- Remove o arquivo se existir (ignora erro se não existir)
- Aguarda o filesystem
- Cria o arquivo novo com o conteúdo

### 3. Correção do DNS

**Linha 410 - Antes:**
```routeros
set allow-remote-requests=no
```

**Depois:**
```routeros
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
```

Isso permite que o MikroTik atue como servidor DNS para os clientes do hotspot, essencial para o portal cativo funcionar.

### 4. Correção do Walled Garden

**Linha 512 - Antes:**
```routeros
add dst-host="*.navspot.local" action=allow
```

**Depois:**
```routeros
add dst-host="navspot.local" action=allow comment="navspot-${hotspotSlug}-system"
```

Sem o wildcard problemático. O hotspot aceita subdomínios automaticamente quando o domínio principal está liberado.

---

## Localizações das Correções

| Linha | Contexto | Ação |
|-------|----------|------|
| 233 | Versão | Atualizar para 3.9 |
| 356-367 | navspot-interface.txt | Refatorar criação de arquivo |
| 410 | DNS | Mudar para allow-remote-requests=yes |
| 512 | Walled Garden | Remover wildcard problemático |
| 682-692 | navspot-token.txt | Refatorar criação de arquivo |
| 770-776 | navspot-actions.txt | Refatorar criação de arquivo |
| 968-974 | navspot-executed.txt | Refatorar criação de arquivo |

---

## Comportamento Após Correção

| Antes (v3.8) | Depois (v3.9) |
|--------------|---------------|
| Script trava no parsing | Script executa completamente |
| Nenhum log visível | Logs de todas as etapas |
| DNS bloqueado antes do login | DNS funciona para portal cativo |
| Walled garden com wildcards v6 | Sintaxe universal |

---

## Fluxo do Script v3.9

```text
1. Header (variáveis, identity)
2. Bridge Infrastructure (criar bridge1 + portas)
3. Interface Detection (detecta bridge1)
4. [FIX] Salvar interface em arquivo (método universal)
5. IP Address
6. IP Pool
7. DHCP Network + Server
8. [FIX] DNS (allow-remote-requests=yes)
9. Hotspot Profile + IP Binding
10. User Profiles
11. Hotspot Server
12. [FIX] Walled Garden (sem wildcards)
13. Layer 7 + Firewall
14. NAT Masquerade
15. [FIX] Sync Scripts (criação de arquivos)
16. Schedulers
17. Final Log
```

---

## Compatibilidade

| RouterOS | Sintaxe Atual (v3.8) | Sintaxe Nova (v3.9) |
|----------|---------------------|---------------------|
| v6.x | ERRO de parsing | OK |
| v7.x | Funciona (parcialmente) | OK |

A nova sintaxe é 100% compatível com ambas as versões.

---

## Secao Tecnica

### Bloco de Criacao de Arquivo Refatorado

```typescript
// Antes (v3.8)
script += `:do {
  /file add name="navspot-interface.txt" contents=\\$targetIf
} on-error={
  /file print file="navspot-interface" where name=""
  :delay 1s
  /file set "navspot-interface.txt" contents=\\$targetIf
}`

// Depois (v3.9)
script += `# Remove existing file if present
:do { /file remove "navspot-interface.txt" } on-error={}
:delay 500ms
# Create new file with contents
/file add name="navspot-interface.txt" contents=\\$targetIf
:log info ("NAVSPOT: Interface salva em arquivo: " . \\$targetIf)`
```

Este padrão deve ser aplicado em todos os 4 locais onde arquivos são criados.

