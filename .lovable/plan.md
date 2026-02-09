

# Fix v7.1.58e: Corrigir URL do auto-repair e forcar atualizacao do AP

## Problema confirmado

1. **URL com parametro errado** (linha 1443): `?hotspot_id=` em vez de `?h=` -- o portal ignora `hotspot_id` e mostra "Acesso Invalido"
2. **AP desatualizado no roteador**: O action-processor instalado no hardware nao reconhece os comandos atuais (`create_user`, `configure_hotspot_profile`), executando 0 acoes silenciosamente

A migration do v7.1.58d funcionou -- as 6 acoes presas foram marcadas como `executado`.

## Mudancas

### 1. mikrotik-sync/index.ts: Corrigir URL do auto-repair (linha 1443)

Alinhar com as linhas 1047 e 1115 que ja usam `?h=`:

```typescript
// ANTES:
const loginUrl = `https://${portalHost}/hotspot-login?hotspot_id=${hotspot.id}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`

// DEPOIS:
const loginUrl = `https://${portalHost}/hotspot-login?h=${encodeURIComponent(hotspot.id)}&mac=$(mac)&ip=$(ip)&link-login-only=$(link-login-only)`
```

### 2. mikrotik-recovery-download: Resetar portal_profile_version

Adicionar reset de `portal_profile_version` para null alem do `initial_config_sent=false` ja existente. Isso forca o backend a reinjetar `configure_hotspot_profile` com a URL correta apos o recovery:

```typescript
await supabase.from('hotspots')
  .update({ initial_config_sent: false, portal_profile_version: null })
  .eq('id', hotspot.id)
```

### 3. Redeploy de ambas as Edge Functions

- `mikrotik-sync` -- URL corrigida
- `mikrotik-recovery-download` -- reset mais completo

### 4. Acao manual do usuario

O usuario precisa baixar e importar o script de Recovery no roteador. O script de recovery ja baixa o AP mais recente via `mikrotik-scripts?type=all&token=...`, portanto basta reimportar para atualizar o AP.

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/mikrotik-sync/index.ts` | Linha 1443: `hotspot_id` para `h` |
| `supabase/functions/mikrotik-recovery-download/index.ts` | Adicionar `portal_profile_version: null` no update |

## O que NAO muda

- extractFirstJsonObject (v7.1.58c)
- Filtro UUID (v7.1.58d)
- mikrotik-scripts (AP ja e a versao mais recente)
- Portal HotspotLogin.tsx
- hotspot-login edge function

## Resultado esperado

1. Deploy corrige URL do auto-repair para futuros syncs
2. Usuario importa recovery script no roteador
3. Recovery baixa e instala AP atualizado + reseta flags no servidor
4. Proximo sync: initial_config_sent=false dispara configuracao completa com URL correta (`?h=`)
5. AP atualizado processa `create_user` e `configure_hotspot_profile`
6. Tripulante consegue fazer login

## Secao tecnica

O recovery script existente ja faz tudo que precisa:
- Remove scripts antigos (navspot-sync, navspot-action-processor, navspot-guardian)
- Baixa versoes atualizadas via `mikrotik-scripts?type=all`
- Importa via `/import ns-install.rsc`
- Aplica `login-by=cookie,http-pap`
- Executa sync inicial

A unica adição e resetar `portal_profile_version` junto com `initial_config_sent` no servidor, para garantir que o backend reinjete a configuracao completa do portal.
