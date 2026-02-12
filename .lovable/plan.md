

# Garantir que Regras do Perfil Funcionem no Sync (v7.8.4)

## Diagnostico

Apos analise completa do codigo, identifiquei o estado atual e as lacunas:

### O que ja funciona
- **Handlers `block_quota` e `unblock_quota`**: ja estao nos templates `sync` e `sync-standalone` (v7.8.3)
- **Handler `create_user` com upsert**: ja usa `set` com fallback para `add` (nao destroi contadores)
- **Regras de acesso** (`regras_acesso` + `listas_acesso`): o backend ja consulta e injeta acoes de firewall
- **Hash de firewall**: previne reenvio desnecessario de regras

### O que esta FALTANDO

1. **Handlers ausentes nos templates**: `update_user`, `update_password` e `kick_session` sao gerados pelo backend no pipe, mas os templates nao os processam — o roteador ignora essas acoes silenciosamente.

2. **Bloqueio de categorias nao e por perfil**: As regras de firewall sao aplicadas GLOBALMENTE no roteador (todos os usuarios recebem os mesmos bloqueios). Nao existe separacao por perfil MikroTik. Para que "Bloquear Redes Sociais" funcione apenas para um perfil especifico, precisamos de uma estrategia diferente.

3. **`update_user_profile` envia `create_user|user||profile`**: O backend mapeia mudanca de perfil como `create_user` com senha vazia, o que e funcional mas confuso — o handler de `create_user` ja faz upsert.

## Plano de Acao

### Parte 1: Adicionar handlers ausentes nos templates (sync e sync-standalone)

Adicionar 3 handlers no processador de acoes:

**Handler `update_user`** (formato: `update_user|USER|PASSWORD|PROFILE`):
```text
:if ($c = "update_user") do={
    :local p2 [:find $r "|"]
    :if ($p2 >= 0) do={
        :local un [:pick $r 0 $p2]
        :local rest [:pick $r ($p2 + 1) [:len $r]]
        :local p3 [:find $rest "|"]
        :local pw $rest
        :local pr "default"
        :if ($p3 >= 0) do={
            :set pw [:pick $rest 0 $p3]
            :set pr [:pick $rest ($p3 + 1) [:len $rest]]
        }
        :local idx [/ip hotspot user find name=$un]
        :if ([:len $idx] > 0) do={
            /ip hotspot user set $idx password=$pw profile=$pr comment="navspot" disabled=no
        } else={
            /ip hotspot user add name=$un password=$pw profile=$pr comment="navspot"
        }
        :set cnt ($cnt + 1)
    }
}
```

**Handler `update_password`** (formato: `update_password|USER|PASSWORD`):
```text
:if ($c = "update_password") do={
    :local p2 [:find $r "|"]
    :if ($p2 >= 0) do={
        :local un [:pick $r 0 $p2]
        :local pw [:pick $r ($p2 + 1) [:len $r]]
        :do { /ip hotspot user set [find name=$un] password=$pw } on-error={}
        :set cnt ($cnt + 1)
    }
}
```

**Handler `kick_session`** (formato: `kick_session|USER|MAC`):
```text
:if ($c = "kick_session") do={
    :local p2 [:find $r "|"]
    :local ku $r
    :local km ""
    :if ($p2 >= 0) do={
        :set ku [:pick $r 0 $p2]
        :set km [:pick $r ($p2 + 1) [:len $r]]
    }
    :if ([:len $km] > 0) do={
        :do { /ip hotspot active remove [find mac-address=$km] } on-error={}
    } else={
        :do { /ip hotspot active remove [find user=$ku] } on-error={}
    }
    :set cnt ($cnt + 1)
}
```

### Parte 2: Adicionar pipe format para `update_user` no backend

No switch de geracao do pipe (`mikrotik-sync/index.ts`, linha ~1770), o `update_user_profile` atualmente emite `create_user|user||profile`. Adicionar um case especifico para `update_user`:

