

# NAVSPOT v6.5 - Sync Inteligente (Revisado)

## Resumo das Mudanças

Atualizar o sistema para v6.5 com as correções solicitadas:

1. **Delimitador para domínios**: Um comando por domínio (`create_whitelist_domain`)
2. **Firewall Rules**: Apenas log por enquanto (v6.6 terá implementação completa)
3. **Quotas**: Atualizar perfil ao invés de usuário (`update_profile_quota`)

---

## Arquitetura v6.5

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Supabase)                          │
├─────────────────────────────────────────────────────────────────────┤
│  mikrotik-sync Edge Function                                        │
│  └── Responde com: [[ cmd1|p1|p2;cmd2|p1|p2; ]]                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MIKROTIK ROUTEROS                           │
├─────────────────────────────────────────────────────────────────────┤
│  navspot-sync (scheduler a cada 1 min)                              │
│  ├── Envia heartbeat + active_users_csv                             │
│  ├── Recebe resposta com [[ ações ]]                                │
│  └── Chama navspot-action-processor                                 │
│                                                                     │
│  navspot-action-processor (TODAS AS AÇÕES)                          │
│  ├── create_profile|name|rate                                       │
│  ├── create_user|user|pass|profile                                  │
│  ├── remove_user|user                                               │
│  ├── disable_user|user                                              │
│  ├── enable_user|user                                               │
│  ├── kick_session|user|mac                                          │
│  ├── update_password|user|pass                                      │
│  ├── create_whitelist_domain|listname|domain  (UM DOMINIO)         │
│  ├── create_blacklist_domain|listname|domain  (UM DOMINIO)         │
│  ├── create_firewall_rule|...|  (APENAS LOG por enquanto)          │
│  └── update_profile_quota|profile|quota_mb                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | v6.5 com novo processador |
| `supabase/functions/mikrotik-sync/index.ts` | Formato [[ pipe ]] com novas ações |

---

## 1. Tabela de Comandos v6.5 (REVISADA)

| Comando | Formato | Exemplo |
|---------|---------|---------|
| `create_profile` | `create_profile\|nome\|rate` | `create_profile\|Tripulacao\|3M/3M;` |
| `create_user` | `create_user\|user\|pass\|profile` | `create_user\|joao\|abc123\|Tripulacao;` |
| `remove_user` | `remove_user\|user` | `remove_user\|maria;` |
| `disable_user` | `disable_user\|user` | `disable_user\|pedro;` |
| `enable_user` | `enable_user\|user` | `enable_user\|pedro;` |
| `kick_session` | `kick_session\|user\|mac` | `kick_session\|joao\|AA:BB:CC:DD:EE:FF;` |
| `update_password` | `update_password\|user\|pass` | `update_password\|joao\|novaSenha;` |
| `create_whitelist_domain` | `create_whitelist_domain\|listname\|domain` | `create_whitelist_domain\|Comunicacao\|gmail.com;` |
| `create_blacklist_domain` | `create_blacklist_domain\|listname\|domain` | `create_blacklist_domain\|Redes-Sociais\|tiktok.com;` |
| `create_firewall_rule` | `create_firewall_rule\|...` | (apenas log v6.5) |
| `update_profile_quota` | `update_profile_quota\|profile\|quota_mb` | `update_profile_quota\|Tripulacao\|1024;` |

---

## 2. Mudancas no mikrotik-script-generator

### 2.1 Atualizar versao

Alterar de `v6.4` para `v6.5` nas mensagens e metadados.

### 2.2 Novo Script navspot-sync (v6.5)

Linha 222 - Substituir o script sync inline para extrair acoes entre `[[` e `]]`:

