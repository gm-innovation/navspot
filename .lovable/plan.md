

# Fix v7.6.2: Deploy mt-scripts + Cookie 30min

## Causa Raiz Identificada

A Edge Function `mt-scripts` retorna **404 NOT FOUND**. Ela nunca foi deployada com sucesso no servidor. Isso significa que:

- O bootstrap roda, cria a infraestrutura (bridge, DHCP, hotspot), mas quando chama o **installer** para baixar os scripts...
- O installer tenta fazer fetch de `mt-scripts?type=sync-raw` e `mt-scripts?type=guardian-raw` → **404**
- Resultado: **nenhum script é instalado** no roteador (nem sync, nem guardian)
- Sem sync → sem heartbeat → hotspot "offline" no frontend
- Sem guardian → sem auto-reparo

Evidencias:
- `curl mt-scripts?type=health` → 404
- `curl mikrotik-sync` → 200 (v7.1.62, funcionando)
- `/system script print` no roteador mostra apenas `test-fetch` (nenhum navspot-*)
- `ultima_sincronizacao` parada em 2026-02-11 18:43:27 (ontem)

## Plano de Acao

### 1. Deployar mt-scripts (PRIORIDADE CRITICA)

A funcao `supabase/functions/mt-scripts/index.ts` existe no codigo com VERSION 7.6.1 mas precisa ser efetivamente deployada. Vamos forcar o deploy.

### 2. Alterar cookie lifetime para 30 minutos

No `mikrotik-script-generator/index.ts`, linha 462:
```
Antes: /ip hotspot profile set [find name="hsprof-navspot"] http-cookie-lifetime=3d
Depois: /ip hotspot profile set [find name="hsprof-navspot"] http-cookie-lifetime=30m
```

### 3. Bump para v7.6.2

- `mt-scripts/index.ts`: VERSION "7.6.1" -> "7.6.2"
- `mikrotik-script-generator/index.ts`: VERSION "7.6.1" -> "7.6.2"

### 4. SQL: Reset flags do hotspot

Para forcar o backend a reinjetar a configuracao do portal no proximo sync:

```sql
UPDATE hotspots 
SET initial_config_sent = false, 
    portal_profile_version = null,
    telemetry_failures = 0
WHERE sync_token = 'bba989838d50d36a5fd0d8f0ac45b11bec0020fe8be395789691d4c002f0ad0e';
```

### 5. Deploy e verificacao

1. Deploy `mt-scripts` e `mikrotik-script-generator`
2. Executar SQL migration
3. Testar: `curl mt-scripts?type=health` → deve retornar 200 com v7.6.2
4. No MikroTik: `/import navspot-bootstrap-v7.6.2.rsc`
5. Aguardar 2 minutos
6. Verificar: `/system script print` → deve mostrar navspot-sync e navspot-guardian
7. Verificar: `/log print where message~"NAVSPOT-SYNC"` → deve mostrar sync com sucesso
8. Frontend: hotspot deve mudar para "Online"
9. Testar cookie: desconectar WiFi, reconectar apos 30+ min → deve pedir login

## Resumo

| Item | Mudanca |
|------|---------|
| `mt-scripts/index.ts` | VERSION 7.6.2, forcar deploy |
| `mikrotik-script-generator/index.ts` | VERSION 7.6.2, cookie-lifetime=30m |
| SQL hotspots | Reset initial_config_sent, portal_profile_version, telemetry_failures |

