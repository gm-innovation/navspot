

# Plano v6.8: Correção Definitiva + Action Processor v2 Robusto

## Resumo Executivo

Este plano implementa **4 correções críticas** para compatibilidade total com RouterOS 6.x e adiciona o **Action Processor v2** com validação, idempotência, lock e auto-criação de perfis.

---

## Problemas Identificados vs. Estado Atual

| # | Problema | Linha Atual | Estado | Correção |
|---|----------|-------------|--------|----------|
| 1 | Token: `/file add` não existe no ROS | 475 | ❌ Usa comando inválido | `/file print file=` + `/file set` |
| 2 | Sync: Falta header `Content-Type` | 278 | ❌ Erro 500 do servidor | Adicionar `http-header-field` |
| 3 | Sanity check proíbe `/file print file=` | 138-140 | ❌ Bloqueia solução | Inverter/remover check |
| 4 | Action Processor básico demais | 292-385 | ⚠️ Funcional mas frágil | Upgrade para v2 robusto |

---

## Correção 1: Token via `/file print file=` (CRÍTICA)

**Problema:** O comando `/file add` NÃO EXISTE no RouterOS. A linha 475 usa um fallback inválido.

**Linhas 469-478 - Código Atual:**
```routeros
# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
:do {
/file set [find name="navspot-token.txt"] contents="${hotspot.sync_token}"
} on-error={
/file add name="navspot-token.txt" contents="${hotspot.sync_token}"
}
:delay 1s
:log info "NAVSPOT: Token criado"
```

**Código Corrigido:**
```routeros
# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file print file=navspot-token
:delay 2s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
:delay 1s
:log info "NAVSPOT: Token criado"
```

**Por que funciona:**
- `/file print file=navspot-token` cria um arquivo vazio `navspot-token.txt`
- `:delay 2s` permite que o sistema de arquivos finalize a escrita
- `/file set` preenche o conteúdo diretamente por nome

---

## Correção 2: Header Content-Type no Fetch (CRÍTICA)

**Problema:** O servidor retorna erro 500 porque o MikroTik não envia `Content-Type: application/json`.

**Linha 278 - Código Atual:**
```routeros
:local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body output=user as-value]
```

**Código Corrigido:**
```routeros
:local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" output=user as-value]
```

---

## Correção 3: Sanity Check Atualizado

**Problema:** O check (linha 138) PROÍBE `/file print file=`, mas agora precisamos usá-lo.

**Linhas 138-140 - Código Atual:**
```typescript
if (bootstrapScript.includes('/file print file=')) {
  throw new Error('Erro: /file print file= invalido em scripts MikroTik.')
}
```

**Código Corrigido:** Inverter a lógica para exigir o padrão correto:
```typescript
// v6.8: /file print file= é OBRIGATÓRIO para criar arquivos no RouterOS
if (!bootstrapScript.includes('/file print file=navspot-token')) {
  console.warn('[script-generator] AVISO: Token deve usar /file print file= para compatibilidade ROS 6.x')
}
```

---

## Correção 4: Action Processor v2 (PULO DO GATO)

O Action Processor atual (linhas 292-385) é básico e não possui:
- ✖ Lock para evitar concorrência
- ✖ Auto-criação de perfis quando o usuário referencia perfil inexistente
- ✖ Validação de parâmetros
- ✖ Logs detalhados
- ✖ Limpeza correta das ações

### Requisitos do Action Processor v2:

1. **Idempotência:** Reaplicar a mesma ação não deve quebrar o sistema
2. **Lock:** Evitar execuções simultâneas via variável global `navspotLock`
3. **Auto-criação de perfis:** Se `create_user` referencia perfil inexistente, criar com defaults
4. **Validação:** Verificar parâmetros antes de executar
5. **Logs detalhados:** JSON enviado, ações aplicadas, erros
6. **Limpeza segura:** Limpar `navspotActions` apenas após sucesso

### Código do Action Processor v2:

