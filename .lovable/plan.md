
# Plano: NAVSPOT v7.1.36 - Revisao Tecnica Robusta

## Resumo das Melhorias a Implementar

Baseado na sua revisao tecnica, implementaremos as seguintes correcoes:

| Melhoria | Descricao |
|----------|-----------|
| Deteccao robusta de versao | Parsing do major release via [:find] em vez de [:pick] simples |
| Arquivo temporario unico | Sufixo com timestamp para evitar conteudo residual |
| fetch com dst-path direto | Grava resposta diretamente no arquivo (evita headers) |
| Limpeza segura de temporarios | Remocao com tratamento de erro |
| Retry com backoff variavel | Delays maiores no ROS 6.x vs ROS 7.x |
| Logs sem tokens expostos | Sanitizar logs para nao vazar credenciais |

---

## Problema 1: Deteccao de Versao Fragil

### Codigo Atual (v7.1.35)
O bootstrap NAO detecta a versao do RouterOS em runtime. Ele assume que o parametro ja foi passado.

### Correcao (v7.1.36)
Adicionar deteccao robusta ANTES do fetch:

```text
# Detectar versao do RouterOS (obter major release de forma robusta)
:local rosVer [/system resource get version]
:local dotIndex [:find $rosVer "."]
:local rosMajor $rosVer
:if ($dotIndex != 0) do={ :set rosMajor [:pick $rosVer 0 $dotIndex] }
:local rosV "6"
:if ($rosMajor = "7") do={
  :set rosV "7"
  :log info ("NAVSPOT: RouterOS " . $rosVer . " - modo otimizado (ros_version=" . $rosV . ")")
} else={
  :log info ("NAVSPOT: RouterOS " . $rosVer . " - modo compatibilidade (ros_version=" . $rosV . ")")
}
```

---

## Problema 2: Nome de Arquivo Estatico

### Codigo Atual
```text
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk)
/tool fetch url=$scriptsUrl check-certificate=no dst-path="ns-install.rsc"
```

O nome `ns-install.rsc` e fixo, podendo conter conteudo residual de execucoes anteriores.

### Correcao
Usar sufixo com timestamp para arquivo unico:

```text
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local tmpFile ("ns-install-" . $tsStr . ".rsc")
/tool fetch url=$scriptsUrl check-certificate=no dst-path=$tmpFile
```

---

## Problema 3: URL sem ros_version

### Codigo Atual
```text
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk)
```

A URL NAO inclui o parametro `ros_version`, entao a API assume ROS 6.x por padrao.

### Correcao
Incluir ros_version na URL:

```text
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk . "&ros_version=" . $rosV)
```

---

## Problema 4: Retry com Backoff Fixo

### Codigo Atual
```text
:delay 5s  # delay fixo entre retries
```

### Correcao
Backoff variavel baseado na versao do RouterOS:

```text
:local retryDelay 5s
:if ($rosV = "7") do={ :set retryDelay 2s } else={ :set retryDelay 5s }
...
:delay $retryDelay
```

---

## Problema 5: Sync Escrevendo Header do Sistema

### Codigo Atual (generateSyncSource)
```text
/tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no dst-path="navspot-resp.txt"
:delay 500ms
:local resp ""
:do {:set resp [/file get "navspot-resp.txt" contents]} on-error={}
```

