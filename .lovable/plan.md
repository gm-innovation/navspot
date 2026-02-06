

# Plano: Migration Automática com Refinamentos de Resiliência

## Diagnóstico Atual

### Hotspots Conflitantes Encontrados
| ID | Nome | Rede Atual | Status |
|----|------|------------|--------|
| 27a1e1be... | Engenharia Googlemarine | 192.168.88.0 | CONFLITANTE |

### Colunas a Adicionar
- `rede_prev` (text) - para auditoria/rollback
- `migration_state` (text) - para tracking

### Default a Corrigir
- `rede` tem default `'192.168.88.0/24'` - precisa mudar para `'10.10.10.0/24'`

---

## Migration SQL Refinada

A migration incluirá os refinamentos sugeridos:

1. **trim()** no WHERE para cobrir espaços acidentais
2. **Alterar o DEFAULT** da coluna `rede` para `'10.10.10.0/24'`
3. **CHECK CONSTRAINT** aplicada após o UPDATE garantir dados limpos
4. **Tratamento de variações** como `192.168.88.1/24`, `192.168.88.0`, etc.

### Arquivo: supabase/migrations/[timestamp]_migrate_reserved_networks.sql

```sql
-- ================================================================
-- Migração Automática de Rede Reservada v7.1.40
-- ================================================================
-- Hotspots com 192.168.88.x são migrados para 10.10.10.0/24
-- A rede 192.168.88.0/24 é reservada para gerência MikroTik (Winbox)
-- ================================================================

-- 1. Adicionar colunas de auditoria (se não existirem)
ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS rede_prev text NULL;

ALTER TABLE public.hotspots 
ADD COLUMN IF NOT EXISTS migration_state text DEFAULT 'idle';

-- 2. Migrar hotspots com rede conflitante
-- Usando trim() para cobrir espaços acidentais
-- Cobre variações: "192.168.88.0", "192.168.88.0/24", "192.168.88.1", etc.
UPDATE public.hotspots  
SET 
  rede_prev = rede,  
  rede = '10.10.10.0/24',  
  migration_state = 'migrated',
  updated_at = now()
WHERE trim(rede) LIKE '192.168.88%'
  AND (migration_state IS NULL OR migration_state = 'idle');

-- 3. Alterar o DEFAULT da coluna rede para a nova rede segura
-- Isso garante que novos hotspots usem 10.10.10.0/24 por padrão
ALTER TABLE public.hotspots 
ALTER COLUMN rede SET DEFAULT '10.10.10.0/24';

-- 4. Adicionar constraint para prevenir futuras inserções com rede reservada
-- Usando trim() na constraint para ser consistente com a migração
ALTER TABLE public.hotspots
DROP CONSTRAINT IF EXISTS hotspots_rede_not_reserved;

ALTER TABLE public.hotspots
ADD CONSTRAINT hotspots_rede_not_reserved 
CHECK (trim(rede) NOT LIKE '192.168.88%');
```

---

## Ordem de Execução (Segura)

```text
1. ALTER TABLE ADD COLUMN rede_prev
   └─ Não falha se já existir (IF NOT EXISTS)

2. ALTER TABLE ADD COLUMN migration_state
   └─ Não falha se já existir (IF NOT EXISTS)

3. UPDATE ... SET rede = '10.10.10.0/24'
   └─ Migra todos os conflitantes
   └─ Usa trim() para cobrir espaços
   └─ Registra valor anterior em rede_prev

4. ALTER COLUMN rede SET DEFAULT
   └─ Muda default para novos registros

5. ADD CONSTRAINT hotspots_rede_not_reserved
   └─ Só executa após UPDATE limpar a tabela
   └─ Se falhar = algum registro ainda viola (edge case)
```

---

## Resultado Esperado

### Antes da Migration
| Hotspot | rede | rede_prev |
|---------|------|-----------|
| Engenharia Googlemarine | 192.168.88.0 | NULL |

### Após a Migration
| Hotspot | rede | rede_prev | migration_state |
|---------|------|-----------|-----------------|
| Engenharia Googlemarine | 10.10.10.0/24 | 192.168.88.0 | migrated |

### Camadas de Proteção Ativas

```text
✅ Camada 1: Database CONSTRAINT (hotspots_rede_not_reserved)
   └─ Bloqueia INSERT/UPDATE com 192.168.88.x

✅ Camada 2: Database DEFAULT
   └─ Novos hotspots usam 10.10.10.0/24 automaticamente

✅ Camada 3: Backend (mikrotik-script-generator)
   └─ Retorna erro 400 se rede bloqueada

✅ Camada 4: Frontend (Forms)
   └─ Toast de erro + bloqueia submit

✅ Camada 5: RouterOS (Bootstrap)
   └─ Aborta se detectar conflito de IP
```

---

## Benefícios dos Refinamentos

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Espaços em branco | Poderia passar | Bloqueado (trim) |
| Default da coluna | 192.168.88.0/24 | 10.10.10.0/24 |
| Auditoria | Nenhuma | rede_prev + migration_state |
| Reincidência | Possível | Bloqueada por CONSTRAINT |

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/[timestamp]_migrate_reserved_networks.sql` | Migration automática completa |

A migration será executada automaticamente no próximo deploy, sem qualquer intervenção manual do usuário.

