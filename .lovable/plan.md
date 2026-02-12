

# Fix: Parar o Loop de Reset de Usuarios no Sync

## Diagnostico Confirmado

Os logs mostram claramente o problema:

```text
Registered users from MikroTik: 0 ()       <-- router nao envia a lista
User confirmed missing, miss_count=3        <-- reconciliacao acha que usuario sumiu
Re-syncing user (exceeded=true)             <-- envia create_user
create_user handler: remove + add           <-- MikroTik apaga contadores
```

**Causa raiz**: Os templates `sync` e `sync-standalone` enviam apenas `{"sync_token":"...", "active_count":N}` sem incluir `registered_users_csv` nem `active_users_csv`. A reconciliacao recebe lista vazia, conclui que todos os usuarios "sumiram" do router, e injeta `create_user` a cada 2 minutos. O handler `create_user` faz `remove` + `add`, zerando os contadores de bytes do MikroTik.

## Solucao em 2 Partes

### Parte 1: Backend (mikrotik-sync) — Correcao imediata

Alterar a funcao `reconcileUsers` para **nao injetar `create_user` se o usuario ja esta ativo (online)**. Se o usuario aparece em `active_users`, ele esta registrado e conectado — nao precisa ser recriado.

Mudancas no arquivo `supabase/functions/mikrotik-sync/index.ts`:

1. **Na funcao `reconcileUsers` (linha ~410)**: Antes de verificar `registeredUsersSet`, verificar tambem `activeUsersSet`. Se o usuario esta ativo, considerar como confirmado (nao missing).

2. **Adicionar guarda na reconciliacao**: Se `registered_users_csv` esta vazio MAS `active_users` tem usuarios, nao tratar como "router limpo" — tratar como "script antigo que nao envia registered_users".

Logica revisada:
```text
// Se registered_users_csv esta vazio MAS existem active_users,
// significa que o script nao envia essa informacao.
// NAO tratar como "router limpo" — pular reconciliacao.
if (registeredUsersCsv.trim() === '' && activeUsers.length > 0) {
  console.log('[reconcile] Script nao envia registered_users, pulando')
  return
}

// Se o usuario esta em active_users, ele esta registrado — pular
if (activeUsersSet.has(login)) {
  meta.miss_count = 0
  meta.last_seen = now
  continue  // NAO marcar como missing
}
```

### Parte 2: Templates de sync — Enviar dados completos

Atualizar os templates `sync` e `sync-standalone` no banco para incluir `active_users_csv` e `registered_users_csv` no payload POST. Isso permite que a reconciliacao funcione corretamente.

Mudancas nos templates (tabela `script_templates`):

**Coletar active_users_csv** (usuarios online com consumo):
```text
:local aucsv ""
:foreach i in=[/ip hotspot active find] do={
  :local u [/ip hotspot active get $i user]
  :local m [/ip hotspot active get $i mac-address]
  :local bi [/ip hotspot active get $i bytes-in]
  :local bo [/ip hotspot active get $i bytes-out]
  :set aucsv ($aucsv . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
```

**Coletar registered_users_csv** (usuarios cadastrados):
```text
:local rucsv ""
:foreach i in=[/ip hotspot user find where comment="navspot"] do={
  :local n [/ip hotspot user get $i name]
  :set rucsv ($rucsv . $n . ",")
}
```

**Incluir no POST**:
```text
:local post ("{\"sync_token\":\"" . $tk . "\",\"active_count\":" . $ac . ",\"active_users_csv\":\"" . $aucsv . "\",\"registered_users_csv\":\"" . $rucsv . "\"}")
```

**IMPORTANTE**: Os templates devem seguir as regras de compatibilidade RouterOS 7.x (sem linhas em branco, variaveis declaradas fora de blocos condicionais, nenhum uso de `:tostr`).

### Parte 3: Handler create_user — Nao remover se ja existe com mesmo perfil

Atualmente o handler faz:
```text
:do { /ip hotspot user remove [find name=$un] } on-error={}
/ip hotspot user add name=$un password=$pw profile=$pr
```

Alterar para verificar se ja existe com o mesmo perfil — se sim, apenas atualizar senha sem remover:
```text
:local existing [/ip hotspot user find name=$un]
:if ([:len $existing] > 0) do={
  /ip hotspot user set $existing password=$pw profile=$pr
} else={
  /ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
}
```

Isso preserva os contadores de bytes mesmo quando `create_user` e enviado.

## Arquivos a Alterar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/mikrotik-sync/index.ts` | Corrigir `reconcileUsers` (linhas ~346-464) |
| Tabela `script_templates` (id=`sync`) | Adicionar coleta de active_users_csv e registered_users_csv |
| Tabela `script_templates` (id=`sync-standalone`) | Idem |

## Ordem de Execucao

1. **Correcao imediata no backend** (mikrotik-sync): Impedir reconciliacao de injetar `create_user` quando registered_users esta vazio mas existem usuarios ativos. Isso para o loop AGORA.
2. **Atualizar templates sync**: Adicionar coleta de dados ao payload POST para que a reconciliacao funcione corretamente no futuro.
3. **Atualizar handler create_user nos templates**: Usar `set` em vez de `remove+add` para preservar contadores.

## Detalhes Tecnicos

### Mudanca 1: reconcileUsers (backend)

Na funcao `reconcileUsers` (linha ~346), adicionar guarda no inicio:

```text
// ANTES da verificacao de registeredUsersSet (linha ~356)
// Se registered_users_csv vazio MAS active_users tem gente,
// o script nao envia essa info — pular reconciliacao
if (registeredUsersCsv.trim().length === 0 && activeUsers.length > 0) {
  console.log('[reconcile] registered_users_csv empty but active users exist — script does not send this field, skipping')
  return
}
```

E na verificacao por usuario (linha ~410), adicionar check de activeUsersSet ANTES do check de registeredUsersSet:

```text
// Se o usuario esta ativo (online), ele ESTA registrado
if (activeUsersSet.has(login)) {
  meta.miss_count = 0
  meta.last_seen = now
  console.log('[reconcile] User confirmed active (online): ' + login)
  continue
}
```

### Mudanca 2: Templates sync e sync-standalone

Adicionar bloco de coleta ANTES do fetch, respeitando limites de buffer RouterOS (~2800 chars). O payload total nao pode exceder esse limite. Para isso, truncar `active_users_csv` se necessario.

### Mudanca 3: Handler create_user

Nos dois templates, substituir o padrao `remove+add` por `set` quando o usuario ja existe. Isso preserva `bytes-in` e `bytes-out` no MikroTik.

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| Payload excede buffer RouterOS (~2800 chars) | Truncar active_users_csv a 10 usuarios; registered_users_csv a 50 nomes |
| Reconciliacao para de funcionar para scripts novos | Parte 2 (templates) restaura a funcionalidade com dados reais |
| Mudanca no handler create_user causa erros em ROS 6 | Usar `:do {} on-error={}` para compatibilidade |