```routeros
:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
  :local u [get $a user]
  :local m [get $a mac-address]
  :local bi [get $a bytes-in]
  :local bo [get $a bytes-out]
  :set users ($users . $u . "," . $m . "," . $bi . "," . $bo . ";")
}
:local body ("{\"sync_token\":\"" . $token . "\",\"active_users_csv\":\"" . $users . "\"}")
:do {
  :local result [/tool fetch url=$syncUrl mode=https http-method=post http-data=$body output=user as-value]
  :if ($result->"status" = "finished") do={
    :local resp ($result->"data")
    :local start [:find $resp "[[ "]
    :local end [:find $resp " ]]"]
    :if ([:len $start] > 0 && [:len $end] > 0) do={
      :local actions [:pick $resp ($start + 3) $end]
      /system script run navspot-action-processor data=$actions
    }
  }
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"
```

### 2.3 Novo Script navspot-action-processor (v6.5)

Adicionar apos o sync script na secao 10:

```routeros
:local rawData $data
:log info "NAVSPOT: Processando acoes..."
:local pos 0
:while ([:find $rawData ";" $pos] >= 0) do={
  :local endPos [:find $rawData ";" $pos]
  :local line [:pick $rawData $pos $endPos]
  :set pos ($endPos + 1)
  :local p1 [:find $line "|"]
  :local cmd [:pick $line 0 $p1]
  :local rest [:pick $line ($p1 + 1) [:len $line]]
  
  # === PERFIS ===
  :if ($cmd = "create_profile") do={
    :local p2 [:find $rest "|"]
    :local pName [:pick $rest 0 $p2]
    :local pRate [:pick $rest ($p2 + 1) [:len $rest]]
    :if ([:len [/ip hotspot user profile find name=$pName]] = 0) do={
      /ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=1
      :log info "NAVSPOT: Perfil $pName criado"
    }
  }
  
  # === USUARIOS ===
  :if ($cmd = "create_user") do={
    :local p2 [:find $rest "|"]
    :local uName [:pick $rest 0 $p2]
    :local sub [:pick $rest ($p2 + 1) [:len $rest]]
    :local p3 [:find $sub "|"]
    :local uPass [:pick $sub 0 $p3]
    :local uProf [:pick $sub ($p3 + 1) [:len $sub]]
    :if ([:len [/ip hotspot user find name=$uName]] = 0) do={
      /ip hotspot user add name=$uName password=$uPass profile=$uProf comment="navspot-sync"
      :log info "NAVSPOT: Usuario $uName criado"
    } else={
      /ip hotspot user set [find name=$uName] password=$uPass profile=$uProf
      :log info "NAVSPOT: Usuario $uName atualizado"
    }
  }
  
  :if ($cmd = "remove_user") do={
    :do { /ip hotspot user remove [find name=$rest] } on-error={}
    :log info "NAVSPOT: Usuario $rest removido"
  }
  
  :if ($cmd = "disable_user") do={
    :do { /ip hotspot user set [find name=$rest] disabled=yes } on-error={}
    :log info "NAVSPOT: Usuario $rest desabilitado"
  }
  
  :if ($cmd = "enable_user") do={
    :do { /ip hotspot user set [find name=$rest] disabled=no } on-error={}
    :log info "NAVSPOT: Usuario $rest habilitado"
  }
  
  :if ($cmd = "kick_session") do={
    :local p2 [:find $rest "|"]
    :local kUser [:pick $rest 0 $p2]
    :local kMac [:pick $rest ($p2 + 1) [:len $rest]]
    :do { /ip hotspot active remove [find mac-address=$kMac] } on-error={}
    :log info "NAVSPOT: Sessao $kUser/$kMac encerrada"
  }
  
  :if ($cmd = "update_password") do={
    :local p2 [:find $rest "|"]
    :local uName [:pick $rest 0 $p2]
    :local uPass [:pick $rest ($p2 + 1) [:len $rest]]
    :do { /ip hotspot user set [find name=$uName] password=$uPass } on-error={}
    :log info "NAVSPOT: Senha de $uName atualizada"
  }
  
  # === LISTAS DE ACESSO (UM DOMINIO POR COMANDO) ===
  :if ($cmd = "create_whitelist_domain") do={
    :local p2 [:find $rest "|"]
    :local wName [:pick $rest 0 $p2]
    :local domain [:pick $rest ($p2 + 1) [:len $rest]]
    :if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
      /ip hotspot walled-garden add dst-host=$domain action=allow comment="navspot-$wName"
      :log info "NAVSPOT: Whitelist $wName - $domain adicionado"
    }
  }
  
  :if ($cmd = "create_blacklist_domain") do={
    :local p2 [:find $rest "|"]
    :local bName [:pick $rest 0 $p2]
    :local domain [:pick $rest ($p2 + 1) [:len $rest]]
    :log info "NAVSPOT: Blacklist $bName - $domain registrado (implementacao v6.6)"
  }
  
  # === FIREWALL RULES (APENAS LOG v6.5) ===
  :if ($cmd = "create_firewall_rule") do={
    :log info "NAVSPOT: Regra de firewall registrada (implementacao v6.6): $rest"
  }
  
  # === QUOTAS (NO PERFIL) ===
  :if ($cmd = "update_profile_quota") do={
    :local p2 [:find $rest "|"]
    :local pName [:pick $rest 0 $p2]
    :local quota [:pick $rest ($p2 + 1) [:len $rest]]
    :local quotaBytes ($quota * 1024 * 1024)
    :do { /ip hotspot user profile set [find name=$pName] limit-bytes-total=$quotaBytes } on-error={}
    :log info "NAVSPOT: Quota do perfil $pName atualizada para $quota MB"
  }
}
```

