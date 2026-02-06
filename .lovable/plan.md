

# Plano: Correção Definitiva HTTP-PAP v7.1.43

## Problema Confirmado

O MikroTik continua com `login-by=cookie,http-chap` porque os handlers procuram o hotspot server com o nome errado:

| Local | O que busca | O que existe |
|-------|-------------|--------------|
| Bootstrap | `add name="hs-navspot"` | Cria o servidor |
| Handler CORE (linha 860) | `find name="navspot"` | Nao encontra! |
| Handler FULL (linha 968) | `find name="navspot"` | Nao encontra! |
| Guardian (linha 1181) | `find name="navspot"` | Nao encontra! |

O fallback para `hsprof-navspot` funciona para encontrar o profile, mas sem encontrar o hotspot server, a logica robusta falha silenciosamente.

---

## Alerta: Tamanho do sync-raw

O log mostrou `sync-raw exceeds 3200 bytes: 3255`. Isso esta no limite mas ainda funciona. Vamos monitorar e, se necessario, otimizar em um patch futuro.

---

## Solucao em 5 Partes

### Parte 1: Corrigir nome do hotspot em mikrotik-scripts

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

**Mudanca 1 - Handler CORE (linha 860):**
```routeros
ANTES:
:local hs [/ip hotspot find name="navspot"]

DEPOIS:
:local hs [/ip hotspot find name="hs-navspot"]
```

**Mudanca 2 - Handler FULL (linha 968):**
```routeros
ANTES:
:local hs [/ip hotspot find name="navspot"]

DEPOIS:
:local hs [/ip hotspot find name="hs-navspot"]
```

**Mudanca 3 - Guardian (linha 1181):**
```routeros
ANTES:
:local hs [/ip hotspot find name="navspot"]

DEPOIS:
:local hs [/ip hotspot find name="hs-navspot"]
```

**Mudanca 4 - Versao (linha 38):**
```typescript
ANTES:
const VERSION = "7.1.42"

DEPOIS:
const VERSION = "7.1.43"
```

---

### Parte 2: Atualizar rollout version em mikrotik-sync

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

**Linha 9:**
```typescript
ANTES:
const VERSION = "7.1.42"

DEPOIS:
const VERSION = "7.1.43"
```

**Linha 12:**
```typescript
ANTES:
const REQUIRED_PORTAL_VERSION = "7.1.42-http-pap"

DEPOIS:
const REQUIRED_PORTAL_VERSION = "7.1.43-http-pap"
```

---

### Parte 3: Atualizar versao em mikrotik-script-generator

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 8:**
```typescript
ANTES:
const VERSION = "7.1.42"

DEPOIS:
const VERSION = "7.1.43"
```

---

### Parte 4: Atualizar default version em Embarcacoes.tsx

**Arquivo:** `src/pages/Embarcacoes.tsx`

**Linha 67:**
```typescript
ANTES:
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.41");

DEPOIS:
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.43");
```

---

### Parte 5: Reset do rollout via SQL

Para forcar re-aplicacao em todos os hotspots:

```sql
UPDATE public.hotspots SET portal_profile_version = NULL;
```

---

## Arquivos Modificados

| Arquivo | Linhas | Mudanca |
|---------|--------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | 38, 860, 968, 1181 | VERSION + nome `hs-navspot` |
| `supabase/functions/mikrotik-sync/index.ts` | 9, 12 | VERSION + REQUIRED_PORTAL_VERSION |
| `supabase/functions/mikrotik-script-generator/index.ts` | 8 | VERSION |
| `src/pages/Embarcacoes.tsx` | 67 | default version |
| Migration SQL | - | Reset portal_profile_version |

---

## Fluxo Apos Correcao

```text
1. Deploy das Edge Functions com nome correto (hs-navspot)
   
2. Migration SQL reseta portal_profile_version = NULL
   
3. MikroTik faz sync periodico
   |-- Backend detecta: portal_profile_version = NULL (diferente de 7.1.43-http-pap)
   |-- Injeta: configure_hotspot_profile no pipe
   
4. Action-processor executa:
   |-- :local hs [/ip hotspot find name="hs-navspot"]  ← AGORA ENCONTRA!
   |-- Pega o profile usado: "hsprof-navspot"
   |-- Aplica: login-by=http-pap
   
5. Proximo /ip hotspot profile print:
   |-- login-by: http-pap (sem http-chap)
   
6. Login no portal funciona!
```

---

## Testes Pos-Deploy

| Teste | Comando/Acao | Resultado Esperado |
|-------|--------------|-------------------|
| Verificar scripts | `/system script print` | Scripts v7.1.43 |
| Sync forcado | `/system script run navspot-sync` | Log mostra "v7.1.43" |
| Verificar profile | `/ip hotspot profile print detail` | `login-by: http-pap` |
| Login no portal | Conectar WiFi e logar | Autenticacao OK |
| Guardian | `/system script run navspot-guardian` | "Sistema OK" |

---

## Verificacao Rapida no MikroTik

Apos deploy, execute:

```routeros
/ip hotspot profile print detail where login-by~"http-pap"
```

Se retornar o profile `hsprof-navspot`, o problema esta resolvido.

---

## Rollback

Se algo der errado:

1. Reverter o nome para `"navspot"` (voltaria ao bug original)

2. Manual no MikroTik:
```routeros
/ip hotspot profile set [find name="hsprof-navspot"] login-by=http-pap
```

3. Reset de rollout:
```sql
UPDATE public.hotspots SET portal_profile_version = NULL;
```

