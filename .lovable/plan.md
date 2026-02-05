

# Plano de Implementação v7.1.26: Diagnóstico Aprimorado + Fallback Seguro

## Resumo das Mudanças

Baseado na análise detalhada fornecida, esta versão implementa melhorias críticas para garantir que o `action-processor` seja executado corretamente e que o hotspot receba sua configuração de `login-url`.

---

## 1. Diagnóstico Aprimorado no Sync Script

### Problema Atual
O sync executa o action-processor silenciosamente:
```routeros
:do {/system script run navspot-action-processor} on-error={}
```

### Correção v7.1.26
```routeros
:local hasAP [:len [/system script find name="navspot-action-processor"]]
:if ($hasAP = 0) do={
  :log error "NAVSPOT-SYNC: action-processor NAO ENCONTRADO!"
} else={
  :local aerr ""
  :do {
    /system script run navspot-action-processor
  } on-error={
    :set aerr [:tostr $error]
  }
  :if ([:len $aerr] > 0) do={
    :log error ("NAVSPOT-SYNC: action-processor ERRO=" . $aerr)
  } else={
    :log info "NAVSPOT-SYNC: action-processor executed OK"
  }
}
```

---

## 2. Escrita de Arquivo com Write/Read-Back Verificável

### Problema Atual
O arquivo de ações é criado sem verificação de integridade.

### Correção v7.1.26
Implementar escrita com retries e log de prefixo para diagnóstico:

```routeros
:local tmpName ("navspot-actions-" . $tsStr . ".txt")
/file print file=$tmpName where name="__never__"
:delay 300ms
:local tries 0
:local wok false
:while (($tries < 3) && ($wok = false)) do={
  :set tries ($tries + 1)
  :do { /file set [find name=$tmpName] contents=$a } on-error={}
  :delay 500ms
  :local saved ""
  :do { :set saved [/file get [find name=$tmpName] contents] } on-error={}
  :if ([:len $saved] = [:len $a]) do={ :set wok true } else={
    :log warning ("NAVSPOT-SYNC: write mismatch attempt " . $tries . " savedLen=" . [:len $saved])
    :delay (300 * $tries)
  }
}
:if ($wok) do={
  # Atomic rename to canonical name
  :do { /file remove "navspot-actions.txt" } on-error={}
  :do { /file rename $tmpName navspot-actions.txt } on-error={}
} else={
  :log error "NAVSPOT-SYNC: unable to write navspot-actions.txt reliably"
  :do { /file remove $tmpName } on-error={}
}
```

---

## 3. Fallback Inline Seguro e Limitado

### Regras do Fallback
- Só executa se action-processor não existir OU falhar
- Processa apenas as primeiras **5 ações** (evita loops longos)
- Handlers apenas para `configure_hotspot_profile` e `create_user`
- Reset de lock em todos os caminhos de erro

### Código do Fallback Limitado
```routeros
# Fallback inline - apenas emergencia
:local maxFB 5
:local fbCnt 0
:local fbPos 0
:while (([:find $a ";" $fbPos] >= 0) && ($fbCnt < $maxFB)) do={
  :local fbEp [:find $a ";" $fbPos]
  :local fbLn [:pick $a $fbPos $fbEp]
  :set fbPos ($fbEp + 1)
  :if ([:len $fbLn] = 0) do={ :continue }
  :local fbP1 [:find $fbLn "|"]
  :if ($fbP1 < 0) do={ :continue }
  :local fbCmd [:pick $fbLn 0 $fbP1]
  :local fbRest [:pick $fbLn ($fbP1+1) [:len $fbLn]]
  :if ($fbCmd = "configure_hotspot_profile") do={
    :local fbP2 [:find $fbRest "|"]
    :if ($fbP2 >= 0) do={
      :local fbLu [:pick $fbRest 0 $fbP2]
      :local fbDn [:pick $fbRest ($fbP2+1) [:len $fbRest]]
      :local fbHp [/ip hotspot profile find name="hsprof-navspot"]
      :if ([:len $fbHp] > 0) do={
        :do { /ip hotspot profile set $fbHp login-url=$fbLu } on-error={}
        :do { /ip hotspot profile set $fbHp dns-name=$fbDn } on-error={}
        :log info "NAVSPOT-SYNC: FALLBACK configure_hotspot_profile OK"
        :set fbCnt ($fbCnt + 1)
      }
    }
  }
  :if ($fbCmd = "create_user") do={
    :local fbP2 [:find $fbRest "|"]
    :if ($fbP2 >= 0) do={
      :local fbUn [:pick $fbRest 0 $fbP2]
      :local fbRem [:pick $fbRest ($fbP2+1) [:len $fbRest]]
      :local fbP3 [:find $fbRem "|"]
      :local fbPw ""
      :local fbPf "default"
      :if ($fbP3 >= 0) do={
        :set fbPw [:pick $fbRem 0 $fbP3]
        :set fbPf [:pick $fbRem ($fbP3+1) [:len $fbRem]]
      } else={ :set fbPw $fbRem }
      :if ([:len $fbUn] > 0) do={
        :do { /ip hotspot user add name=$fbUn password=$fbPw profile=$fbPf comment="navspot-fb" } on-error={}
        :set fbCnt ($fbCnt + 1)
      }
    }
  }
}
:if ($fbCnt > 0) do={ :log info ("NAVSPOT-SYNC: FALLBACK processou " . $fbCnt . " acoes") }
```

