

# Plano: Corrigir Timing de Leitura do Action Processor

## Problema Identificado

O instalador está falhando na validação do action-processor porque:

1. O arquivo é baixado corretamente (4387 bytes)
2. O tamanho é lido com sucesso (linha 426)
3. Mas a leitura do **conteúdo** retorna vazio (linha 439)
4. Como `prefix=""`, a validação falha e o fallback é instalado

```text
Log do MikroTik:
NAVSPOT-INSTALL: action baixado (4387 bytes)    <- OK
NAVSPOT-INSTALL: action content INVALIDO        <- FALHA
NAVSPOT-INSTALL: prefix=                        <- VAZIO!
```

### Causa Raiz

No RouterOS 6.x, existe um delay entre o arquivo estar disponível para leitura de metadados (`/file get size`) e o conteúdo estar sincronizado na memória flash para leitura (`/file get contents`). O código atual tem retry apenas para o tamanho, mas faz apenas UMA tentativa de leitura do conteúdo.

## Solucao Tecnica

Adicionar retry loop para a leitura do conteudo, similar ao que ja existe para o tamanho:

### Arquivo: supabase/functions/mikrotik-scripts/index.ts

### Alteracao 1: Adicionar retry na leitura do conteudo do action-processor (linhas 438-439)

**Codigo atual:**
```routeros
:local prefix ""
:do { :set prefix [:pick [/file get $actionTempFile contents] 0 100] } on-error={}
```

**Codigo novo:**
```routeros
:local prefix ""
:local prefixRetry 0
:while (([:len $prefix] = 0) && ($prefixRetry < 3)) do={
:set prefixRetry ($prefixRetry + 1)
:do { :set prefix [:pick [/file get $actionTempFile contents] 0 100] } on-error={}
:if ([:len $prefix] = 0) do={
:log info ("NAVSPOT-INSTALL: action content read retry " . $prefixRetry . "/3")
:delay 1500ms
}
}
```

### Alteracao 2: Mesma correcao para o guardian (linhas 540-541)

Aplicar o mesmo padrao de retry para garantir consistencia.

### Alteracao 3: Aumentar delay inicial pos-fetch

Aumentar o delay de 1500ms para 2500ms apos o fetch, dando mais tempo para a flash sincronizar.

### Alteracao 4: Atualizar docblock e VERSION

- Atualizar docblock de v7.1.25 para v7.1.31
- Documentar a nova correcao no header

## Resumo das Alteracoes

```text
Linha  | Alteracao
-------|-------------------------------------------
9      | Atualizar docblock para v7.1.31
21-26  | Adicionar nota sobre fix de content read
41     | VERSION = "7.1.31"
421    | Delay de 1500ms -> 2500ms
438-439| Adicionar retry loop para leitura prefix
523    | Delay de 1500ms -> 2500ms  
540-541| Adicionar retry loop para leitura prefix
```

## Diagrama do Fluxo Corrigido

```text
/tool fetch --> OK (4387 bytes)
       |
       v
:delay 2500ms  (aumentado de 1500ms)
       |
       v
/file get size --> Retry ate 3x --> OK (4387)
       |
       v
/file get contents --> Retry ate 3x --> OK (":log info...")
       |                    ^
       |                    |
       +-- se vazio, delay 1500ms e retry
       |
       v
Validacao [:find ":log info"] --> PASSOU
       |
       v
/system script add --> action-processor COMPLETO instalado
```

## Resultado Esperado

Apos a correcao:
- O instalador tera 3 tentativas para ler o conteudo do arquivo
- Cada tentativa espera 1500ms antes de tentar novamente
- Isso resolve o problema de timing do RouterOS 6.x
- O action-processor completo (com handlers de firewall) sera instalado corretamente
- Novos bootstraps funcionarao sem necessidade de intervencao manual

## Secao Tecnica: Por Que Isso Funciona

O RouterOS 6.x usa um sistema de arquivos em flash que tem dois niveis de cache:
1. **Metadata cache**: tamanho, nome, data de criacao (disponivel imediatamente)
2. **Content cache**: conteudo do arquivo (pode demorar 1-3 segundos para sincronizar)

O delay adicional e o retry garantem que esperamos tempo suficiente para ambos os caches estarem sincronizados.