### 2.4 Estrutura Final do Bootstrap Script

```text
Secao 0:  Validacao WAN
Secao 1:  Limpeza inicial
Secao 2:  Configurar WAN
Secao 3:  Identidade
Secao 4:  Criar Bridge1
Secao 5:  Configurar rede (IP, Pool, DHCP, DNS)
Secao 6:  NAT
Secao 7:  Hotspot (login-by=http-pap)
Secao 8:  Walled Garden
Secao 9:  Token
Secao 10: Sync Script v6.5 + Action Processor (NOVO)
Secao 11: Migracao parcial de portas (ether3-5)
Secao 12: Pausa para troca de cabo
Secao 13: Finalizacao parcial
```

---

## 3. Mudancas no mikrotik-sync

### 3.1 Novo Formato de Resposta

Linhas 629-701 - Alterar o gerador de pipe para:

1. Usar `;` como delimitador de comandos (ao inves de `\n`)
2. Envolver em `[[ ]]` para extracao no RouterOS
3. Remover ID da acao (processamento local no MikroTik)
4. Usar novos comandos: `create_whitelist_domain`, `create_blacklist_domain`, `update_profile_quota`

**De:**
```typescript
const pipeDelimitedActions = formattedActions.map(action => {
  const parts = [action.id, action.type]
  // ...
  return parts.join('|')
}).join('\n')
```

**Para:**
```typescript
// v6.5: Format with semicolon delimiter, wrapped in [[ ]]
const pipeDelimitedActions = formattedActions.map(action => {
  const p = action.payload
  
  switch (action.type) {
    case 'kick_session':
    case 'kick_device':
      return `kick_session|${p.user || ''}|${p.mac || ''}`
    case 'disable_user':
      return `disable_user|${p.user || ''}`
    case 'enable_user':
      return `enable_user|${p.user || ''}`
    case 'remove_user':
      return `remove_user|${p.user || ''}`
    case 'update_password':
      return `update_password|${p.user || ''}|${p.password || ''}`
    case 'add_user':
    case 'create_user':
      return `create_user|${p.user || ''}|${p.password || ''}|${p.profile || 'default-navspot'}`
    case 'add_user_profile':
      return `create_profile|${p.name || ''}|${p.rate_limit || '2M/5M'}`
    case 'remove_user_profile':
      return `remove_profile|${p.name || ''}`
    case 'add_walled_garden':
      // Um comando por dominio para robustez
      return `create_whitelist_domain|${p.list_name || 'default'}|${p.dst_host || ''}`
    case 'add_firewall_filter':
      // Blacklist como comando separado por dominio
      return `create_blacklist_domain|${p.list_name || 'default'}|${p.domain || ''}`
    case 'add_firewall_l7':
      // Firewall rules apenas registradas (v6.6)
      return `create_firewall_rule|${p.order || 0}|${p.list || ''}|${p.type || ''}|${p.profile || ''}|${p.schedule || ''}|${p.action || ''}`
    case 'update_profile_quota':
      return `update_profile_quota|${p.profile || ''}|${p.quota_mb || 0}`
    default:
      return [action.type, ...Object.values(p).map(String)].join('|')
  }
}).join(';')

// Wrap in [[ ]] markers for RouterOS extraction
const formattedPipe = pipeDelimitedActions ? `[[ ${pipeDelimitedActions}; ]]` : ''
```

