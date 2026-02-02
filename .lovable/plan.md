
# Plano de Correção v6.9.17: Sintaxe RouterOS 6.x + Modo Bloquear Tudo

## Diagnóstico Resumido

| Problema | Causa Raiz | Impacto |
|----------|------------|---------|
| Erro sintaxe linha 148 | `action=reject` inválido em Walled Garden hostnames (RouterOS 6.x) | Action-processor quebrado, nenhum comando executa |
| Whitelist não funciona | Perfil "bloquear_tudo" não está implementado no sync | Após login, tráfego passa direto sem filtro |
| Firewall vazio | Script quebrou antes de chegar no `add_firewall_block` | Bloqueio pós-login inexistente |

## Correções Necessárias

### Parte 1: Corrigir Sintaxe - `action=reject` para `action=deny`

No RouterOS 6.x, o menu `/ip hotspot walled-garden` (hostnames) aceita:
- `action=allow` - libera o site
- `action=deny` - bloqueia o site

Já o menu `/ip hotspot walled-garden ip` (IPs) aceita:
- `action=accept`
- `action=reject`

**Arquivos a modificar:**

1. `supabase/functions/mikrotik-recovery-download/index.ts` (linhas 319-321)
2. `supabase/functions/mikrotik-script-generator/index.ts` (linhas 440-442)

**Mudança:**
```routeros
# DE (incorreto para RouterOS 6.x)
/ip hotspot walled-garden add dst-host=$domain action=reject comment=...

# PARA (correto)
/ip hotspot walled-garden add dst-host=$domain action=deny comment=...
```

### Parte 2: Implementar Lógica "Bloquear Tudo" (modo_acesso)

Para perfis com `modo_acesso = 'bloquear_tudo'`, o sistema precisa:

1. **Antes do login (Walled Garden):** Bloquear tudo por padrão, liberar apenas domínios da whitelist
2. **Depois do login (Firewall):** Criar Address-List de permissão e dropar todo resto

**Mudanças no mikrotik-sync:**

Adicionar lógica para detectar tripulantes com perfil `bloquear_tudo` e injetar:
- Regra mestre de DROP no firewall (inverter lógica)
- Whitelists na Address-List de permissão

**Complexidade:** Alta - requer refatoração significativa da lógica de firewall.

**Alternativa simplificada para v6.9.17:**
Usar o Walled Garden com padrão invertido - adicionar regra de deny-all e permitir apenas os domínios configurados.

### Parte 3: Reset do Hash (Já Aplicado)

A migration `20260202183250` já foi aplicada, mas o hotspot ainda mostra `firewall_rules_hash` preenchido. Precisamos verificar se a migration realmente executou.

### Parte 4: Reenviar Recovery Corrigido

Após corrigir os Edge Functions, será necessário:
1. Gerar novo recovery.rsc
2. Aplicar no MikroTik
3. Rodar sync e verificar logs

## Arquivos a Modificar

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `supabase/functions/mikrotik-recovery-download/index.ts` | `action=reject` → `action=deny` | P0 |
| `supabase/functions/mikrotik-script-generator/index.ts` | `action=reject` → `action=deny` | P0 |
| `supabase/functions/mikrotik-sync/index.ts` | Implementar lógica modo_acesso | P1 |
| Migration SQL | Novo reset do hash (se necessário) | P0 |

## Detalhes Técnicos

### Correção 1: mikrotik-recovery-download (linhas 319-321)

```typescript
// ANTES
/ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)

// DEPOIS  
/ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
```

### Correção 2: mikrotik-script-generator (linhas 440-442)

```typescript
// ANTES
/ip hotspot walled-garden add dst-host=$domain action=reject comment=("navspot-blacklist-" . $bName)

// DEPOIS
/ip hotspot walled-garden add dst-host=$domain action=deny comment=("navspot-blacklist-" . $bName)
```

### Correção 3: Implementar modo_acesso no mikrotik-sync

Adicionar verificação do campo `modo_acesso` do perfil e, se for `bloquear_tudo`:
1. Injetar regra de DROP padrão no firewall
2. Criar Address-List `NAVSPOT-ALLOWED` com IPs dos domínios permitidos
3. Regra de ACCEPT antes do DROP para `dst-address-list=NAVSPOT-ALLOWED`

## Fluxo de Teste Após Aplicação

1. Deploy das Edge Functions corrigidas
2. Gerar novo recovery via API ou copiar script corrigido
3. Aplicar no MikroTik:
```routeros
/system script remove [find name~"navspot"]
/system scheduler remove [find name="navspot-sync-scheduler"]
# Importar novo recovery
/import navspot-recovery.rsc
/system script run navspot-sync
```
4. Verificar:
```routeros
/ip hotspot walled-garden print where comment~"navspot"
/ip firewall filter print where comment~"NAVSPOT"
/ip firewall address-list print where list~"NAVSPOT"
```
5. Testar acesso a site da whitelist (g1.com) após login

## Ordem de Execução

1. Corrigir `action=reject` → `action=deny` nos 2 arquivos
2. Resetar novamente o `firewall_rules_hash` no banco
3. Deploy
4. Aplicar recovery no MikroTik
5. Testar whitelist

## Sobre o Consumo

O consumo não está atualizando porque o usuário está bloqueado e não consegue navegar. Após corrigir o bloqueio/whitelist, o consumo voltará a ser contabilizado normalmente.
