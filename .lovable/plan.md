

# Fix: Perfil preso no cache mas ausente no roteador

## Diagnostico

Os logs do backend confirmam que o sync esta funcionando (a cada 1 min), mas retorna 0 acoes porque:

1. `synced_profiles = ["tripulacao-googlemarine"]` no banco -- cache diz que o perfil ja foi sincronizado
2. O roteador reporta `registered_profiles_csv: ""` (0 perfis) -- o perfil NAO existe no hardware
3. O backend ve o cache e pula: "Profile in cache, skipping: tripulacao-googlemarine"

O perfil foi marcado como "executado" no banco quando foi ENVIADO, mas o roteador crashou ao processar (bug do parser antigo). Agora o template esta corrigido mas o cache impede o reenvio.

## Correcao

### Parte 1: SQL - Limpar cache e reinserir acao

```sql
-- Limpar cache de perfis para forcar reenvio
UPDATE hotspots 
SET synced_profiles = '[]'::jsonb,
    telemetry_failures = 0
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- Inserir acao de criacao de perfil (sera processada no proximo sync)
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status) VALUES 
  ('27a1e1be-4ba7-4496-adb1-9227d3a80ad1', 'add_user_profile', 
   '{"name":"tripulacao-googlemarine","rate_limit":"3M/3M","shared_users":1,"limit_bytes":0}'::jsonb, 'pendente');
```

Nao precisa reinserir `create_user` porque o usuario `alexandre.silva` ja esta confirmado no roteador (logs: "User confirmed in MikroTik: alexandre.silva").

### Parte 2: Nenhuma mudanca de codigo

O template `sync-standalone` ja tem o parser de 4 parametros corrigido (atualizado em 18:08 UTC). O edge function `mikrotik-sync` ja formata corretamente como `create_profile|nome|rate|shared|limit`. Nao ha mudanca de logica necessaria.

## Fluxo esperado apos o fix

1. Proximo sync (em ~1 min): backend ve cache vazio + acao pendente `add_user_profile`
2. Backend envia `create_profile|tripulacao-googlemarine|3M/3M|1|0` no payload
3. Template corrigido parseia corretamente: nome=tripulacao-googlemarine, rate=3M/3M, shared=1
4. Perfil criado no roteador com sucesso
5. Backend atualiza cache `synced_profiles` com o perfil
6. Usuario alexandre.silva (ja registrado) pode logar usando o perfil

## Arquivos modificados

| Tipo | Mudanca |
|------|---------|
| SQL (hotspots) | Limpar synced_profiles cache |
| SQL (acoes_pendentes) | Inserir add_user_profile pendente |

Nenhum arquivo de codigo modificado.

