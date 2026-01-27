
# Plano: Correções Técnicas de Sintaxe RouterOS + Segurança

## Problemas Identificados

| # | Problema | Causa | Impacto |
|---|----------|-------|---------|
| 1 | `:toarray` com separator | RouterOS nao tem split nativo por delimitador | Action processor nao funciona |
| 2 | Resposta salva em arquivo errado | Sync salva em `navspot-response.txt` mas processor le `navspot-actions.txt` | Acoes nunca executam |
| 3 | Variavel `$targetIf` fora de escopo | Variaveis locais nao persistem apos o script principal | Log final falha |
| 4 | Delays insuficientes | 500ms pode falhar em routers lentos | Arquivos nao criados |
| 5 | Sem firewall basico | Rede aberta para ataques | Seguranca comprometida |
| 6 | Sem rate limiting no hotspot | Login sem protecao | Vulneravel a brute force |

---

## Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Corrigir parsing, escopo, firewall |

---

## Correcoes Detalhadas

### 1. Parser Manual de Strings (Substituir :toarray)

RouterOS nao tem `:toarray $str separator="|"`. Precisamos implementar parsing manual usando `:find` e `:pick`:

```routeros
# Funcao helper para extrair campo por indice
# Formato esperado: id|type|param1|param2|...
:local parseField do={
  :local str $1
  :local fieldIdx $2
  :local currentIdx 0
  :local startPos 0
  :local endPos 0
  
  :for i from=0 to=([:len $str] - 1) do={
    :if ([:pick $str $i ($i+1)] = "|") do={
      :if ($currentIdx = $fieldIdx) do={
        :set endPos $i
        :return [:pick $str $startPos $endPos]
      }
      :set currentIdx ($currentIdx + 1)
      :set startPos ($i + 1)
    }
  }
  
  # Ultimo campo (sem | no final)
  :if ($currentIdx = $fieldIdx) do={
    :return [:pick $str $startPos [:len $str]]
  }
  
  :return ""
}
```

**Alternativa mais simples** (usar no processor):

```routeros
# Extrair campos manualmente
:local pos1 [:find $line "|"]
:local actionId [:pick $line 0 $pos1]
:local rest [:pick $line ($pos1+1) [:len $line]]

:local pos2 [:find $rest "|"]
:local actionType [:pick $rest 0 $pos2]
:local rest2 [:pick $rest ($pos2+1) [:len $rest]]

:local pos3 [:find $rest2 "|"]
:local param1 ""
:local param2 ""
:if ($pos3 > 0) do={
  :set param1 [:pick $rest2 0 $pos3]
  :set param2 [:pick $rest2 ($pos3+1) [:len $rest2]]
} else={
  :set param1 $rest2
}
```

### 2. Fluxo de Resposta Corrigido

**Problema atual:**
1. Sync recebe resposta JSON
2. Salva em `navspot-response.txt`
3. Processor tenta ler `navspot-actions.txt` (ERRADO!)

**Solucao:** Extrair `pending_actions_pipe` da resposta e salvar no arquivo correto:

```routeros
# No sync script, apos receber resposta
:local response ($result->"data")

# Extrair campo pending_actions_pipe da resposta JSON
# O campo vem no formato: "pending_actions_pipe":"id|type|p1\nid2|type2|p2"
:local pipeStart [:find $response "pending_actions_pipe\":\""]
:if ($pipeStart > 0) do={
  :local contentStart ($pipeStart + 22)  # Length of pending_actions_pipe":"
  :local contentEnd [:find $response "\"" $contentStart]
  :local pipeContent [:pick $response $contentStart $contentEnd]
  
  # Substituir \n por quebra de linha real
  :local cleanContent ""
  :for i from=0 to=([:len $pipeContent] - 2) do={
    :if ([:pick $pipeContent $i ($i+2)] = "\\n") do={
      :set cleanContent ($cleanContent . "\n")
      :set i ($i + 1)
    } else={
      :set cleanContent ($cleanContent . [:pick $pipeContent $i ($i+1)])
    }
  }
  
  # Salvar em navspot-actions.txt (nao response.txt!)
  :if ([:len $cleanContent] > 0) do={
    /file print file="navspot-actions" where name=""
    :delay 1s
    /file set "navspot-actions.txt" contents=$cleanContent
    :log info ("NAVSPOT: Received " . [:len $cleanContent] . " bytes of actions")
    /system script run navspot-action-processor
  }
}
```

### 3. Variavel Global para Interface