### 3.2 Atualizar Resposta JSON

Linha 709 - Usar `formattedPipe` ao inves de `pipeDelimitedActions`:

```typescript
return new Response(
  JSON.stringify({
    success: true,
    pending_actions: formattedActions,
    pending_actions_pipe: formattedPipe,  // v6.5: [[ cmd|p1;cmd2|p1; ]]
    firewall_rules: firewallRules,
    device_violations: deviceViolations,
    blocked_devices: blockedDevices,
    server_time: new Date().toISOString()
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
```

---

## 4. Fluxo Completo v6.5

```text
1. Admin cria tripulante "joao.silva" no painel
   └── Hook useTripulantes cria ação "create_user" em acoes_pendentes

2. MikroTik (scheduler a cada 1 minuto)
   └── navspot-sync envia: { sync_token, active_users_csv }

3. Backend (mikrotik-sync)
   ├── Valida token
   ├── Busca acoes pendentes
   ├── Gera perfil se necessario
   └── Responde: { pending_actions_pipe: "[[ create_profile|Tripulacao|3M/3M;create_user|joao.silva|abc123|Tripulacao; ]]" }

4. MikroTik (navspot-sync)
   ├── Extrai conteudo entre [[ e ]]
   └── Chama: navspot-action-processor data="create_profile|Tripulacao|3M/3M;create_user|joao.silva|abc123|Tripulacao;"

5. MikroTik (navspot-action-processor)
   ├── Parseia comandos separados por ;
   ├── Executa create_profile (se nao existe)
   ├── Executa create_user (idempotente)
   └── Logs: "NAVSPOT: Perfil Tripulacao criado", "NAVSPOT: Usuario joao.silva criado"

6. Resultado: Usuario joao.silva pode conectar em < 60 segundos
```

---

## 5. Exemplo de Resposta v6.5

### Cenario: Admin cria tripulante + adiciona 2 dominios à whitelist

**Ações na tabela `acoes_pendentes`:**
- create_user: joao.silva / abc123 / Tripulacao
- add_walled_garden: Comunicacao / gmail.com
- add_walled_garden: Comunicacao / outlook.com

**Resposta do backend:**
```json
{
  "success": true,
  "pending_actions_pipe": "[[ create_profile|Tripulacao|3M/3M;create_user|joao.silva|abc123|Tripulacao;create_whitelist_domain|Comunicacao|gmail.com;create_whitelist_domain|Comunicacao|outlook.com; ]]"
}
```

**MikroTik processa:**
1. Cria perfil "Tripulacao" com rate-limit 3M/3M
2. Cria usuario "joao.silva" com senha "abc123" e perfil "Tripulacao"
3. Adiciona gmail.com ao walled-garden (allow)
4. Adiciona outlook.com ao walled-garden (allow)

---

## 6. Benefícios da v6.5

| Beneficio | Descricao |
|-----------|-----------|
| Robusto | Um dominio por comando evita problemas de parsing |
| Tempo real | Acoes executadas em < 60s |
| Sem re-script | Nao precisa regenerar/reimportar script RSC |
| Idempotente | Verifica existencia antes de criar |
| Extensivel | v6.6 expandira firewall rules |
| Correto | Quota no perfil (nao no usuario) |