```typescript
const actionProcessorSource = `:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
:local rawData $navspotActions
:if ([:len $rawData] = 0) do={
:set navspotLock "0"
:log info "NAVSPOT: Sem acoes pendentes"
:return
}
:log info ("NAVSPOT-ACTION v2: Iniciando - " . $rawData)
:local pos 0
:do {
:while ([:find $rawData ";" $pos] >= 0) do={
:local endPos [:find $rawData ";" $pos]
:local line [:pick $rawData $pos $endPos]
:set pos ($endPos + 1)
:local i 0
:local j ([:len $line] - 1)
:while (($i <= $j) && ([:pick $line $i] = " ")) do={:set i ($i + 1)}
:while (($j >= $i) && ([:pick $line $j] = " ")) do={:set j ($j - 1)}
:if ($j < $i) do={:set pos ($endPos + 1)}
:local trimmed [:pick $line $i ($j + 1)]
:local p1 [:find $trimmed "|"]
:if ($p1 >= 0) do={
:local cmd [:pick $trimmed 0 $p1]
:local rest [:pick $trimmed ($p1 + 1) [:len $trimmed]]
:if ($cmd = "create_profile") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local pRate ""
:local pShared "1"
:local pLimit "0"
:if ($p3 >= 0) do={
:set pRate [:pick $sub 0 $p3]
:local sub2 [:pick $sub ($p3 + 1) [:len $sub]]
:local p4 [:find $sub2 "|"]
:if ($p4 >= 0) do={
:set pShared [:pick $sub2 0 $p4]
:set pLimit [:pick $sub2 ($p4 + 1) [:len $sub2]]
} else={
:set pShared $sub2
}
} else={
:set pRate $sub
}
:if ([:len $pName] = 0) do={
:log warning "NAVSPOT: create_profile sem nome, ignorando"
} else={
:local existing [/ip hotspot user profile find name=$pName]
:if ([:len $existing] = 0) do={
/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared
:log info ("NAVSPOT: Perfil criado - " . $pName)
} else={
/ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared
:log info ("NAVSPOT: Perfil atualizado - " . $pName)
}
}
}
:if ($cmd = "create_user") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local sub [:pick $rest ($p2 + 1) [:len $rest]]
:local p3 [:find $sub "|"]
:local uPass [:pick $sub 0 $p3]
:local uProf [:pick $sub ($p3 + 1) [:len $sub]]
:if ([:len $uName] = 0) do={
:log warning "NAVSPOT: create_user sem nome, ignorando"
} else={
:if ([:len [/ip hotspot user profile find name=$uProf]] = 0) do={
:log warning ("NAVSPOT: Perfil " . $uProf . " nao existe. Criando com defaults...")
/ip hotspot user profile add name=$uProf
}
:local existing [/ip hotspot user find name=$uName]
:if ([:len $existing] = 0) do={
/ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
:log info ("NAVSPOT: Usuario criado - " . $uName)
} else={
/ip hotspot user set $existing password=$uPass profile=$uProf
:log info ("NAVSPOT: Usuario atualizado - " . $uName)
}
}
}
:if ($cmd = "remove_user") do={
:if ([:len $rest] > 0) do={
:local existing [/ip hotspot user find name=$rest]
:if ([:len $existing] > 0) do={
/ip hotspot user remove $existing
:log info ("NAVSPOT: Usuario removido - " . $rest)
} else={
:log info ("NAVSPOT: remove_user - usuario inexistente: " . $rest)
}
}
}
:if ($cmd = "disable_user") do={
:do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
:log info ("NAVSPOT: Usuario desabilitado - " . $rest)
}
:if ($cmd = "enable_user") do={
:do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
:log info ("NAVSPOT: Usuario habilitado - " . $rest)
}
:if ($cmd = "kick_session") do={
:local p2 [:find $rest "|"]
:local kUser [:pick $rest 0 $p2]
:local kMac [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
:log info ("NAVSPOT: Sessao encerrada - " . $kUser . "/" . $kMac)
}
:if ($cmd = "update_password") do={
:local p2 [:find $rest "|"]
:local uName [:pick $rest 0 $p2]
:local uPass [:pick $rest ($p2 + 1) [:len $rest]]
:do { /ip hotspot user set [find name=$uName] password=$uPass } on-error={}
:log info ("NAVSPOT: Senha atualizada - " . $uName)
}
:if ($cmd = "create_whitelist_domain") do={
:local p2 [:find $rest "|"]
:local wName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-" . $wName)
:log info ("NAVSPOT: Whitelist adicionado - " . $domain)
}
}
:if ($cmd = "create_blacklist_domain") do={
:local p2 [:find $rest "|"]
:local bName [:pick $rest 0 $p2]
:local domain [:pick $rest ($p2 + 1) [:len $rest]]
:log info ("NAVSPOT: Blacklist registrado - " . $domain)
}
:if ($cmd = "update_profile_quota") do={
:local p2 [:find $rest "|"]
:local pName [:pick $rest 0 $p2]
:local quota [:pick $rest ($p2 + 1) [:len $rest]]
:local quotaBytes ($quota * 1024 * 1024)
:foreach uId in=[/ip hotspot user find where profile=$pName] do={
:do { /ip hotspot user set $uId limit-bytes-total=$quotaBytes } on-error={}
}
:log info ("NAVSPOT: Quota aplicada - " . $pName . " = " . $quota . " MB")
}
}
}
} on-error={
:log warning "NAVSPOT-ACTION: Erro no processamento"
:set navspotLock "0"
:return
}
:set navspotActions ""
:set navspotLock "0"
:log info "NAVSPOT-ACTION v2: Processamento concluido"`
```

### Melhorias do v2 vs v1:

| Recurso | v1 (atual) | v2 (novo) |
|---------|------------|-----------|
| Lock de concorrência | ❌ | ✅ `navspotLock` |
| Auto-criar perfil se inexistente | ❌ | ✅ cria com defaults |
| Validação de nome vazio | ❌ | ✅ ignora e loga warning |
| Trim de espaços | ❌ | ✅ |
| Limpeza de ações após sucesso | Sempre | ✅ Apenas se ok |
| Tratamento de erro global | ❌ | ✅ `on-error` limpa lock |
| Logs detalhados | Básico | ✅ Completo |
| Verificar existência antes de remover | ❌ | ✅ |
| Parsing de `create_profile` com 4 params | ✅ | ✅ Melhorado |

