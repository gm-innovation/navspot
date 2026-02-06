

# Plano v7.1.47: Corrigir Sintaxe de login-by (Remover Aspas)

## Problema Identificado

O erro `input does not match any value of value-name` ocorre porque o RouterOS **nao aceita aspas** no campo `login-by` quando passamos multiplos valores.

### Sintaxe Incorreta (v7.1.46):
```routeros
/ip hotspot profile set $hp login-by="cookie,http-pap"
# RouterOS tenta interpretar "cookie,http-pap" como string literal
# Erro: input does not match any value of value-name
```

### Sintaxe Correta:
```routeros
/ip hotspot profile set $hp login-by=cookie,http-pap
# RouterOS interpreta como lista de metodos: cookie + http-pap
```

A telemetria esta vindo vazia (`login_by=""`) porque o profile nao foi configurado corretamente devido a esse erro de sintaxe.

---

## Solucao: Remover Aspas em Todos os Arquivos

### Arquivos Afetados

| Arquivo | Linha | Antes | Depois |
|---------|-------|-------|--------|
| `mikrotik-script-generator/index.ts` | 451 | `login-by="cookie,http-pap"` | `login-by=cookie,http-pap` |
| `mikrotik-scripts/index.ts` | 866 | `login-by="cookie,http-pap"` | `login-by=cookie,http-pap` |
| `mikrotik-scripts/index.ts` | 977 | `login-by="cookie,http-pap"` | `login-by=cookie,http-pap` |
| `mikrotik-recovery-download/index.ts` | ~linha do recovery | `login-by="cookie,http-pap"` | `login-by=cookie,http-pap` |

### Bump de Versao

Atualizar para **v7.1.47** em todos os arquivos:
- `mikrotik-scripts/index.ts`
- `mikrotik-sync/index.ts`
- `mikrotik-script-generator/index.ts`
- `mikrotik-recovery-download/index.ts`
- `src/pages/Embarcacoes.tsx`

---

## Codigo Corrigido

### 1. mikrotik-script-generator/index.ts (Bootstrap)

```routeros
# ANTES (linha 451):
/ip hotspot profile set [find name="hsprof-navspot"] login-by="cookie,http-pap"

# DEPOIS:
/ip hotspot profile set [find name="hsprof-navspot"] login-by=cookie,http-pap
```

### 2. mikrotik-scripts/index.ts (Action Processor CORE - linha 866)

```routeros
# ANTES:
/ip hotspot profile set $hp login-by="cookie,http-pap"

# DEPOIS:
/ip hotspot profile set $hp login-by=cookie,http-pap
```

### 3. mikrotik-scripts/index.ts (Action Processor FULL - linha 977)

```routeros
# ANTES:
/ip hotspot profile set $hp login-by="cookie,http-pap"

# DEPOIS:
/ip hotspot profile set $hp login-by=cookie,http-pap
```

### 4. mikrotik-recovery-download/index.ts (Recovery)

```routeros
# ANTES:
/ip hotspot profile set $hp login-by="cookie,http-pap"

# DEPOIS:
/ip hotspot profile set $hp login-by=cookie,http-pap
```

---

## Por que as aspas causam o erro?

No RouterOS, o campo `login-by` espera uma **lista de valores predefinidos** (enum), nao uma string arbitraria.

Valores validos: `cookie`, `http-chap`, `http-pap`, `https`, `mac`, `mac-cookie`, `trial`

Quando usamos aspas:
- `login-by="cookie,http-pap"` - RouterOS tenta encontrar um valor literal chamado "cookie,http-pap" (com virgula)
- Como esse valor nao existe na lista de opcoes, gera o erro `input does not match any value of value-name`

Quando usamos sem aspas:
- `login-by=cookie,http-pap` - RouterOS interpreta como dois valores separados da lista: `cookie` E `http-pap`

---

## Fluxo Apos Deploy

```text
1. Deploy corrige sintaxe (sem aspas)

2. Reimportar bootstrap OU esperar recovery/sync:
   - /ip hotspot profile set ... login-by=cookie,http-pap
   - Comando executa SEM ERRO

3. Proximo sync:
   - Telemetria: hotspot_login_by="cookie,http-pap" (nao vazio!)
   - Backend confirma: hasPap=true, hasChap=false
   - Marca portal_profile_version = 7.1.47-http-pap

4. Login funciona!
```

---

## Verificacao pos-Deploy

Apos reimportar o bootstrap, execute:

```routeros
/ip hotspot profile print detail where name="hsprof-navspot"
# Esperado: login-by: cookie,http-pap
```

---

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `mikrotik-script-generator/index.ts` | Remover aspas + VERSION 7.1.47 |
| `mikrotik-scripts/index.ts` | Remover aspas (2 lugares) + VERSION 7.1.47 |
| `mikrotik-recovery-download/index.ts` | Remover aspas + VERSION 7.1.47 |
| `mikrotik-sync/index.ts` | VERSION + REQUIRED_PORTAL_VERSION 7.1.47-http-pap |
| `src/pages/Embarcacoes.tsx` | VERSION 7.1.47 |

---

## Nota Tecnica

Esta e uma correcao de sintaxe pura. A logica de telemetria e state reconciliation implementada na v7.1.46 esta correta - apenas a sintaxe do comando RouterOS estava errada.

