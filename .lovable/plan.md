

# Plano v7.1.51: Reverter CLEANUP para o formato original que funcionava

## Problema

A v7.1.50 refatorou o cleanup inteiro (foreach + regex), mas isso introduziu erros de sintaxe (`$` dentro de aspas, etc). O cleanup original com `:do { }` **funcionava perfeitamente** -- o erro real era apenas no lock timeout (parsing de clock), ja corrigido na v7.1.49.

## Solucao

Reverter as linhas 316-360 do `mikrotik-script-generator/index.ts` para o formato original que funcionava nas versoes anteriores (v7.1.44 e anteriores), mantendo a correcao do lock (uptime-as-secs) da v7.1.49.

## Codigo que vai substituir linhas 316-360

```routeros
# 0. CLEANUP
:log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."
:do { /file remove [find where name=navspot-token.txt] } on-error={}
:do { /file remove [find where name=navspot-resp.txt] } on-error={}
:do { /file remove [find where name=navspot-recovery.rsc] } on-error={}
:do { /file remove [find where name=ns-install.rsc] } on-error={}
:do { /system script remove [find where name=navspot-sync] } on-error={}
:do { /system script remove [find where name=navspot-action-processor] } on-error={}
:do { /system script remove [find where name=navspot-guardian] } on-error={}
:do { /system scheduler remove [find where name=navspot-sync-scheduler] } on-error={}
:do { /system scheduler remove [find where name=navspot-guardian-scheduler] } on-error={}
:do { /tool netwatch remove [find where comment=navspot-netwatch] } on-error={}
:do { /ip hotspot remove [find name=hs-navspot] } on-error={}
:do { /ip hotspot profile remove [find name=hsprof-navspot] } on-error={}
:do { /ip dhcp-server remove [find name=dhcp-navspot] } on-error={}
:do { /ip dhcp-server network remove [find comment=navspot] } on-error={}
:do { /ip pool remove [find name=hs-pool-navspot] } on-error={}
:do { /ip address remove [find comment=navspot] } on-error={}
:do { /ip firewall nat remove [find comment=navspot-nat] } on-error={}
:do { /ip hotspot walled-garden remove [find comment=navspot-initial] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment=navspot-initial] } on-error={}
:do { /interface bridge port remove [find comment=navspot-lan] } on-error={}
:do { /interface bridge remove [find name=bridge1] } on-error={}
:do { /ip dhcp-client remove [find comment=navspot-wan] } on-error={}
:delay 2s
:log info "NAVSPOT v${VERSION}: Cleanup concluido"
```

**Unica diferenca do original**: remover as aspas duplas dos valores (`name=navspot-token.txt` em vez de `name="navspot-token.txt"`). Como nenhum desses nomes contem espacos, o RouterOS aceita sem aspas e isso elimina o conflito de parsing que causava o erro na coluna 49.

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `mikrotik-script-generator/index.ts` | Reverter linhas 316-360 para formato original (sem aspas nos valores), VERSION 7.1.51 |
| `mikrotik-scripts/index.ts` | VERSION 7.1.51 |
| `mikrotik-sync/index.ts` | VERSION 7.1.51 |
| `mikrotik-recovery-download/index.ts` | VERSION 7.1.51 |

## Resumo

- Mantemos a correcao do lock timeout (uptime-as-secs) da v7.1.49
- Revertemos o cleanup para o formato original que ja funcionava
- Unico ajuste: remover aspas dos valores no `find` para evitar o erro original da coluna 49
- Sem foreach, sem regex, sem complexidade extra

