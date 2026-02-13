

# Corrigir Guardian: Auto-Reset de Lock + Deteccao de Versao (v7.8.5)

## Diagnostico Confirmado

O hotspot aparece "Offline" no frontend porque a ultima sincronizacao foi em 12/Fev as 20:39 (ha mais de 14 horas). O roteador continua funcionando normalmente (usuarios navegando), mas o script de sync parou de se comunicar com o backend.

**Causa raiz**: O lock global `navspotSyncLock` ficou preso em `"1"` apos um crash durante o deploy do backend. O sync verifica esse lock e faz `:return` imediatamente quando esta em "1". O guardian nao reseta esse lock.

**Problema secundario**: O guardian nao tem logica de deteccao de versao. Ele nunca compara a versao local (7.8.2) com a do servidor (7.8.4), entao nunca atualiza os scripts automaticamente.

## Acao Imediata (Manual)

Executar no terminal do MikroTik para destravar o sync agora:

```text
:set navspotSyncLock "0"
```

## Alteracoes para Prevencao Definitiva

### 1. Template `guardian` — Adicionar 2 funcionalidades

**a) Auto-reset do lock quando sync nao roda**

Antes do bloco de reparo, o guardian verificara se o lock existe e esta preso. Se `navspotSyncLock = "1"`, reseta para "0" e loga um aviso:

```text
# Reset de lock travado
:global navspotSyncLock
:if ([:typeof $navspotSyncLock] != "nothing") do={
  :if ($navspotSyncLock = "1") do={
    :log warning "NAVSPOT-GUARDIAN: Lock de sync travado detectado, resetando..."
    :set navspotSyncLock "0"
  }
}
```

**b) Verificacao de versao contra o servidor**

O guardian fara um health check ao servidor e comparara a versao:

```text
# Version check
:do {
  :local hresp [/tool fetch url="{{SCRIPTS_URL}}&type=health&token={{SYNC_TOKEN}}" as-value output=user]
  :local hbody ($hresp->"data")
  :local vs [:find $hbody "\"version\":\""]
  :if ($vs >= 0) do={
    :local vstart ($vs + 11)
    :local vend [:find $hbody "\"" $vstart]
    :local serverVer [:pick $hbody $vstart $vend]
    :if ($serverVer != "{{VERSION}}") do={
      :log warning ("NAVSPOT-GUARDIAN: Versao local={{VERSION}} servidor=" . $serverVer . " - Atualizando...")
      :set needsRepair 1
      :set missing ($missing . "version ")
    }
  }
} on-error={
  :log warning "NAVSPOT-GUARDIAN: Falha no health check"
}
```

Quando a versao difere, `needsRepair` e setado para 1, o que faz o guardian disparar o fluxo de recovery (download e import do recovery script), que por sua vez reinstala todos os scripts na versao atual.

### 2. Template `guardian-standalone` — Mesmas alteracoes

O template `guardian-standalone` (usado na instalacao manual) recebera as mesmas duas funcionalidades.

### 3. Incremento de versao

| Arquivo | De | Para |
|---------|-----|------|
| `navspot-script-gen/index.ts` | `7.8.4` | `7.8.5` |

O `mikrotik-sync` nao precisa de mudanca (o backend ja esta funcional, testei com curl e retornou 200 OK).

### 4. Problema do ovo e da galinha

Existe um problema: o guardian atual no roteador (v7.8.2) nao tem a logica de deteccao de versao. Portanto:

- Atualizar o template nao atualiza o guardian no roteador automaticamente
- O usuario precisa executar um recovery manual **uma unica vez**
- Apos o recovery instalar o guardian v7.8.5, todas as atualizacoes futuras serao automaticas

**Opcao 1 (Recomendada)**: Executar no terminal do MikroTik:

```text
:set navspotSyncLock "0"
```

Isso destrava o sync imediatamente. O guardian v7.8.2 continuara rodando, mas agora ele detecta que login-url/pap estao OK e nao repara. Para forcar a atualizacao para v7.8.5, seria necessario importar o recovery script manualmente.

**Opcao 2**: Apos atualizar os templates, gerar os scripts novamente pelo painel e importar o `guardian.rsc` no roteador. A partir dai, o guardian v7.8.5 detectara versoes futuras automaticamente.

## Arquivos a Alterar

| Alvo | Acao |
|------|------|
| Tabela `script_templates` (id=`guardian`) | Adicionar auto-reset de lock + version check |
| Tabela `script_templates` (id=`guardian-standalone`) | Idem |
| `supabase/functions/navspot-script-gen/index.ts` | Version bump para 7.8.5 |

## Fluxo Apos Implementacao

```text
Guardian v7.8.5 roda (a cada 10 min):
  1. Verifica lock do sync -> reseta se travado
  2. Verifica componentes (sync, scheduler, login-url, login-by)
  3. Faz health check ao servidor -> compara versao
  4. Se qualquer check falhar -> recovery automatico
  5. Se tudo OK -> "Sistema OK"
```

## Resposta do Health Check

O endpoint `navspot-script-gen?mode=health` ja retorna:
```text
{"version":"7.8.5","status":"ok","deployed_at":"...","function":"navspot-script-gen"}
```

O guardian parseia o campo `version` e compara com `{{VERSION}}` (substituido pelo valor no momento da geracao).

