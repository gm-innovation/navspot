

# Fix: Adicionar `block_quota` e `unblock_quota` ao CHECK constraint

## Problema

A tabela `acoes_pendentes` tem uma constraint `acoes_pendentes_tipo_check` que lista explicitamente os tipos permitidos. Os tipos `block_quota` e `unblock_quota` nao estao na lista, causando falha silenciosa ao inserir as acoes de desbloqueio.

O erro ja aparecia nos logs do console:
```
"new row for relation "acoes_pendentes" violates check constraint "acoes_pendentes_tipo_check""
```

Por isso o MikroTik mostra "Aplicado 0 acoes" -- as acoes nunca foram gravadas no banco.

## Correcao

Executar uma migracao SQL para atualizar a constraint:

```sql
ALTER TABLE acoes_pendentes DROP CONSTRAINT acoes_pendentes_tipo_check;

ALTER TABLE acoes_pendentes ADD CONSTRAINT acoes_pendentes_tipo_check
CHECK (tipo = ANY (ARRAY[
  'create_user','remove_user','delete_user','disable_user','enable_user',
  'update_password','kick_session',
  'create_profile','update_profile','update_profile_config',
  'update_user_profile','add_user_profile','remove_user_profile','update_profile_quota',
  'add_walled_garden','remove_walled_garden',
  'add_whitelist_domain','remove_whitelist_domain',
  'add_blacklist_domain','remove_blacklist_domain',
  'create_whitelist_domain','create_blacklist_domain',
  'add_firewall_filter','remove_firewall_filter',
  'add_firewall_block','remove_firewall_block','add_firewall_allow',
  'block_device','unblock_device','kick_device',
  'configure_hotspot_profile',
  'block_quota','unblock_quota'
]));
```

## Apos a migracao

Basta salvar o perfil novamente. Dessa vez as acoes `unblock_quota` e `enable_user` serao inseridas com sucesso, e o proximo sync do roteador aplicara o desbloqueio.

## Arquivo alterado

Nenhum arquivo de codigo precisa mudar -- a logica ja esta correta. Apenas o constraint do banco precisa ser atualizado.

| Alteracao | Detalhe |
|-----------|---------|
| Migracao SQL | Adicionar `block_quota` e `unblock_quota` ao CHECK constraint da tabela `acoes_pendentes` |
