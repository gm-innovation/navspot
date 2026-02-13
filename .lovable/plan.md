

# Fix: Inserir ações de desbloqueio manualmente no MikroTik

## Problema

O tripulante Alexandre Silva foi marcado como `ativo` no banco de dados, mas as acoes de desbloqueio no MikroTik (`unblock_quota` e `enable_user`) nunca foram criadas porque o CHECK constraint do banco as rejeitou na epoca. Agora o constraint ja foi corrigido, mas como o tripulante ja esta `ativo`, o codigo de auto-unblock nao o encontra mais.

Resultado: o banco diz "ativo", mas o MikroTik ainda tem ip-binding (blocked) e firewall filter (reject) ativos, impedindo o acesso a internet.

## Correcao

Executar uma migracao SQL que insere diretamente as acoes pendentes necessarias para o hotspot `27a1e1be-4ba7-4496-adb1-9227d3a80ad1`:

```sql
-- Desbloquear dispositivo 1 (04:BF:1B:6E:9F:E9)
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'unblock_quota',
  '{"mac": "04:BF:1B:6E:9F:E9"}'::jsonb,
  'pendente'
);

-- Desbloquear dispositivo 2 (12:8E:E9:84:F8:5B)
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'unblock_quota',
  '{"mac": "12:8E:E9:84:F8:5B"}'::jsonb,
  'pendente'
);

-- Reativar usuario no hotspot
INSERT INTO acoes_pendentes (hotspot_id, tipo, payload, status)
VALUES (
  '27a1e1be-4ba7-4496-adb1-9227d3a80ad1',
  'enable_user',
  '{"user": "alexandre.silva"}'::jsonb,
  'pendente'
);
```

## Resultado esperado

No proximo sync do roteador (a cada ~5 minutos), o MikroTik processara essas 3 acoes:
1. Remove ip-binding com comentario QUOTA_EXCEDIDA para o MAC 04:BF:1B:6E:9F:E9
2. Remove ip-binding com comentario QUOTA_EXCEDIDA para o MAC 12:8E:E9:84:F8:5B
3. Remove firewall filter com comentario BLOCK_QUOTA
4. Reativa o usuario `alexandre.silva` no hotspot

Apos isso, o celular conseguira acessar a internet normalmente.

## Alteracoes

| Tipo | Detalhe |
|------|---------|
| Migracao SQL | Inserir 3 acoes pendentes (2x unblock_quota + 1x enable_user) |
