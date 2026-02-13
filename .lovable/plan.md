

# Fix: Perfil perdido + Deadlock Recovery bloqueando sync

## Diagnostico

Os logs do MikroTik confirmam:
- 13:17:26 — "Aplicado 0 acoes" (780 bytes recebidos)
- 13:18:26 — "Falha no fetch" (1206 bytes recebidos — eram as acoes de perfil + usuario)
- 13:19:26 — "Aplicado 0 acoes" novamente

O backend marcou `add_user_profile` e `create_user` como "executado" as 16:18:29 UTC, mas o roteador nunca as aplicou.

Dois problemas bloqueantes:
1. `synced_profiles` contem `["tripulacao-googlemarine"]` — reconciliacao pula o perfil
2. `portal_profile_version = null` — injeta 9 acoes de deadlock recovery a cada sync, ocupando o pipe com walled garden que ja existe no roteador

## Correcao

### 1. SQL: Corrigir estado do hotspot + re-inserir acoes

```sql
-- 1. Limpar cache de perfis para forcar re-provisionamento
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb,
    portal_profile_version = '7.1.50-http-pap',
    telemetry_failures = 0
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- 2. Re-inserir acao de criacao de perfil
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'add_user_profile',
  '{"name": "tripulacao-googlemarine", "rate_limit": "3M/3M", "shared_users": 1, "limit_bytes": 0}'::jsonb,
  'pendente'
);

-- 3. Re-inserir acao de criacao de usuario
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'create_user',
  '{"user": "alexandre.silva", "password": "048706", "profile": "tripulacao-googlemarine"}'::jsonb,
  'pendente'
);
```

**O que cada correcao faz:**
- `synced_profiles = []` — forca a reconciliacao a detectar o perfil como ausente
- `portal_profile_version = '7.1.50-http-pap'` — para a injecao de 9 acoes de deadlock recovery a cada sync, liberando o pipe para as acoes reais
- `telemetry_failures = 0` — reseta o contador para evitar triggers de force-repair
- Novas acoes `add_user_profile` + `create_user` — re-provisiona perfil e usuario

### 2. Nenhuma alteracao de codigo necessaria

A Edge Function ja tem o handler `create_profile` (alias para `add_user_profile`) implementado na correcao anterior. O problema era exclusivamente de estado no banco de dados e timing de rede.

## Resultado esperado

No proximo sync (~30s):
1. Sem deadlock recovery (portal_profile_version ja esta setada)
2. Perfil `tripulacao-googlemarine` enviado como acao real no pipe
3. Usuario `alexandre.silva` re-criado com perfil correto
4. Login passa a funcionar

## Risco

Se o roteador tiver outra "Falha no fetch", as acoes serao perdidas novamente. Uma melhoria futura seria implementar confirmacao de execucao pelo roteador (ACK) em vez de marcar como executado no momento do envio.

