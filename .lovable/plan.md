
# Plano: Correcao Cirurgica v7.1.44 - Escrita Limpa de Arquivo

## Problema Confirmado

O RouterOS 7.x injeta header automatico quando arquivos sao criados via `/file print`:

```
NAVSPOT-SYNC: write try=1 len=69 fc=[#] pf=[# 2026-02-06 15:07:49 by RouterOS 7.14.3
# software id = RCRS-VEA0
```

O validador (`fc!="#"`) corretamente rejeita, mas a acao nunca executa.

---

## Solucao: Mudanca Cirurgica (2 linhas)

### Unica Mudanca no sync-raw

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

**Linhas 780-782 - ANTES:**
```routeros
:do {/file remove "navspot-actions.txt"} on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 700ms
```

**Linhas 780-782 - DEPOIS:**
```routeros
:do {/file remove "navspot-actions.txt"} on-error={}
:delay 200ms
```

E na linha 787, mudar de:
```routeros
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
```

Para:
```routeros
:do {:local ef [/file find name="navspot-actions.txt"];:if ([:len $ef]=0) do={/file add name="navspot-actions.txt" contents=$a} else={/file set $ef contents=$a}} on-error={}
```

**Logica:**
1. Remove arquivo antigo (se existir)
2. Delay curto para sync do filesystem
3. No loop de retry: Se arquivo nao existe, usa `/file add contents=$a` (limpo). Se existe, usa `/file set contents=$a`

---

## Bump de Versao

| Arquivo | Versao Atual | Nova Versao |
|---------|--------------|-------------|
| `supabase/functions/mikrotik-scripts/index.ts` linha 38 | 7.1.43 | 7.1.44 |
| `supabase/functions/mikrotik-sync/index.ts` linhas 9 e 12 | 7.1.43 | 7.1.44 |
| `supabase/functions/mikrotik-script-generator/index.ts` linha 8 | 7.1.43 | 7.1.44 |
| `src/pages/Embarcacoes.tsx` linha 67 | 7.1.43 | 7.1.44 |

---

## Migration Automatica (Reset de Rollout)

Criar migration SQL que reseta `portal_profile_version` para forcar re-aplicacao:

```sql
-- v7.1.44: Reset portal_profile_version to force reconfigure with clean file write
UPDATE public.hotspots 
SET portal_profile_version = NULL 
WHERE portal_profile_version IS NOT NULL;

-- Comment explaining the change
COMMENT ON COLUMN public.hotspots.portal_profile_version IS 
  'v7.1.44: Tracks portal profile version for rollout. NULL triggers reconfigure.';
```

Isso sera aplicado automaticamente quando o usuario aprovar a migration.

---

## O Que NAO Muda (Preservado)

- Toda a logica de retry (3 tentativas)
- Validacao do conteudo (`fc!="#"`, `[:len $sv]>=12`, `[:find $sv "|"]>=0`)
- Logs de warning em caso de falha
- Execucao do action-processor
- Todas as outras funcoes do sistema

---

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | VERSION + linhas 780-787 (escrita limpa) |
| `supabase/functions/mikrotik-sync/index.ts` | VERSION + REQUIRED_PORTAL_VERSION |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION |
| `src/pages/Embarcacoes.tsx` | VERSION |
| Nova migration SQL | Reset portal_profile_version |

---

## Fluxo Apos Deploy

```text
1. Migration reseta portal_profile_version = NULL automaticamente

2. MikroTik faz sync
   |-- Backend detecta: portal_profile_version = NULL
   |-- Injeta: configure_hotspot_profile

3. Sync-raw executa:
   |-- Remove arquivo antigo
   |-- /file add name=... contents=$a (SEM HEADER!)
   |-- Valida: fc != "#" -> PASSA!
   |-- Executa action-processor

4. Action-processor configura:
   |-- /ip hotspot profile set $hp login-by=http-pap

5. Login funciona!
```

---

## Testes Pos-Deploy

| Teste | Comando | Resultado |
|-------|---------|-----------|
| Sync | `/system script run navspot-sync` | Sem warning `fc=[#]` |
| Arquivo | `/file get navspot-actions.txt contents` | Comeca com acao, nao com `#` |
| Profile | `/ip hotspot profile print detail` | `login-by: http-pap` |
| Login | Conectar WiFi | Autenticacao OK |

---

## Rollback

Se algo der errado, reverter a linha 787 para a versao original:
```routeros
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
```

E resetar rollout:
```sql
UPDATE public.hotspots SET portal_profile_version = NULL;
```
