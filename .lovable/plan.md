
# Quota Enforcement no MikroTik (v7.8.4)

## Problema Atual

Quando a quota atinge 100%, o backend apenas envia `kick_session` (remove a sessao ativa). O usuario reconecta imediatamente e continua navegando, pois nao existe bloqueio persistente no roteador.

## Solucao

Criar dois novos handlers no protocolo de sync: `block_quota` (bloqueio triplo) e `unblock_quota` (desbloqueio). O backend injeta essas acoes automaticamente quando a quota excede e quando o ciclo reseta.

## Fluxo

```text
Quota >= 100%
  Backend detecta no sync
    -> Injeta acao "block_quota" com MAC
      -> MikroTik executa:
         1. /ip hotspot ip-binding add (bloqueia re-login)
         2. /ip hotspot active remove (corta sessao)
         3. /ip firewall filter add (corta trafego imediato)

Quota resetada (ciclo ou admin aumentou)
  Backend detecta no resetExpiredQuotas
    -> Injeta acao "unblock_quota" com MAC
      -> MikroTik executa:
         1. /ip hotspot ip-binding remove (permite re-login)
         2. /ip firewall filter remove (libera trafego)
```

## Alteracoes

### 1. mikrotik-sync/index.ts — Backend (4 mudancas)

**a) Trocar `kick_session` por `block_quota` na deteccao de quota (linhas ~941-947)**

Atualmente quando quota >= 100%, o codigo adiciona o MAC a `blockedDevices` que gera um `kick_session`. Mudar para injetar diretamente uma acao `block_quota` com o MAC do usuario:

```text
// ANTES (linha 941-947):
if (shouldKickForQuota) {
  blockedDevices.push({ mac: activeUser.mac, reason: 'Quota de dados excedida' })
}

// DEPOIS:
if (shouldKickForQuota) {
  formattedActions.push({
    id: 'auto-block-quota-' + activeUser.mac.replace(/:/g, ''),
    type: 'block_quota',
    payload: { mac: activeUser.mac, user: activeUser.user }
  })
}
```

Nota: `formattedActions` nao esta disponivel nesse escopo. Sera necessario acumular as acoes de quota em um array local (`quotaBlockActions`) e injeta-las depois, junto com as demais acoes (na secao de montagem, apos linha ~1033).

**b) Retornar tripulantes desbloqueados em `resetExpiredQuotas` (linhas ~229-289)**

Atualmente a funcao retorna apenas `resetCount`. Alterar para retornar tambem os IDs dos tripulantes que foram reativados (status mudou de 'bloqueado' para 'ativo'):

```text
// Retornar: { resetCount, unblockedTripulanteIds: string[] }
```

**c) Injetar `unblock_quota` para tripulantes reativados (apos linha ~629)**

Apos chamar `resetExpiredQuotas`, buscar os MACs dos dispositivos dos tripulantes desbloqueados e injetar acoes `unblock_quota`:

```text
if (unblockedIds.length > 0) {
  // Buscar MACs dos dispositivos dos tripulantes desbloqueados
  const { data: devices } = await supabase
    .from('dispositivos_registrados')
    .select('mac_address')
    .in('tripulante_id', unblockedIds)
  
  for (const d of devices || []) {
    earlyActions.push({
      id: 'auto-unblock-quota-' + d.mac_address.replace(/:/g, ''),
      type: 'unblock_quota',
      payload: { mac: d.mac_address }
    })
  }
}
```

Essas acoes serao prepended ao `formattedActions` apos sua criacao (linha ~1033).

**d) Adicionar pipe format para `block_quota` e `unblock_quota` (linhas ~1716-1784)**

No switch de geracao do pipe delimitado:

```text
case 'block_quota':
  return 'block_quota|' + (p.mac || '') + '|' + (p.user || '')
case 'unblock_quota':
  return 'unblock_quota|' + (p.mac || '')
```

### 2. Templates sync-standalone e sync — Novos handlers

Adicionar dois handlers no processador de acoes dos templates (dentro do bloco `:while` que processa o pipe):

