
# Fix Definitivo: Quebrando o Loop de Sync

## Diagnostico Final

Identifiquei **3 problemas interligados** que impedem qualquer acao de chegar ao roteador:

### Problema 1: `configure_hotspot_profile` nao existe no roteador
O sync script no MikroTik (template `sync-standalone` v7.8.4) tem handlers para: `create_user`, `create_profile`, `remove_user`, `disable_user`, `enable_user`, `update_user`, `update_password`, `kick_session`, `block_quota`, `unblock_quota`.

**NAO tem handler para `configure_hotspot_profile`**. Quando o backend envia essa acao, o roteador nao a reconhece e conta como 0 aplicadas.

### Problema 2: Force Repair injeta acoes invalidas a cada 3 syncs
A telemetria sempre reporta `login_by=""` (vazio), o que e considerado "nao confiavel". Apos 3 falhas consecutivas, o force repair injeta `configure_hotspot_profile` + `create_whitelist_domain`. O roteador ignora a primeira (sem handler), e a segunda e duplicata. Resultado: pipe ocupado com lixo.

### Problema 3: Cache `synced_profiles` repopula instantaneamente
Quando limpamos o cache, na mesma rodada de sync o codigo na linha 1564-1570 re-adiciona o perfil ao cache ANTES do roteador confirmar que recebeu. Se o roteador tiver "Falha no fetch", o perfil nunca e criado mas o cache diz que sim.

### Sequencia do loop atual
```text
Sync 1: telemetry_failures = 1 (login_by vazio) -> 0 acoes
Sync 2: telemetry_failures = 2 -> 0 acoes
Sync 3: telemetry_failures = 3 -> FORCE REPAIR -> injeta configure_hotspot_profile (roteador ignora) -> reset para 0
Sync 4: telemetry_failures = 1 -> 0 acoes
... (repete infinitamente)
```

## Correcao (3 partes)

### Parte 1: Adicionar handler `configure_hotspot_profile` ao sync template

Atualizar o template `sync-standalone` na tabela `script_templates` para incluir o handler que configura o hotspot profile no MikroTik. Isso permite que a acao de force repair seja realmente aplicada, corrigindo a telemetria e quebrando o loop.

O handler vai:
- Extrair `login_url` e `dns_name` do pipe
- Aplicar no hotspot profile (`hsprof-navspot`)
- Configurar `login-by`, `http-cookie-lifetime` e `login-url`

### Parte 2: Modificar reconciliacao de perfis no edge function

Na funcao `mikrotik-sync`, linha 1527-1533: quando o roteador NAO envia `registered_profiles_csv` (script antigo), **nao confiar no cache**. Em vez de pular o perfil, sempre injetar a acao de criacao (idempotente - o handler no roteador faz remove+add).

**Antes (linha 1530):**
```typescript
if (syncedProfiles.includes(slug)) {
  console.log(`Profile in cache (no MikroTik data), skipping: ${slug}`)
  return null
}
```

**Depois:**
```typescript
// v7.8.7: Without MikroTik confirmation, always re-inject (idempotent)
console.log(`[mikrotik-sync] v7.8.7: No MikroTik profile data, always injecting: ${slug}`)
```

Isso garante que o perfil sera re-injetado em CADA sync ate que o roteador passe a enviar `registered_profiles_csv`, confirmando que o perfil existe.

### Parte 3: SQL - Corrigir estado do hotspot

```sql
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb,
    portal_profile_version = '7.1.50-http-pap',
    telemetry_failures = 0,
    last_force_repair_at = NOW()
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

E inserir as acoes de perfil + usuario como pendentes (para o proximo sync antes da reconciliacao rodar):

```sql
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status) VALUES 
  ('27a1e1be-4ba7-4496-adb1-9227d3a80ad1', 'add_user_profile', 
   '{"name":"tripulacao-googlemarine","rate_limit":"3M/3M","shared_users":1,"limit_bytes":0}', 'pendente'),
  ('27a1e1be-4ba7-4496-adb1-9227d3a80ad1', 'create_user', 
   '{"user":"alexandre.silva","password":"048706","profile":"tripulacao-googlemarine"}', 'pendente');
```

## Resultado esperado

1. O handler `configure_hotspot_profile` passa a funcionar no roteador, corrigindo a telemetria (`login_by` passa a reportar valores corretos)
2. A reconciliacao de perfis deixa de confiar no cache e sempre envia o perfil como upsert
3. Mesmo que o roteador tenha "Falha no fetch" em uma rodada, o proximo sync re-envia o perfil
4. O usuario `alexandre.silva` pode fazer login

## Arquivos modificados

| Tipo | Arquivo/Local | Mudanca |
|------|--------------|---------|
| SQL (script_templates) | sync-standalone | Adicionar handler `configure_hotspot_profile` |
| Edge Function | mikrotik-sync linhas 1527-1533 | Remover cache check, sempre injetar perfis |
| SQL | hotspots | Reset synced_profiles, portal_profile_version, cooldown |
| SQL | acoes_pendentes | Inserir 2 acoes (perfil + usuario) |
