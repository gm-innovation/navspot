

# Migração: Adicionar Status pendente_cadastro

## Problema

A constraint `tripulantes_status_check` não permite o valor `pendente_cadastro`, causando erro ao criar novos tripulantes.

## Solução

Executar migração SQL para atualizar a constraint:

```sql
-- Remove a constraint antiga
ALTER TABLE tripulantes DROP CONSTRAINT IF EXISTS tripulantes_status_check;

-- Adiciona a nova constraint com pendente_cadastro
ALTER TABLE tripulantes ADD CONSTRAINT tripulantes_status_check 
CHECK (status = ANY (ARRAY[
  'ativo'::text, 
  'bloqueado'::text, 
  'inativo'::text, 
  'pendente_cadastro'::text
]));
```

## Resultado

| Status | Uso |
|--------|-----|
| `pendente_cadastro` | Tripulante recém-criado, aguardando completar dados |
| `ativo` | Cadastro completo, acesso liberado |
| `bloqueado` | Acesso suspenso |
| `inativo` | Desligado do sistema |

## Ação

Aplicar a migração no banco de dados.

