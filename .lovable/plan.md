

# Implementação v7.1 — Bootstrap-Loader (Ultra-Thin Client)

## Diagnóstico Confirmado

O erro `expected end of command (line 138 column 39)` ocorre exatamente onde o bootstrap tenta embutir scripts complexos:

```routeros
# Linha ~715 no código TypeScript gera linha ~138 no RSC:
/system script add name="navspot-action-processor" source={
${actionProcessorSource}   # <- ~200 linhas de RouterOS embutidas
}
```

O parser do RouterOS 6.x não suporta strings longas e multi-linha dentro de `source={...}` durante `/import`.

## Solução: Bootstrap-Loader v7.1

```text
+------------------------------------------+
| Bootstrap v7.1 ULTRA-MINIMO (~100 linhas)|
| - Infra (WAN, DNS, Bridge, DHCP, NAT)    |
| - Hotspot VAZIO                          |
| - Token salvo                            |
| - /tool fetch -> baixa scripts           | <- NOVO!
| - Schedulers                             |
+------------------------------------------+
          |
          v (fetch + import)
+------------------------------------------+
| Nova Edge Function: mikrotik-scripts     |
| GET ?type=all&token=XXX                  |
| -> Retorna RSC com os 3 scripts          |
+------------------------------------------+
```

## Arquitetura de Arquivos

### 1. Nova Edge Function: `mikrotik-scripts`

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

- Endpoint simples que retorna scripts RouterOS puros
- Parametros: `type` (sync|action-processor|guardian|all) e `token`
- Valida token no banco de dados
- Retorna `Content-Type: text/plain` (critico para MikroTik)
- Cada script e um arquivo RSC auto-contido que cria/atualiza o script no MikroTik

```typescript
// Exemplo de resposta para type=all
`# NAVSPOT Scripts Installer v7.1
/system script remove [find name="navspot-sync"]
/system script add name="navspot-sync" policy=read,write,test source={
  ... codigo do sync ...
}

/system script remove [find name="navspot-action-processor"]
/system script add name="navspot-action-processor" policy=read,write,test source={
  ... codigo do action processor ...
}

/system script remove [find name="navspot-guardian"]
/system script add name="navspot-guardian" policy=read,write,test source={
  ... codigo do guardian ...
}

:log info "NAVSPOT v7.1: Scripts instalados com sucesso"
`
```

### 2. Bootstrap Ultra-Minimo v7.1

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Mudancas principais:
- VERSION: 7.0.0 -> 7.1.0
- Remover `syncScriptSource`, `actionProcessorSource`, `guardianScriptSource` do bootstrap
- Adicionar bloco de fetch + import:

```routeros
# DOWNLOAD E INSTALACAO DOS SCRIPTS (substitui ~300 linhas de source={})
:log info "NAVSPOT v7.1: Baixando scripts da API..."
:local scriptsUrl "${scriptsApiUrl}?type=all&token=${token}"
/tool fetch url=$scriptsUrl check-certificate=no dst-path="ns-install.rsc"
:delay 3s
/import ns-install.rsc
:do { /file remove "ns-install.rsc" } on-error={}
:log info "NAVSPOT v7.1: Scripts instalados"
```

- DNS: Usar 8.8.8.8 e 1.1.1.1 (redundancia conforme recomendacao)
- Delay: Manter 3s entre fetch e import

### 3. Recovery v7.1

**Arquivo:** `supabase/functions/mikrotik-recovery-download/index.ts`

Mesmo padrao - usar fetch para baixar scripts ao inves de embutir.

### 4. Config

**Arquivo:** `supabase/config.toml`

Adicionar:
```toml
[functions.mikrotik-scripts]
verify_jwt = false
```

## Fluxo de Instalacao v7.1

```text
1. Tecnico executa: /import navspot-bootstrap-v7.1.0.rsc
   - Configura infra (DNS, WAN, Bridge, DHCP, NAT, Hotspot VAZIO)
   - Salva token
   - Faz /tool fetch -> baixa ns-install.rsc
   - Executa /import ns-install.rsc -> instala os 3 scripts
   - Cria schedulers
   - Executa primeiro sync

2. Primeiro sync
   - navspot-sync (agora instalado) executa
   - API detecta initial_config_sent=false
   - Injeta configure_hotspot_profile + walled-garden
   - Hotspot fica 100% configurado

3. Sistema operacional
   - Syncs periodicos a cada 5min
   - Guardian verifica integridade a cada 10min
```

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| **NOVO** `supabase/functions/mikrotik-scripts/index.ts` | Nova edge function (retorna scripts RSC) |
| `supabase/config.toml` | Adicionar `[functions.mikrotik-scripts]` |
| `supabase/functions/mikrotik-script-generator/index.ts` | VERSION 7.1.0, remover scripts embutidos, adicionar fetch |
| `supabase/functions/mikrotik-recovery-download/index.ts` | Mesmo padrao - fetch ao inves de embutir |
| `src/components/modals/ScriptModal.tsx` | scriptVersion 7.1.0 |

## Checklist de Implementacao

| # | Item | Detalhes |
|---|------|----------|
| 1 | Content-Type | `text/plain` na mikrotik-scripts |
| 2 | check-certificate=no | Em todos os /tool fetch |
| 3 | DNS redundante | 8.8.8.8 e 1.1.1.1 |
| 4 | Delay pos-fetch | 3 segundos |
| 5 | Token na URL | Token embutido na URL do fetch (arquivo ainda nao existe) |
| 6 | Validar token | Edge function valida antes de retornar scripts |
| 7 | Sem source={} longo | Zero scripts embutidos no bootstrap |

## Estrutura da Edge Function mikrotik-scripts

```typescript
// GET ?type=all&token=XXX
// - Valida token no banco
// - Busca hotspot e embarcacao
// - Gera scripts com variaveis do hotspot (syncUrl, recoveryUrl, token)
// - Retorna RSC puro como text/plain

// Resposta para type=all:
`# NAVSPOT Scripts Installer v7.1.0
# Este arquivo instala todos os scripts necessarios

# 1. ACTION PROCESSOR
/system script remove [find name="navspot-action-processor"]
/system script add name="navspot-action-processor" policy=read,write,test source={
... actionProcessorSource completo ...
}

# 2. SYNC
/system script remove [find name="navspot-sync"]
/system script add name="navspot-sync" policy=read,write,test source={
... syncScriptSource completo ...
}

# 3. GUARDIAN
/system script remove [find name="navspot-guardian"]
/system script add name="navspot-guardian" policy=read,write,test source={
... guardianScriptSource completo ...
}

:log info "NAVSPOT v7.1.0: Todos os scripts instalados com sucesso"
`
```

## Por que isso funciona

1. **Bootstrap sem scripts embutidos** - Apenas comandos curtos e simples
2. **Fetch e import separados** - MikroTik processa um arquivo RSC de cada vez
3. **Scripts RSC separados** - O `/import ns-install.rsc` processa os scripts DEPOIS do bootstrap
4. **Sem limite de linha** - O arquivo baixado nao passa pelo parser do `/import` original
5. **Atualizacao facil** - Mudar script na API atualiza todos os routers no proximo sync/guardian