```text
case 'update_user':
  return `update_user|${p.user || ''}|${p.password || ''}|${p.profile || 'default'}`
```

E no bloco de categorizacao por prioridade (linha ~1693), incluir `update_user` como acao de usuario:

```text
else if (action.type === 'update_user') {
  userActions.push(action)
}
```

### Parte 3: Bloqueio de categorias por perfil (estrategia via profile MikroTik)

O bloqueio de categorias (Redes Sociais, Streaming) atualmente e global. Para funcionar POR PERFIL, a estrategia e:

1. **No backend** (`mikrotik-sync`): Ao detectar que um perfil tem regras de blacklist associadas (via `regras_acesso`), alem de injetar as regras de firewall globais, o backend deve garantir que o perfil MikroTik tenha um nome que identifique suas restricoes. Quando o usuario muda de perfil, o backend envia `create_user|user|pwd|novo-perfil`.

2. **Nas regras de firewall do MikroTik**: As regras de bloqueio ja sao globais (content=dominio chain=forward action=reject). Para bloqueio PER-PROFILE, o roteador precisaria filtrar por `hotspot=profile-name`, mas isso nao e suportado nativamente no firewall filter do MikroTik.

3. **Alternativa pratica (recomendada)**: Como o firewall do MikroTik nao suporta filtragem por perfil de hotspot diretamente, a abordagem recomendada e:
   - Cada "conjunto de restricoes" corresponde a um perfil MikroTik diferente
   - As regras de firewall sao aplicadas globalmente mas usam **address-lists** com marcacao de conexao (mangle) vinculada ao perfil
   - **Isso ja funciona implicitamente** porque o backend envia `add_firewall_block` e `add_firewall_allow` baseado nas `regras_acesso` do perfil

**Na pratica**: Se o perfil "Tripulacao Googlemarine" tem as listas "Redes Sociais" e "Streaming" como `permitir` (acao no DB), o backend JA injeta as regras de firewall quando o hash muda. O problema e que elas sao globais. Para resolver isso de forma limpa, seria necessario um handler de `mangle` que marque pacotes por perfil — isso e uma feature nova e complexa.

**Solucao imediata viavel**: Manter o bloqueio global (que ja funciona) e adicionar os handlers ausentes para que `update_password`, `update_user` e `kick_session` funcionem. O bloqueio por categoria ja esta operacional para o cenario onde TODOS os usuarios de uma empresa tem as mesmas restricoes.

### Parte 4: Incremento de versao

| Arquivo | De | Para |
|---------|-----|------|
| `mikrotik-sync/index.ts` | `7.1.64` | `7.1.65` |
| `navspot-script-gen/index.ts` | `7.8.3` | `7.8.4` |

## Arquivos a Alterar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/mikrotik-sync/index.ts` | Adicionar case `update_user` no pipe format + categorizacao + version bump |
| Tabela `script_templates` (id=`sync`) | Adicionar handlers `update_user`, `update_password`, `kick_session` |
| Tabela `script_templates` (id=`sync-standalone`) | Idem |
| `supabase/functions/navspot-script-gen/index.ts` | Version bump para 7.8.4 |

## Ordem de Execucao

1. Atualizar `mikrotik-sync/index.ts` (pipe format + prioridade + versao)
2. Atualizar `navspot-script-gen/index.ts` (versao)
3. Atualizar templates no banco via SQL
4. Deploy das duas funcoes

## Riscos e Mitigacao

| Risco | Mitigacao |
|-------|----------|
| `update_user` com senha vazia sobrescreve senha existente | No handler, verificar se pw esta vazio e nao alterar se estiver |
| Templates grandes excedem buffer do script | Handlers adicionais sao ~20 linhas cada; total do template sync fica em ~4.8KB (dentro do limite) |
| Bloqueio per-profile nao funciona globalmente | Documentado como limitacao; bloqueio global ja funciona |