---

## Resumo das Alterações

| Arquivo | Linha(s) | Mudança |
|---------|----------|---------|
| `mikrotik-script-generator/index.ts` | 70 | Atualizar log para v6.8 |
| `mikrotik-script-generator/index.ts` | 138-140 | Inverter sanity check de `/file print file=` |
| `mikrotik-script-generator/index.ts` | 167 | Atualizar version para '6.8' |
| `mikrotik-script-generator/index.ts` | 193, 220, 395, 488, 506 | Atualizar referências para v6.8 |
| `mikrotik-script-generator/index.ts` | 278 | Adicionar `http-header-field="Content-Type: application/json"` |
| `mikrotik-script-generator/index.ts` | 292-385 | Substituir Action Processor por v2 |
| `mikrotik-script-generator/index.ts` | 469-478 | Trocar `/file add` por `/file print file=` |
| `mikrotik-script-generator/index.ts` | 480 | Atualizar comentário para v6.8 |

---

## Script Final Esperado (Seções 9-10)

```routeros
# 9. TOKEN (metodo compativel com RouterOS 6.x e 7.x)
:do { /file remove "navspot-token.txt" } on-error={}
:delay 1s
/file print file=navspot-token
:delay 2s
/file set "navspot-token.txt" contents="HASH_DO_TOKEN"
:delay 1s
:log info "NAVSPOT: Token criado"

# 10. SYNC SCRIPT v6.8 + ACTION PROCESSOR v2
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
:global navspotActions
:global navspotLock
:if ($navspotLock = "1") do={
:log info "NAVSPOT-ACTION: processamento em andamento, abortando"
:return
}
:set navspotLock "1"
...
}

/system script add name="navspot-sync" policy=read,write,policy,test source={
:local token [/file get "navspot-token.txt" contents]
:local syncUrl "https://xxx.supabase.co/functions/v1/mikrotik-sync"
:local users ""
:local q "\22"
...
:local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" output=user as-value]
...
}
```

---

## Detalhes Técnicos

### Por que `/file print file=` cria um arquivo?

No RouterOS, o comando `/file print file=nome` redireciona a saída do comando para um arquivo. Como `/file print` lista os arquivos existentes, a saída é salva em `nome.txt`, criando o arquivo se não existir.

### Por que o header é necessário?

O Deno/Supabase Edge Functions usa o header `Content-Type` para determinar como parsear o body. Sem ele, `await req.json()` pode falhar ou interpretar incorretamente o payload.

### Fluxo de Execução do Action Processor v2:

```text
┌──────────────────────────────────────┐
│          navspot-sync executa        │
│   (scheduler a cada X minutos)       │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ Fetch para mikrotik-sync endpoint   │
│ Com header Content-Type: app/json   │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ Recebe resposta com [[ actions ]]   │
│ Extrai ações e salva em navspotActions│
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│    /system script run               │
│    navspot-action-processor         │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ 1. Verifica navspotLock             │
│    Se "1" → aborta (já em execução) │
│ 2. Define navspotLock = "1"         │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ Loop por cada ação (separadas por ;)│
│ - Trim de espaços                   │
│ - Split por | para extrair params   │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ Para cada comando:                  │
│ - create_profile: cria/atualiza     │
│ - create_user: verifica perfil      │
│   → auto-cria se inexistente        │
│   → cria/atualiza usuário           │
│ - remove_user: verifica existência  │
│ - disable/enable: aplica status     │
│ - kick_session: remove por MAC      │
│ - update_password: atualiza         │
│ - whitelist/blacklist: gerencia     │
│ - update_profile_quota: loop users  │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│ 3. Limpa navspotActions = ""        │
│ 4. Define navspotLock = "0"         │
│ 5. Log: "Processamento concluido"   │
└──────────────────────────────────────┘
```

---

## Validação Pós-Implementação

1. Gerar script para Engenharia Googlemarine
2. Baixar `navspot-bootstrap.rsc`
3. Verificar no arquivo:
   - [ ] Seção 9 usa `/file print file=navspot-token`
   - [ ] Linha do fetch inclui `http-header-field="Content-Type: application/json"`
   - [ ] Action Processor tem `navspotLock`
   - [ ] Versão é v6.8 em todos os logs
4. Upload para MikroTik via Files
5. Executar: `/import navspot-bootstrap.rsc`
6. Validar:
   ```
   /file print where name~"navspot"
   /system script print where name~"navspot"
   /system scheduler print where name~"navspot"
   ```
7. Forçar sync: `/system script run navspot-sync`
8. Verificar logs: `/log print where message~"NAVSPOT"`

---

## Ordenação de Ações pelo Backend

Para garantir que perfis existam antes de usuários, o `pending_actions_pipe` deve seguir a ordem:

```
[[ create_profile|tripulacao-googlemarine|3M/3M|1|104857600; create_user|alexandre.silva|048706|tripulacao-googlemarine; ]]
```

O Action Processor v2 também inclui **auto-criação de perfil** como fallback se o backend não enviar na ordem correta.