---

## 4. Lock Cleanup em Todos os Caminhos de Erro

### Problema Atual
Se ocorrer erro em alguns pontos, o lock pode não ser liberado, causando deadlock.

### Correção v7.1.26
Inicializar lock no início e garantir reset em todos os caminhos:

```routeros
# No topo do sync:
:global navspotSyncLock
:if ([:len $navspotSyncLock] = 0) do={ :set navspotSyncLock "0" }
:if ($navspotSyncLock = "1") do={ :log info "NAVSPOT-SYNC: locked"; :return }
:set navspotSyncLock "1"

# Em TODOS os on-error que fazem :return, adicionar:
:set navspotSyncLock "0"

# No final (já existe):
:set navspotSyncLock "0"
```

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Mudanças em `generateSyncSource()` (linhas 641-694):**
- Bump VERSION para "7.1.26"
- Adicionar verificação de existência do action-processor
- Adicionar captura de erro com `[:tostr $error]`
- Adicionar escrita com write/read-back verificável
- Adicionar fallback inline limitado (max 5 ações)
- Adicionar inicialização robusta do lock

**Mudanças em `generateAllScripts()` (linha 302-581):**
- Bump VERSION para "7.1.26"

### 2. `supabase/functions/mikrotik-sync/index.ts`
- Linha 9: Bump VERSION para "7.1.26"

### 3. `supabase/functions/mikrotik-script-generator/index.ts`
- Bump VERSION para "7.1.26"

### 4. `src/components/modals/ScriptModal.tsx`
- Bump scriptVersion para "7.1.26"

### 5. `src/pages/Embarcacoes.tsx`
- Bump currentScriptVersion para "7.1.26"

---

## Verificação Pós-Deploy

```routeros
/import navspot-bootstrap-v7.1.26.rsc

# 1. Verificar logs detalhados
/log print where message~"NAVSPOT" last=100

# Esperado:
# - "action-processor executed OK" OU "action-processor ERRO=..."
# - Se fallback: "FALLBACK configure_hotspot_profile OK"
# - "NAVSPOT-SYNC v7.1.26: OK"

# 2. Verificar login-url configurado
/ip hotspot profile print where name="hsprof-navspot"
# login-url DEVE mostrar https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)

# 3. Verificar usuários criados
/ip hotspot user print where comment~"navspot"

# 4. Verificar scripts
/system script print
:put ("sync: " . [:len [/system script get navspot-sync source]] . " bytes")
:put ("action: " . [:len [/system script get navspot-action-processor source]] . " bytes")
```

---

## Riscos Mitigados

| Risco | Mitigação |
|-------|-----------|
| Race conditions em arquivos | Nomes temporários únicos + atomic rename |
| Arquivo vazio/header inválido | Write/read-back com verificação de length |
| Deadlocks de lock | Reset em todos os caminhos on-error |
| Fallback executa demais | Limite de 5 ações + handlers mínimos |
| Backslash corrompido | Sanitização preserva `\` |

---

## Limites de Tamanho Esperados

| Script | v7.1.25 | v7.1.26 Estimado | Limite |
|--------|---------|------------------|--------|
| sync-raw | ~2.0 KB | ~2.8 KB | < 3.2 KB |
| action-raw | ~2.7 KB | ~2.7 KB (sem mudança) | < 3.2 KB |
| guardian-raw | ~2.0 KB | ~2.0 KB (sem mudança) | < 3.2 KB |

---

## Checklist de Implementação

- [ ] Adicionar verificação de existência do action-processor com `[:len [/system script find ...]]`
- [ ] Adicionar captura de erro real com `[:tostr $error]`
- [ ] Implementar escrita com write/read-back verificável (3 retries)
- [ ] Implementar atomic rename para `navspot-actions.txt`
- [ ] Adicionar fallback inline limitado (max 5 ações)
- [ ] Garantir reset de lock em todos os caminhos de erro
- [ ] Manter sync source < 3.2KB
- [ ] Bump VERSION para 7.1.26 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x
- [ ] Verificar logs de diagnóstico (ERRO= ou executed OK)
- [ ] Verificar se login-url foi configurado
- [ ] Verificar se usuários foram criados

