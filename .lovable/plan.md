

# Plano: Corrigir Sincronizacao de Versao e Garantir Estabilidade

## Problema Principal

A Edge Function `mikrotik-scripts` apresenta comportamento intermitente:
- As vezes responde corretamente (logs 12:26:43Z mostram v7.1.31 funcionando)
- As vezes retorna 404 (durante o teste do bootstrap v7.1.31 as 09:07)

Alem disso, o frontend ainda tem versao desatualizada.

## Diagnostico Detalhado

### Linha do Tempo dos Logs

```text
ANTES do bootstrap v7.1.31:
08:49:42  NAVSPOT-SYNC v7.1.28: OK    <- Scripts v7.1.28 funcionando

PRIMEIRO bootstrap v7.1.29:
08:50:24  NAVSPOT v7.1.29: Iniciando bootstrap ULTRA-THIN...
08:50:50  NAVSPOT v7.1.29: Fetch OK!
08:50:54  NAVSPOT-INSTALL v7.1.30: Iniciando instalacao...  <- Baixou instalador v7.1.30
08:51:00  action baixado (4387 bytes)
08:51:00  action content INVALIDO - prefix=                  <- BUG: prefix vazio
08:51:01  Fallback inline v7.1.30F instalado

SEGUNDO bootstrap v7.1.31:
09:07:20  NAVSPOT v7.1.31: Iniciando bootstrap ULTRA-THIN...
09:07:43  Tentativa 1/3
09:07:45  Fetch falhou na tentativa 1                        <- Edge Function 404!
09:07:52  Fetch falhou na tentativa 2
09:07:59  Fetch falhou na tentativa 3
09:07:59  FALHA CRITICA - Fetch falhou apos 3 tentativas
```

### Dois Problemas Distintos

**Problema 1: Edge Function retornando 404**
- Causa: Provavelmente cold start ou redeploy em andamento
- Evidencia: A mesma funcao funcionou as 12:26 (logs mostram v7.1.31 OK)
- Solucao: O deploy ja foi feito novamente; precisa testar novamente

**Problema 2: Action-processor prefix vazio**
- O arquivo action-raw foi baixado com 4387 bytes
- Mas a leitura do conteudo retornou string vazia
- O fix v7.1.31 (retry de content) **ainda nao foi testado** porque o bootstrap falhou antes de baixar o instalador

## Alteracoes Necessarias

### 1. Atualizar versao default no frontend

**Arquivo:** `src/pages/Embarcacoes.tsx`
**Linha 67:**
```typescript
// DE:
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.29");

// PARA:
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.31");
```

Esta alteracao garante que o modal mostrara v7.1.31 antes de receber a resposta do backend.

### 2. Verificar que Edge Functions estao deployadas

As funcoes foram redeployadas durante esta investigacao. Apos a aprovacao, vou confirmar o deploy e testar via curl.

## Roteiro de Teste

### Passo 1: Testar Edge Function via Curl
Executar chamada direta para confirmar que a funcao responde:
- `?type=all&token=...` deve retornar o instalador
- `?type=action-raw&token=...` deve retornar o action-processor

### Passo 2: Gerar Novo Bootstrap v7.1.31
- Acessar /embarcacoes
- Gerar script para "Engenharia Googlemarine"
- Verificar que modal mostra v7.1.31
- Baixar arquivo e confirmar header v7.1.31

### Passo 3: Testar no MikroTik
```routeros
/import navspot-bootstrap-v7.1.31.rsc
/log print where message~"NAVSPOT"
```

**Resultado esperado:** O instalador v7.1.31 deve:
1. Baixar action-processor (4387 bytes)
2. Executar retry de content read (se necessario)
3. Logar `action content valido`
4. Instalar `navspot-action-processor v7.1.31` (sem fallback "F")

## Secao Tecnica: Fluxo do Retry de Content

O codigo v7.1.31 no instalador agora faz:

```text
Fetch action-raw --> OK (4387 bytes)
         |
         v
:delay 2500ms  (aumentado de 1500ms)
         |
         v
Ler tamanho --> Retry ate 3x --> OK (4387)
         |
         v
Ler conteudo --> [:pick contents 0 100]
         |
    vazio?
    /    \
  SIM    NAO --> Validar prefix
   |
   v
Log retry X/3
:delay 1500ms
   |
   v
Tentar novamente (ate 3x)
```

Este fluxo garante que mesmo em RouterOS 6.x com flash lenta, o conteudo sera lido corretamente apos suficiente tempo de sincronizacao.

