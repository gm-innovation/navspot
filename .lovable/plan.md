

# Fix: Re-inserir acao de criacao de perfil + reset de cache

## Problema

1. A acao `add_user_profile` foi marcada como `executado` no backend, mas o roteador teve uma falha de rede naquele exato momento ("Falha no fetch" as 13:10). O perfil **nunca foi criado** no MikroTik.
2. O campo `synced_profiles` contem `["tripulacao-googlemarine"]`, fazendo a reconciliacao achar que o perfil ja existe.
3. O campo `portal_profile_version` esta `null`, causando injecao de 9 acoes de deadlock recovery em cada sync (walled garden + configure_hotspot_profile), mas nenhuma acao de perfil.

## Correcao

### 1. SQL: Reset synced_profiles + inserir nova acao

```sql
-- Reset cache para forcar re-sync de perfis
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb 
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- Re-inserir acao de criacao de perfil (a anterior foi perdida no fetch fail)
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'add_user_profile',
  '{"name": "tripulacao-googlemarine", "rate_limit": "3M/3M", "shared_users": 1, "limit_bytes": 0}'::jsonb,
  'pendente'
);

-- Tambem re-criar o usuario com o perfil correto para garantir associacao
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'create_user',
  '{"user": "alexandre.silva", "password": "", "profile": "tripulacao-googlemarine"}'::jsonb,
  'pendente'
);
```

Nota: O `create_user` com password vazio usara a senha existente no MikroTik (handler nao-destrutivo v7.8.2 faz `set` em vez de `remove+add` se o usuario ja existe).

### 2. Verificar senha do tripulante

Precisamos confirmar a senha WiFi do Alexandre Silva para incluir no payload, caso o handler nao-destrutivo nao preserve a senha.

## Resultado esperado

No proximo sync (~1 min):
1. Perfil `tripulacao-googlemarine` e criado no MikroTik (3M/3M, 1 shared user)
2. Usuario `alexandre.silva` e associado ao perfil
3. Login passa a funcionar

## Alteracoes

| Tipo | Detalhe |
|------|---------|
| SQL | Reset `synced_profiles` para `[]` |
| SQL | Inserir 1 acao `add_user_profile` (pendente) |
| SQL | Inserir 1 acao `create_user` para alexandre.silva (pendente) |