O arquivo `navspot-resp.txt` pode conter header residual do sistema (# 2026-02-06...).

### Correcao
Usar arquivo temporario unico e remover ANTES de criar:

```text
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local respFile ("navspot-resp-" . $tsStr . ".txt")
# Remover arquivo se existir
:do {/file remove [find name~"navspot-resp-"]} on-error={}
/tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no dst-path=$respFile
:delay 500ms
:local resp ""
:do {:set resp [/file get $respFile contents]} on-error={}
:do {/file remove $respFile} on-error={}
```

---

## Arquivos a Modificar

### 1. supabase/functions/mikrotik-script-generator/index.ts

Modificacoes na funcao `generateBootstrapScript()`:

1. Adicionar deteccao de versao do RouterOS em runtime (antes do fetch)
2. Usar arquivo temporario com timestamp
3. Passar ros_version na URL da API
4. Backoff variavel entre retries
5. Atualizar VERSION para "7.1.36"

### 2. supabase/functions/mikrotik-scripts/index.ts

Modificacoes na funcao `generateSyncSource()`:

1. Usar arquivo de resposta temporario com timestamp
2. Limpar arquivos antigos antes de criar novo
3. Atualizar VERSION para "7.1.36"

### 3. src/pages/Embarcacoes.tsx

1. Atualizar defaultScriptVersion para "7.1.36"

---

## Secao Tecnica: Detalhamento do Bootstrap v7.1.36

### Bloco de Deteccao de Versao (inserir ANTES do fetch)

```text
# v7.1.36: Detectar versao do RouterOS de forma robusta
:local rosVer [/system resource get version]
:local dotIndex [:find $rosVer "."]
:local rosMajor $rosVer
:if ($dotIndex != 0) do={ :set rosMajor [:pick $rosVer 0 $dotIndex] }
:local rosV "6"
:if ($rosMajor = "7") do={
  :set rosV "7"
  :log info ("NAVSPOT v7.1.36: RouterOS " . $rosVer . " detectado - modo otimizado")
} else={
  :log info ("NAVSPOT v7.1.36: RouterOS " . $rosVer . " detectado - modo compatibilidade")
}
```

### Bloco de Fetch com Arquivo Unico (substituir bloco atual)

```text
# v7.1.36: Arquivo temporario unico para evitar conteudo residual
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local tmpFile ("ns-install-" . $tsStr . ".rsc")

# Construir URL com ros_version
:local scriptsUrl ($apiBase . "?type=all&token=" . $tk . "&ros_version=" . $rosV)

# Retry com backoff variavel
:local retryDelay 5s
:if ($rosV = "7") do={ :set retryDelay 2s }

:local maxRetries 3
:local retryCount 0
:local fetchSuccess false

:while (($retryCount < $maxRetries) && ($fetchSuccess = false)) do={
  :set retryCount ($retryCount + 1)
  :log info ("NAVSPOT v7.1.36: Tentativa " . $retryCount . "/" . $maxRetries)
  :do {
    /tool fetch url=$scriptsUrl check-certificate=no dst-path=$tmpFile
    :set fetchSuccess true
  } on-error={
    :log warning ("NAVSPOT v7.1.36: Fetch falhou na tentativa " . $retryCount)
    :if ($retryCount < $maxRetries) do={
      :delay $retryDelay
    }
  }
}
```

### Bloco de Import com Limpeza (substituir bloco atual)

```text
:if ($fetchSuccess = true) do={
  # Delay pos-fetch baseado na versao
  :if ($rosV = "7") do={ :delay 500ms } else={ :delay 4s }
  :log info "NAVSPOT v7.1.36: Importando scripts..."
  /import $tmpFile
  :delay 1s
  :do { /file remove $tmpFile } on-error={ :log warning "NAVSPOT: nao foi possivel remover arquivo temporario" }
  :log info "NAVSPOT v7.1.36: Scripts instalados com sucesso!"
  
  # ... resto do codigo (primeiro sync)
}
```

---

## Secao Tecnica: Detalhamento do Sync v7.1.36

### Modificacao em generateSyncSource()

```text
# v7.1.36: Arquivo de resposta unico com timestamp
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local respFile ("navspot-resp-" . $tsStr . ".txt")

# Limpar arquivos de resposta antigos
:do {
  :foreach oldFile in=[/file find where name~"navspot-resp-"] do={
    /file remove $oldFile
  }
} on-error={}
:delay 200ms

# Fetch com dst-path direto (evita headers do sistema)
:do {
  /tool fetch url="${syncUrl}" http-method=post http-data=$b http-header-field="Content-Type: application/json" check-certificate=no dst-path=$respFile
  :set ok true
} on-error={:set navspotSyncLock "0"}

:if ($ok) do={
  :delay 500ms
  :local resp ""
  :do {:set resp [/file get $respFile contents]} on-error={}
  :do {/file remove $respFile} on-error={}
  # ... resto do processamento
}
```

---

## Logs Esperados (v7.1.36)

### RouterOS 7.x (hAP ax2)
```text
NAVSPOT v7.1.36: RouterOS 7.14.3 detectado - modo otimizado
NAVSPOT v7.1.36: Tentativa 1/3
NAVSPOT v7.1.36: Fetch OK! (ns-install-113512.rsc)
NAVSPOT v7.1.36: Importando scripts...
NAVSPOT-INSTALL v7.1.36: Iniciando (ROS 7 mode)...
NAVSPOT-INSTALL: sync baixado (2856 bytes)
NAVSPOT-INSTALL: action-raw (full ~4.5KB)
NAVSPOT-INSTALL: CONCLUIDO!
```

### RouterOS 6.x
```text
NAVSPOT v7.1.36: RouterOS 6.49.10 detectado - modo compatibilidade
NAVSPOT v7.1.36: Tentativa 1/3
NAVSPOT v7.1.36: Fetch OK! (ns-install-113512.rsc)
NAVSPOT-INSTALL v7.1.36: Iniciando (ROS 6 mode)...
NAVSPOT-INSTALL: sync baixado (2856 bytes)
NAVSPOT-INSTALL: action-raw (core ~2.4KB)
NAVSPOT-INSTALL: CONCLUIDO!
```

---

## Testes Recomendados

| Teste | Verificacao |
|-------|-------------|
| hAP ax2 (ROS 7.14.3) | Log mostra "modo otimizado", API recebe ros_version=7 |
| ROS 6.x | Log mostra "modo compatibilidade", delays maiores |
| Falha de rede | Retry funciona, logs mostram tentativas, arquivos temporarios limpos |
| Concorrencia | Timestamps unicos evitam colisao |
| Conteudo residual | Nao aparece mais header "# 2026-02-..." no sync |

---

## Rollback

Se algo der errado:
1. Reverter VERSION para "7.1.35" nos 3 arquivos
2. Reimplantar Edge Functions
3. Gerar novo script para embarcacao

