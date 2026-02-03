
# Plano: Correção Definitiva do Script Recovery v6.9.26 - RouterOS 6.x

## Diagnóstico Final

O erro `expected end of command (line 763 column 33)` persiste porque **dentro de um bloco `:do { ... } on-error`**, o RouterOS 6.x **não mantém o contexto do menu** após a mudança `/ip firewall filter`.

A linha 761 do script gerado é:
```routeros
:local oldMaster [find comment="NAVSPOT-ALLOW-MASTER"]
```

Embora eu tenha entrado em `/ip firewall filter` na linha anterior, o contexto **não persiste dentro do bloco `:do { ... }`** durante o `/import`. Isso faz o `[find ...]` sem caminho ser inválido.

---

## Solução: Remover Completamente o Bloco Problemático

O bloco "AUTO-FIX remove old unscoped rules" é **opcional** - serve apenas para limpar regras antigas. O script de recovery funciona perfeitamente sem ele porque:

1. O **sync subsequente** irá recriar as regras corretamente com `hotspot=auth`
2. Se houver conflito, o admin pode remover manualmente via Winbox
3. O objetivo principal do recovery (recriar scripts, token, schedulers) não depende desse bloco

### Abordagem Simplificada

Vou **remover completamente** os blocos de AUTO-FIX de firewall que causam erros de sintaxe, tanto no Recovery quanto no Bootstrap. Isso inclui:

1. **Bloco AUTO-FIX do Recovery** (linhas 757-774 do script gerado)
2. **Handler `add_firewall_allow`** no action-processor - Simplificar para não usar `[find ...]` sem caminho

Para o handler `add_firewall_allow`, vou usar **caminho completo sem colchetes de command substitution**, executando os comandos diretamente:

```routeros
:if ($cmd = "add_firewall_allow") do={
  :local domain $rest
  :if ([:len $domain] > 0) do={
    # Walled Garden (robusto para hostnames - funciona sempre)
    :do { /ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain) } on-error={}
    :log info ("NAVSPOT: Walled Garden allow - " . $domain)
    # DNS resolution para address-list
    :do {
      :local resolvedIp [:resolve $domain]
      :if ([:len $resolvedIp] > 0) do={
        :do { /ip firewall address-list add list="NAVSPOT-ALLOWED" address=$resolvedIp timeout=none comment=("navspot-allow-" . $domain) } on-error={}
        :log info ("NAVSPOT: Firewall allow - " . $domain . " -> " . $resolvedIp)
      }
    } on-error={
      :log warning ("NAVSPOT: DNS failed for " . $domain . " - using Walled Garden only")
    }
  }
}
```

A criação das regras MASTER/ACCEPT será feita pelo **bootstrap** apenas (onde temos controle total do ambiente), não pelo action-processor dinâmico.

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`

**Mudanças:**
- Bump versão para `6.9.26`
- Atualizar `DEPLOYED_AT`
- **Remover** bloco AUTO-FIX do template do recovery (linhas do script que fazem `/ip firewall filter` + `[find ...]`)
- **Simplificar** action-processor embedded para não usar padrões problemáticos

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

**Mudanças:**
- Bump versão para `6.9.26`
- Atualizar `DEPLOYED_AT`
- **Simplificar** action-processor: handlers `add_firewall_block` e `add_firewall_allow` usam comandos diretos (sem `[find ...]` dentro de contextos problemáticos)
- Mover criação de regras MASTER/ACCEPT para fora do action-processor (criar no bootstrap se necessário)

### 3. `src/components/modals/ScriptModal.tsx`

**Mudanças:**
- Atualizar referência de versão no texto de features

### 4. `src/pages/Embarcacoes.tsx`

**Mudanças:**
- Atualizar default version para `6.9.26`

---

## Detalhes Técnicos da Correção

### Action Processor Simplificado (v6.9.26)

O novo handler `add_firewall_allow`:

```text
- Remove verificação de regras antigas (causa o erro)
- Usa apenas /ip hotspot walled-garden add (robusto, sem [find])
- Usa /ip firewall address-list add diretamente (sem verificar se existe)
- O on-error={} captura duplicatas silenciosamente
```

O handler `add_firewall_block`:

```text
- Usa /ip firewall address-list add diretamente
- O on-error={} captura duplicatas silenciosamente  
- Remove criação de NAVSPOT-BLOCK-MASTER (fica no bootstrap)
```

### Recovery Script Simplificado (v6.9.26)

```text
- Mantém: Token, Scripts, Schedulers, Walled Garden, Netwatch
- Remove: Bloco AUTO-FIX firewall (era opcional e causava erro)
- Mantém: Verificação de hotspot profile login-url (usa sintaxe compatível)
```

### Bootstrap Script (v6.9.26)

```text
- Cria regras NAVSPOT-BLOCK-MASTER e NAVSPOT-ALLOW-MASTER no bootstrap
- Usa comandos diretos (não dentro de `:do` com `[find]`)
- O action-processor apenas adiciona IPs às address-lists
```

---

## Validação

Após implementar:

1. **Recovery v6.9.26** não terá mais nenhum `[find ...]` sem caminho completo dentro de blocos `:do`
2. **Bootstrap v6.9.26** criará regras MASTER no momento da instalação
3. **Action-processor** apenas alimenta address-lists (sem gerenciar regras de firewall filter)

---

## Teste no MikroTik

```routeros
/import navspot-recovery-v6.9.26.rsc
```

Deve importar sem erros. Verificar:

```routeros
/log print where message~"NAVSPOT-RECOVERY"
/ip hotspot profile print where name="hsprof-navspot"
```
