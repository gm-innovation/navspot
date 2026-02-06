
# Plano: v7.1.44 IMPLEMENTADO ✅

## Status: CONCLUÍDO

A correção cirúrgica para escrita limpa de arquivos no RouterOS 7.x foi implementada com sucesso.

---

## Problema Resolvido

O RouterOS 7.x injetava header automático quando arquivos eram criados via `/file print`:

```
NAVSPOT-SYNC: write try=1 len=69 fc=[#] pf=[# 2026-02-06 15:07:49 by RouterOS 7.14.3
# software id = RCRS-VEA0
```

O validador (`fc!="#"`) corretamente rejeitava, impedindo a execução das ações.

---

## Solução Implementada

### Mudança no sync-raw (mikrotik-scripts)

**ANTES (linhas 780-782):**
```routeros
:do {/file remove "navspot-actions.txt"} on-error={}
/file print file=navspot-actions.txt where name="__never__"
:delay 700ms
```

**DEPOIS:**
```routeros
:do {/file remove "navspot-actions.txt"} on-error={}
:delay 200ms
```

**ANTES (linha 787):**
```routeros
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
```

**DEPOIS:**
```routeros
:do {:local ef [/file find name="navspot-actions.txt"];:if ([:len $ef]=0) do={/file add name="navspot-actions.txt" contents=$a} else={/file set $ef contents=$a}} on-error={}
```

**Lógica:**
1. Remove arquivo antigo (se existir)
2. Delay curto para sync do filesystem
3. No loop de retry: Se arquivo não existe, usa `/file add contents=$a` (limpo). Se existe, usa `/file set`

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | VERSION 7.1.44 + linhas 780-787 (escrita limpa) |
| `supabase/functions/mikrotik-sync/index.ts` | VERSION 7.1.44 + REQUIRED_PORTAL_VERSION 7.1.44-http-pap |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.44 |
| `src/pages/Embarcacoes.tsx` | VERSION 7.1.44 |
| Migration SQL | Reset portal_profile_version = NULL (automático) |

---

## O Que NÃO Mudou (Preservado)

- ✅ Lógica de retry (3 tentativas)
- ✅ Validação do conteúdo (`fc!="#"`, `[:len $sv]>=12`, `[:find $sv "|"]>=0`)
- ✅ Logs de warning em caso de falha
- ✅ Execução do action-processor
- ✅ Todas as outras funções do sistema

---

## Fluxo Após Deploy

```text
1. Migration resetou portal_profile_version = NULL automaticamente

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

## Testes Pós-Deploy

| Teste | Comando | Resultado Esperado |
|-------|---------|-------------------|
| Sync | `/system script run navspot-sync` | Sem warning `fc=[#]` |
| Arquivo | `/file get navspot-actions.txt contents` | Começa com ação, não com `#` |
| Profile | `/ip hotspot profile print detail` | `login-by: http-pap` |
| Login | Conectar WiFi | Autenticação OK |

---

## Rollback (Se Necessário)

Reverter linha 787 para versão original:
```routeros
:do {/file set [find name="navspot-actions.txt"] contents=$a} on-error={}
```

E resetar rollout:
```sql
UPDATE public.hotspots SET portal_profile_version = NULL;
```