**Handler `block_quota`** (formato: `block_quota|MAC|USER`):

```text
:if ($c = "block_quota") do={
    :local p2 [:find $r "|"]
    :local bm $r
    :local bu ""
    :if ($p2 >= 0) do={
        :set bm [:pick $r 0 $p2]
        :set bu [:pick $r ($p2 + 1) [:len $r]]
    }
    :do { /ip hotspot ip-binding add mac-address=$bm type=blocked comment="QUOTA_EXCEDIDA" } on-error={}
    :do { /ip hotspot active remove [find mac-address=$bm] } on-error={}
    :do { /ip firewall filter add chain=forward src-mac-address=$bm action=reject comment="BLOCK_QUOTA" } on-error={}
    :log info ("NAVSPOT-SYNC: quota block " . $bm)
    :set cnt ($cnt + 1)
}
```

**Handler `unblock_quota`** (formato: `unblock_quota|MAC`):

```text
:if ($c = "unblock_quota") do={
    :do { /ip hotspot ip-binding remove [find mac-address=$r comment="QUOTA_EXCEDIDA"] } on-error={}
    :do { /ip firewall filter remove [find src-mac-address=$r comment="BLOCK_QUOTA"] } on-error={}
    :log info ("NAVSPOT-SYNC: quota unblock " . $r)
    :set cnt ($cnt + 1)
}
```

**Nota sobre `place-before=0`**: O usuario solicitou `place-before=0` na regra de firewall, mas conforme as regras do projeto (firewall-idempotency-rules), esse parametro causa falha em tabelas vazias. A regra sera adicionada sem `place-before`, usando `comment="BLOCK_QUOTA"` para identificacao e remocao segura. O `action=reject` garante corte imediato independente da posicao.

### 3. Prioridade das acoes de quota

Na secao de categorizacao por prioridade (linhas ~1620-1670), adicionar `block_quota` e `unblock_quota` como acoes de alta prioridade (junto com firewall), para que sejam processadas antes de create_user e profiles:

```text
else if (action.type === 'block_quota' || action.type === 'unblock_quota') {
  firewallBlockActions.push(action)  // mesma prioridade que firewall
}
```

### 4. Incremento de versao

| Arquivo | De | Para |
|---------|-----|------|
| `mikrotik-sync/index.ts` | `7.1.63` | `7.1.64` |
| `navspot-script-gen/index.ts` | `7.8.2` | `7.8.3` |

### 5. Atualizacao dos templates no banco

Os templates `sync-standalone` e `sync` na tabela `script_templates` serao atualizados via SQL com os novos handlers e versao `7.8.3`.

## Arquivos a Alterar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/mikrotik-sync/index.ts` | Backend: quota block/unblock logic + pipe format |
| Tabela `script_templates` (id=`sync-standalone`) | Adicionar handlers block_quota e unblock_quota |
| Tabela `script_templates` (id=`sync`) | Idem |
| `supabase/functions/navspot-script-gen/index.ts` | Incrementar VERSION para 7.8.3 |

## Ordem de Execucao

1. Alterar `mikrotik-sync/index.ts` (backend logic + pipe format + version bump)
2. Alterar `navspot-script-gen/index.ts` (version bump)
3. Atualizar templates no banco (SQL)
4. Deploy das duas funcoes
5. Testar: logar usuario, consumir quota, verificar logs de block_quota

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| ip-binding duplicado se sync roda 2x antes de processar | `:do {} on-error={}` previne erro; binding duplicado nao causa problema funcional |
| Firewall rule duplicada | `comment="BLOCK_QUOTA"` permite remocao seletiva; reject duplicado nao causa impacto |
| unblock_quota enviado mas MAC ja foi removido | `:do {} on-error={}` em ambos os removes; idempotente |
| resetExpiredQuotas roda mas sync nao tem acoes pendentes ainda | earlyActions sao injetadas no formattedActions da mesma resposta |
| Multiplos dispositivos do mesmo tripulante | Loop por `dispositivos_registrados` garante unblock de todos os MACs |
