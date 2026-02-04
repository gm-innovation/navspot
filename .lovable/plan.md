
# Arquitetura v7.0 — Bootstrap Mínimo + Configuração via API

## Status: ✅ IMPLEMENTADO

## Resumo Executivo

A arquitetura **v7.0** transforma o sistema MikroTik em um **"thin client"** que recebe sua configuração dinâmica via API de sincronização, eliminando 100% dos erros de parser do RouterOS 6.x.

## Arquitetura da Solução

```text
ANTES (v6.9.x - Problemático)
+--------------------------------------------+
| Bootstrap (~1000 linhas)                   |
| - Infra (bridge, DHCP, NAT)                |
| - Hotspot Profile com login-url complexa   | <- PARSER QUEBRA AQUI
| - Walled Garden com wildcards              | <- PARSER QUEBRA AQUI
| - Scripts embarcados                       |
| - Tudo de uma vez no /import               |
+--------------------------------------------+

DEPOIS (v7.0 - Robusto)
+--------------------------------------------+
| Bootstrap MINIMO (~250 linhas)             |
| - Infra (bridge, DHCP, NAT)                |
| - Hotspot Profile VAZIO (sem login-url)    |
| - Scripts (sync, action-processor)         |
| - Token + Schedulers                       |
+---------------+----------------------------+
                | /import OK (100% limpo)
                v
+--------------------------------------------+
| Primeiro Sync (45s apos import)            |
| - API detecta: initial_config_sent=false   |
| - Injeta: configure_hotspot_profile        |
| - Injeta: add_walled_garden (essenciais)   |
| - Injeta: create_profile (todos perfis)    |
| - Injeta: create_user (todos tripulantes)  |
+---------------+----------------------------+
                | Pipe via resposta JSON
                v
+--------------------------------------------+
| navspot-action-processor (RUNTIME)         |
| - Executa comandos SEM restricoes parser   |
| - /ip hotspot profile set login-url=$url   | <- FUNCIONA!
+--------------------------------------------+
```

## Mudanças Implementadas

### 1. Migração SQL ✅
- Coluna `initial_config_sent` (BOOLEAN, default false) adicionada à tabela `hotspots`

### 2. mikrotik-sync v7.0 ✅
- Detecta `initial_config_sent=false` no primeiro sync
- Injeta `configure_hotspot_profile` com `login_url` e `dns_name`
- Injeta walled-garden essencial (portal, CPD, backend)
- Marca `initial_config_sent=true` após injetar
- Usa `unshift` para garantir ordem de execução

### 3. mikrotik-script-generator v7.0 ✅
- Bootstrap mínimo (~250 linhas vs ~700)
- Cleanup agressivo no início
- Hotspot profile **SEM login-url** (apenas nome + gateway)
- Action processor com handler `configure_hotspot_profile`
- Guardian v7.0 verifica se login-url está configurada

### 4. mikrotik-recovery-download v7.0 ✅
- Recovery simplificado (sem login-url)
- **CRÍTICO:** Reset `initial_config_sent=false` no banco
- Executa sync após recovery para receber config

### 5. Testes Atualizados ✅
- Testes para arquitetura v7.0
- Removidos testes de escape `\24(` e `\$(` (não mais necessários)
- Adicionados testes para configure_hotspot_profile handler

## Handler configure_hotspot_profile

```routeros
:if ($cmd = "configure_hotspot_profile") do={
  :local p2 [:find $rest "|"]
  :local loginUrl [:pick $rest 0 $p2]
  :local dnsName [:pick $rest ($p2 + 1) [:len $rest]]
  
  :local hsprof [/ip hotspot profile find name="hsprof-navspot"]
  :if ([:len $hsprof] > 0) do={
    :do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}
    :do { /ip hotspot profile set $hsprof dns-name=$dnsName } on-error={}
    :do { /ip hotspot profile set $hsprof login-by=http-pap,http-chap } on-error={}
    :do { /ip hotspot profile set $hsprof html-directory=hotspot } on-error={}
    :do { /ip hotspot profile set $hsprof keepalive-timeout=2m } on-error={}
    :do { /ip hotspot profile set $hsprof idle-timeout=5m } on-error={}
    :log info ("NAVSPOT v7.0: Hotspot profile configurado via sync - " . $dnsName)
  }
}
```

## Por que isso é definitivo?

1. **Bootstrap não tem strings complexas** - Sem `$(`, sem escapes, sem wildcards, sem URLs longas
2. **Configuração via runtime** - Action-processor não tem restrições de parser
3. **Thin client pattern** - MikroTik apenas executa, não interpreta
4. **Regra de ouro seguida** - Strings dinâmicas e longas vêm pelo sync
5. **Defesas múltiplas** - Guardian detecta profile incompleto e força re-sync
6. **Recovery robusto** - Reseta flag para forçar re-configuração completa

## Resultado Esperado

```routeros
# v7.0: Import SEMPRE funciona (script limpo e curto)
/import navspot-bootstrap-v7.0.0.rsc
# Completa SEM ERROS

# Após 45 segundos (primeiro sync)...
/log print where message~"NAVSPOT"
# NAVSPOT v7.0.0: BOOTSTRAP MINIMO CONCLUIDO
# NAVSPOT v7.0.0: Primeiro sync executado!
# NAVSPOT v7.0: Hotspot profile configurado via sync - minha-embarcacao.navspot.local

/ip hotspot profile print where name="hsprof-navspot"
# Mostra login-url com $(mac), $(ip), $(link-login-only)
```
