
# Correção v7.1.13: Sintaxe RouterOS 6.x Rigorosa

## Problemas Identificados no Código Atual

### 1) Comandos `/` sem prefixo `:do` em contextos de bloco

Em RouterOS 6.x, comandos que começam com `/` (como `/ip hotspot user profile add`) dentro de blocos `do={...}` precisam estar encapsulados em `:do { ... } on-error={}` ou ser precedidos por `:` quando são statements simples.

**Linhas problemáticas:**
- Linha 595: `/ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared`
- Linha 597: `/ip hotspot user profile add name=$pName shared-users=$pShared`
- Linha 603-605: `/ip hotspot user profile set $existing ...`
- Linha 624: `/ip hotspot user profile add name=$uProf`
- Linha 628: `/ip hotspot user add name=$uName ...`
- Linha 636-638: `/ip hotspot user set $existing ...`
- Linha 646: `/ip hotspot user remove $existing`

### 2) Lock `navspotLock` não liberado em todos os caminhos

O bloco `on-error` na linha 698 libera o lock, mas se houver erro em sub-blocos internos (ex: dentro de `:if ($cmd = "create_profile")`), o fluxo pode continuar sem liberar o lock corretamente.

### 3) Uso do operador `~` (regex) no `find where`

Linhas 656 e 667:
```routeros
:local wgExists [/ip hotspot walled-garden find where dst-host~$domain comment~"navspot"]
```

O operador `~` em RouterOS 6.x requer que o padrão regex esteja entre aspas. Além disso, múltiplas condições `where` precisam de `and` explícito:
```routeros
# ERRADO
find where dst-host~$domain comment~"navspot"

# CORRETO
find where dst-host~(".*" . $domain . ".*") and comment~"navspot"
```

### 4) Sintaxe `("" . $var)` dentro de propriedades com `=`

A sintaxe `login-url=("" . $loginUrl)` pode não funcionar em todos os contextos do RouterOS 6.x. O mais seguro é fazer em duas etapas:
```routeros
:local urlValue ("" . $loginUrl)
/ip hotspot profile set $hsprof login-url=$urlValue
```

## Plano de Correção v7.1.13

### Princípios RouterOS 6.x

1. **Todos os comandos dentro de `do={...}` devem começar com `:`**
   - Usar `:do { /comando } on-error={}` para comandos `/`
   
2. **Separação explícita com `;`**
   - Múltiplos statements no mesmo bloco: `do={ :cmd1; :cmd2; :cmd3 }`

3. **Lock liberado em TODOS os caminhos**
   - Inclusive após erros em sub-blocos

4. **Variáveis intermediárias para valores complexos**
   - Evitar expressões inline em propriedades

### Mudanças Técnicas

#### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

**1) Refatorar `generateActionProcessorSource()` completamente**

Estrutura corrigida:

```routeros
:log info "NAVSPOT-ACTION v7.1.13: Start"
:global navspotLock
:if ($navspotLock = "1") do={ :log info "NAVSPOT-ACTION: lock ativo"; :return }
:set navspotLock "1"

:local fid [/file find name="navspot-actions.txt"]
:if ([:len $fid] = 0) do={ 
  :set navspotLock "0"
  :log warning "NAVSPOT-ACTION: Arquivo nao encontrado"
  :return 
}

:local rawData ""
:do { 
  :set rawData [/file get $fid contents] 
} on-error={ 
  :log error "NAVSPOT-ACTION: Erro leitura"
  :set navspotLock "0"
  :return 
}

:log info ("NAVSPOT-ACTION: len=" . [:len $rawData])
:do { /file remove $fid } on-error={}

:if ([:len $rawData] = 0) do={ 
  :set navspotLock "0"
  :log info "NAVSPOT-ACTION: Nenhuma acao pendente"
  :return 
}

:local pos 0
:local processedCount 0

:while ([:find $rawData ";" $pos] >= 0) do={
  :local endPos [:find $rawData ";" $pos]
  :local line [:pick $rawData $pos $endPos]
  :set pos ($endPos + 1)
  
  :if ([:len $line] > 0) do={
    :local p1 [:find $line "|"]
    :if ($p1 >= 0) do={
      :local cmd [:pick $line 0 $p1]
      :local rest [:pick $line ($p1 + 1) [:len $line]]
      
      # configure_hotspot_profile handler
      :if ($cmd = "configure_hotspot_profile") do={
        :do {
          :local p2 [:find $rest "|"]
          :if ($p2 >= 0) do={
            :local loginUrl [:pick $rest 0 $p2]
            :local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
            :if (([:len $loginUrl] > 0) && ([:len $dnsName] > 0)) do={
              :local hsprof [/ip hotspot profile find name="hsprof-navspot"]
              :if ([:len $hsprof] > 0) do={
                :do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={ :log warning "NAVSPOT: falha login-url" }
                :do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={ :log warning "NAVSPOT: falha dns-name" }
                :do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
                :log info ("NAVSPOT: Profile config OK - " . $dnsName)
                :set processedCount ($processedCount + 1)
              }
            }
          }
        } on-error={ :log warning "NAVSPOT: Erro configure_hotspot_profile" }
      }
      
      # create_profile handler
      :if ($cmd = "create_profile") do={
        :do {
          :local p2 [:find $rest "|"]
          :if ($p2 >= 0) do={
            :local pName [:pick $rest 0 $p2]
            :if ([:len $pName] > 0) do={
              :local sub [:pick $rest ($p2 + 1) [:len $rest]]
              :local p3 [:find $sub "|"]
              :local pRate ""
              :local pShared "1"
              :if ($p3 >= 0) do={
                :set pRate [:pick $sub 0 $p3]
                :set pShared [:pick $sub ($p3 + 1) [:len $sub]]
              } else={
                :set pRate $sub
              }
              :local existing [/ip hotspot user profile find name=$pName]
              :if ([:len $existing] = 0) do={
                :if ([:len $pRate] > 0) do={
                  :do { /ip hotspot user profile add name=$pName rate-limit=$pRate shared-users=$pShared } on-error={}
                } else={
                  :do { /ip hotspot user profile add name=$pName shared-users=$pShared } on-error={}
                }
                :log info ("NAVSPOT: Perfil criado - " . $pName)
                :set processedCount ($processedCount + 1)
              } else={
                :if ([:len $pRate] > 0) do={
                  :do { /ip hotspot user profile set $existing rate-limit=$pRate shared-users=$pShared } on-error={}
                } else={
                  :do { /ip hotspot user profile set $existing shared-users=$pShared } on-error={}
                }
              }
            }
          }
        } on-error={ :log warning "NAVSPOT: Erro create_profile" }
      }
      
      # ... (demais handlers com mesma estrutura)
    }
  }
}

:set navspotLock "0"
:log info ("NAVSPOT-ACTION v7.1.13: OK - " . $processedCount . " acoes")
```

**2) Simplificar walled-garden find (remover operador ~)**

O operador `~` pode causar problemas. Usar busca exata com wildcard no dst-host:

```routeros
# Ao invés de find where dst-host~$domain
# Usar: buscar todos e filtrar manualmente, ou aceitar duplicatas com :do { add } on-error={}
```

Como o `add` com `:do { } on-error={}` é idempotente na prática (erro se já existe), podemos simplificar:

```routeros
:if ($cmd = "create_whitelist_domain") do={
  :do {
    :local p2 [:find $rest "|"]
    :if ($p2 >= 0) do={
      :local domain [:pick $rest ($p2 + 1) [:len $rest]]
      :if ([:len $domain] > 0) do={
        :local dstHost ("*" . $domain . "*")
        :do { /ip hotspot walled-garden add dst-host=$dstHost action=allow comment="navspot-whitelist" } on-error={}
        :set processedCount ($processedCount + 1)
      }
    }
  } on-error={ :log warning "NAVSPOT: Erro create_whitelist_domain" }
}
```

**3) Bump versão para 7.1.13**

### Arquivos Alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-scripts/index.ts` | Refatorar `generateActionProcessorSource()` com sintaxe rigorosa |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump VERSION para 7.1.13 |
| `src/components/modals/ScriptModal.tsx` | Bump scriptVersion para 7.1.13 |
| `src/pages/Embarcacoes.tsx` | Bump currentScriptVersion para 7.1.13 |

### Checklist de Sintaxe RouterOS 6.x

- [ ] Todo comando `/` encapsulado em `:do { } on-error={}`
- [ ] Todo statement em bloco separado por `;` ou quebra de linha
- [ ] Lock `navspotLock` liberado em TODOS os caminhos (início de cada handler com on-error)
- [ ] Sem operador `~` em contextos problemáticos
- [ ] Variáveis usadas diretamente (sem `("" . $var)`)
- [ ] Logs em todos os handlers

### Validação no MikroTik

1. Gerar e importar v7.1.13
2. Verificar: `/system script print where name="navspot-action-processor"` (sem flag I)
3. Rodar: `/system script run navspot-action-processor`
4. Logs: `/log print where message~"NAVSPOT-ACTION"`