```routeros
# No inicio do script (apos verificar interface)
:global navspotInterface $targetIf

# No final do script
:log info ("NAVSPOT: Interface: " . $navspotInterface . ", Gateway: ${gateway}")
```

### 4. Delays Aumentados

```routeros
# Aumentar de 500ms para 1s para maior compatibilidade
/file print file="navspot-token" where name=""
:delay 1s  # Era 500ms
/file set "navspot-token.txt" contents="${hotspot.sync_token}"

# Adicionar delay apos criar arquivos
/file print file="navspot-actions" where name=""
:delay 1s
```

### 5. Firewall Basico (Proteger Router + Isolamento)

```routeros
# ============================================
# Firewall Rules (Security)
# ============================================
/ip firewall filter
# Remove existing NAVSPOT security rules
:foreach f in=[find comment~"navspot-security"] do={ remove $f }

# Accept established connections
add chain=input action=accept connection-state=established,related \\
    comment="navspot-security-established"

# Allow local network to access DNS on router
add chain=input action=accept src-address=${networkCidr} \\
    dst-port=53 protocol=udp comment="navspot-security-dns"
add chain=input action=accept src-address=${networkCidr} \\
    dst-port=53 protocol=tcp comment="navspot-security-dns-tcp"

# Allow WinBox from local network only
add chain=input action=accept src-address=${networkCidr} \\
    dst-port=8291 protocol=tcp comment="navspot-security-winbox"

# Allow ping from local network
add chain=input action=accept src-address=${networkCidr} \\
    protocol=icmp comment="navspot-security-ping"

# Allow DHCP
add chain=input action=accept src-address=0.0.0.0 dst-address=255.255.255.255 \\
    dst-port=67 protocol=udp comment="navspot-security-dhcp-discover"

# Drop all other input from hotspot interface
add chain=input action=drop in-interface=$navspotInterface \\
    comment="navspot-security-drop-other"

# Client Isolation - prevent clients from reaching each other directly
add chain=forward action=drop src-address=${networkCidr} dst-address=${networkCidr} \\
    comment="navspot-security-client-isolation"
```

### 6. Hotspot Profile com Seguranca

```routeros
/ip hotspot profile
:do { remove [find name="hsprof-${hotspotSlug}"] } on-error={}
add name=hsprof-${hotspotSlug} hotspot-address=${gateway} \\
    dns-name=${hotspotSlug}.navspot.local \\
    html-directory=hotspot \\
    login-by=http-chap,http-pap \\
    http-cookie-lifetime=1d \\
    keepalive-timeout=5m \\
    rate-limit=""
```

---

## Estrutura do Action Processor Corrigido

```routeros
add name="navspot-action-processor" owner=admin policy=read,write,test,policy source={
  :local actionFile "navspot-actions.txt"
  :local executedFile "navspot-executed.txt"
  
  :do {
    :local content [/file get $actionFile contents]
    
    # Initialize executed list
    :local executed ""
    :do {
      :set executed [/file get $executedFile contents]
    } on-error={
      :set executed ""
    }
    
    # Processar linha por linha
    :local remaining $content
    :while ([:len $remaining] > 0) do={
      # Encontrar fim da linha
      :local lineEnd [:find $remaining "\n"]
      :local line ""
      :if ($lineEnd > 0) do={
        :set line [:pick $remaining 0 $lineEnd]
        :set remaining [:pick $remaining ($lineEnd+1) [:len $remaining]]
      } else={
        :set line $remaining
        :set remaining ""
      }
      
      :if ([:len $line] > 5) do={
        # Parse manual: extrair campos separados por |
        :local pos1 [:find $line "|"]
        :if ($pos1 > 0) do={
          :local actionId [:pick $line 0 $pos1]
          :local rest [:pick $line ($pos1+1) [:len $line]]
          
          :local pos2 [:find $rest "|"]
          :local actionType ""
          :local rest2 ""
          :if ($pos2 > 0) do={
            :set actionType [:pick $rest 0 $pos2]
            :set rest2 [:pick $rest ($pos2+1) [:len $rest]]
          } else={
            :set actionType $rest
          }
          
          :local pos3 [:find $rest2 "|"]
          :local param1 ""
          :local param2 ""
          :local param3 ""
          :if ($pos3 > 0) do={
            :set param1 [:pick $rest2 0 $pos3]
            :local rest3 [:pick $rest2 ($pos3+1) [:len $rest2]]
            :local pos4 [:find $rest3 "|"]
            :if ($pos4 > 0) do={
              :set param2 [:pick $rest3 0 $pos4]
              :set param3 [:pick $rest3 ($pos4+1) [:len $rest3]]
            } else={
              :set param2 $rest3
            }
          } else={
            :set param1 $rest2
          }
          
          :log info ("NAVSPOT: Action " . $actionId . " type " . $actionType)
          
          # Executar acao baseada no tipo
          :if ($actionType = "kick_session" || $actionType = "kick_device") do={
            :do {
              :if ([:len $param2] > 0) do={
                /ip hotspot active remove [find mac-address=$param2]
              } else={
                /ip hotspot active remove [find user=$param1]
              }
              :log info ("NAVSPOT: Kicked " . $param1)
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "disable_user") do={
            :do {
              /ip hotspot user set [find name=$param1] disabled=yes
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "enable_user") do={
            :do {
              /ip hotspot user set [find name=$param1] disabled=no
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "update_password") do={
            :do {
              /ip hotspot user set [find name=$param1] password=$param2
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "add_user" || $actionType = "create_user") do={
            :do {
              :local profile $param3
              :if ([:len $profile] = 0) do={ :set profile "default-navspot" }
              /ip hotspot user add name=$param1 password=$param2 profile=$profile \\
                  server=hs-${hotspotSlug}
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "remove_user") do={
            :do {
              /ip hotspot user remove [find name=$param1]
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
          
          :if ($actionType = "update_profile" || $actionType = "update_user_profile") do={
            :do {
              /ip hotspot user set [find name=$param1] profile=$param2
              :set executed ($executed . "\"" . $actionId . "\",")
            } on-error={}
          }
        }
      }
    }
    
    # Salvar acoes executadas
    :if ([:len $executed] > 0) do={
      /file print file="navspot-executed" where name=""
      :delay 1s
      /file set "navspot-executed.txt" contents=$executed
    }
    
    # Limpar arquivo de acoes
    :do { /file remove $actionFile } on-error={}
    
  } on-error={
    :log debug "NAVSPOT: No pending actions"
  }
}
```

