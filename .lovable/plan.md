
# Fix: create_profile crash no sync-standalone

## Causa Raiz

O edge function envia o pipe `create_profile` com 4 parametros:
```
create_profile|tripulacao-googlemarine|3M/3M|1|0
```

O handler `create_profile` no template `sync-standalone` (linhas 69-77) so faz split no primeiro `|` apos o nome, resultando em:
- nome = `tripulacao-googlemarine`
- rate-limit = `3M/3M|1|0` (INVALIDO - inclui shared_users e limit_bytes)

O comando `/ip hotspot user profile add name=$n rate-limit=3M/3M|1|0 shared-users=1` falha porque `3M/3M|1|0` nao e um rate-limit valido. Como o `add` NAO esta protegido com `:do {} on-error={}`, o erro propaga para o bloco externo on-error que mostra "Falha no fetch (Rede ou Backend)".

Isso matava o processamento de TODAS as acoes daquele sync.

Antes da mudanca v7.8.7, o cache `synced_profiles` impedia que `create_profile` fosse enviado repetidamente. Agora com o "always inject", o crash acontece em CADA sync.

## Correcao (2 opcoes, aplicar ambas)

### Parte 1: Atualizar template sync-standalone

Corrigir o handler `create_profile` para parsear corretamente os 4 parametros E proteger o comando `add`:

```text
Antes:
  :local n [:pick $r 0 $p2]
  :local rt [:pick $r ($p2 + 1) [:len $r]]
  :do { /ip hotspot user profile remove [find name=$n] } on-error={}
  /ip hotspot user profile add name=$n rate-limit=$rt shared-users=1

Depois:
  :local n [:pick $r 0 $p2]
  :local rt [:pick $r ($p2 + 1) [:len $r]]
  :local p3 [:find $rt "|"]
  :local su "1"
  :if ($p3 >= 0) do={
    :set su [:pick $rt ($p3 + 1) [:len $rt]]
    :local p4 [:find $su "|"]
    :if ($p4 >= 0) do={ :set su [:pick $su 0 $p4] }
    :set rt [:pick $rt 0 $p3]
  }
  :do { /ip hotspot user profile remove [find name=$n] } on-error={}
  :do { /ip hotspot user profile add name=$n rate-limit=$rt shared-users=$su } on-error={}
```

Isso extrai corretamente `shared_users=1` e descarta `limit_bytes`, e protege o `add` contra crashes.

### Parte 2: Reverter a mudanca v7.8.7 de "always inject"

A injecao em cada sync e agressiva demais. Reverter para confiar no cache `synced_profiles` MAS com uma protecao: revalidar a cada 10 minutos (em vez de nunca). Porem, como fix imediato, restaurar o cache check:

No edge function `mikrotik-sync`, restaurar linhas 1530-1534 para:

```typescript
if (syncedProfiles.includes(slug)) {
  console.log(`[mikrotik-sync] v7.8.8: Profile in cache, skipping: ${slug}`)
  return null
}
```

Isso para os crashes imediatos. O perfil ja esta no cache, entao nao sera re-enviado. Se precisar re-provisionar, limpar o cache manualmente via SQL.

### Parte 3: SQL - Resetar estado

```sql
UPDATE hotspots 
SET synced_profiles = '["tripulacao-googlemarine"]'::jsonb,
    telemetry_failures = 0,
    last_force_repair_at = NULL
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';

-- Limpar acoes pendentes antigas que vao falhar
DELETE FROM acoes_pendentes 
WHERE hotspot_id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1' 
AND status = 'pendente';
```

Nao inserir novas acoes `create_profile` ate o template ser atualizado no roteador. O usuario `alexandre.silva` ja esta registrado (confirmado nos logs: "registered_users_csv: alexandre.silva").

## Resultado esperado

1. Sem mais crashes - nenhuma acao `create_profile` enviada (cache tem o perfil)
2. Template atualizado para futuras criacao de perfis
3. Sync volta a funcionar normalmente (0 acoes, sem erros)
4. Se o perfil ja existe no roteador E o usuario ja existe, o login deve funcionar imediatamente

## Arquivos modificados

| Tipo | Arquivo | Mudanca |
|------|---------|---------|
| SQL (script_templates) | sync-standalone | Fix parser create_profile (4 params + on-error) |
| Edge Function | mikrotik-sync linhas 1530-1534 | Reverter "always inject" para cache check |
| SQL | hotspots | Restaurar cache com perfil, reset counters |
| SQL | acoes_pendentes | Limpar acoes pendentes que iam crashar |
