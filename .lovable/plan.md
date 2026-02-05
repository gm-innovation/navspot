
# Plano: Implementar Handler add_firewall_block no Action Processor

## Problema Identificado

O sistema possui regras de acesso do tipo Blacklist (Redes Sociais, Streaming) configuradas no perfil "Tripulacao Googlemarine", porem os dominos nao estao sendo bloqueados porque:

1. O backend gera corretamente acoes do tipo `add_firewall_block|facebook.com`
2. O action-processor no MikroTik NAO POSSUI handler para processar esse comando
3. As acoes sao ignoradas silenciosamente

As regras de firewall existentes no MikroTik (que voce ve com `/ip firewall filter print`) foram criadas manualmente durante o bootstrap ou testes - o sistema automatico de sincronizacao NAO esta criando novas regras.

## Arquitetura da Correcao

```text
+------------------+     +-------------------+     +--------------------+
| NavSpot Backend  | --> | Pipe Protocol     | --> | action-processor   |
|                  |     | add_firewall_block|     | (NOVO HANDLER)     |
| regras_acesso    |     | |facebook.com;    |     | /ip firewall filter|
| tipo=blacklist   |     |                   |     | add ... content=X  |
+------------------+     +-------------------+     +--------------------+
```

## Implementacao Tecnica

### Arquivo: supabase/functions/mikrotik-scripts/index.ts

#### 1. Adicionar handler `add_firewall_block` no generateActionProcessorCoreSource()

Inserir ANTES do fechamento do loop de parsing (linha ~844):

```routeros
:if ($c="add_firewall_block") do={
:do {
:local dom $r
:if ([:len $dom]>0) do={
:local cmt ("NAVSPOT-BLOCK-".$dom)
:local ex [/ip firewall filter find comment~$cmt]
:if ([:len $ex]=0) do={
/ip firewall filter add chain=forward action=drop protocol=tcp dst-port=80,443 content=$dom comment=$cmt place-before=([find where comment="defconf: fasttrack"]-0)
:set cnt ($cnt+1)
}}} on-error={}
}
```

#### 2. Adicionar handler `add_firewall_allow` (para modo bloquear_tudo)

```routeros
:if ($c="add_firewall_allow") do={
:do {
:local dom $r
:if ([:len $dom]>0) do={
:local cmt ("NAVSPOT-ALLOW-".$dom)
:local ex [/ip firewall filter find comment~$cmt]
:if ([:len $ex]=0) do={
/ip firewall filter add chain=forward action=accept content=$dom comment=$cmt
:set cnt ($cnt+1)
}}} on-error={}
}
```

### Posicionamento das Regras

As regras de firewall devem ser inseridas ANTES do fasttrack para garantir que o trafego seja processado:

```text
Ordem das regras no MikroTik:
1. NAVSPOT-BLOCK-* (bloqueios especificos)
2. NAVSPOT-ALLOW-* (permissoes para modo whitelist)  
3. NAVSPOT-ALLOW-MASTER (desabilitado no modo blacklist)
4. defconf: fasttrack
5. defconf: accept established
```

### Incremento de Versao

Atualizar VERSION de "7.1.29" para "7.1.30" para garantir que o guardian detecte script desatualizado e force reinstalacao.

## Secao Tecnica: Ordem de Execucao

### Por que content= e nao address-list?

O MikroTik Hotspot usa NAT (masquerade), entao os IPs de destino sao resolvidos dinamicamente. O filtro por `content=` funciona em HTTPS SNI e HTTP Host header, capturando o nome do dominio na camada 7.

### Idempotencia

O handler verifica se ja existe regra com comment identico antes de criar, evitando duplicacao:
```routeros
:local ex [/ip firewall filter find comment~$cmt]
:if ([:len $ex]=0) do={ ... }
```

### Forcando Resync das Regras

Apos o deploy, sera necessario resetar o hash de firewall para forcar reenvio:

```sql
UPDATE hotspots 
SET firewall_rules_hash = NULL 
WHERE nome ILIKE '%googlemarine%';
```

## Passos de Implementacao

1. Editar `supabase/functions/mikrotik-scripts/index.ts`
2. Adicionar handlers `add_firewall_block` e `add_firewall_allow` na funcao `generateActionProcessorCoreSource()`
3. Incrementar versao para 7.1.30
4. Deploy automatico da edge function
5. Executar SQL para resetar firewall_rules_hash
6. No MikroTik, executar: `/system script run navspot-guardian` para forcar atualizacao do script
7. Executar: `/system script run navspot-sync` para buscar novas acoes
8. Verificar com: `/ip firewall filter print where comment~"NAVSPOT-BLOCK"`

## Resultado Esperado

Apos a correcao:
- Dominios da blacklist "Redes Sociais" (facebook.com, instagram.com, tiktok.com, etc) serao bloqueados automaticamente
- Novas regras aparecerao no firewall filter do MikroTik
- Atualizacoes no painel refletirao no hardware em ~30 segundos