---

## Sync Script Corrigido (Extrai pipe do JSON)

```routeros
add name="navspot-sync" owner=admin policy=read,write,test,policy source={
  :local syncToken [/file get "navspot-token.txt" contents]
  :local syncUrl "${syncUrl}"
  
  # ... coleta de usuarios ativos (sem mudanca) ...
  
  :do {
    :local result [/tool fetch url=$syncUrl mode=https http-method=post \\
        http-data=$payload http-header-field="Content-Type: application/json" \\
        output=user as-value]
    :local response ($result->"data")
    :log info "NAVSPOT: Sync completed"
    
    # Extrair pending_actions_pipe do JSON
    :local marker "pending_actions_pipe\":\""
    :local pipeStart [:find $response $marker]
    
    :if ($pipeStart > 0) do={
      :local contentStart ($pipeStart + [:len $marker])
      :local contentEnd [:find $response "\"" $contentStart]
      
      :if ($contentEnd > $contentStart) do={
        :local pipeContent [:pick $response $contentStart $contentEnd]
        
        # Converter \\n para quebras de linha reais
        :local cleanContent ""
        :local i 0
        :while ($i < [:len $pipeContent]) do={
          :local char [:pick $pipeContent $i ($i+1)]
          :if ($char = "\\" && ([:pick $pipeContent ($i+1) ($i+2)] = "n")) do={
            :set cleanContent ($cleanContent . "\n")
            :set i ($i + 2)
          } else={
            :set cleanContent ($cleanContent . $char)
            :set i ($i + 1)
          }
        }
        
        :if ([:len $cleanContent] > 2) do={
          /file print file="navspot-actions" where name=""
          :delay 1s
          /file set "navspot-actions.txt" contents=$cleanContent
          :log info ("NAVSPOT: " . [:len $cleanContent] . " bytes of actions to process")
          /system script run navspot-action-processor
        }
      }
    }
    
  } on-error={
    :log warning "NAVSPOT: Sync failed"
  }
}
```

---

## Resumo das Correcoes

| Problema | Solucao | Beneficio |
|----------|---------|-----------|
| `:toarray` invalido | Parsing manual com `:find`/`:pick` | Script executa corretamente |
| Arquivo errado | Extrair `pending_actions_pipe` | Acoes realmente executam |
| Variavel fora escopo | `:global navspotInterface` | Log final funciona |
| Delays curtos | Aumentar para 1s | Compativel com routers lentos |
| Sem firewall | Adicionar regras de protecao | Router seguro |
| Sem isolamento | Client isolation no forward | Clientes protegidos |
| Hotspot sem seguranca | Login CHAP + keepalive | Protecao contra ataques |
