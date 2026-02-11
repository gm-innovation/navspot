

# Fix: Trocar import esm.sh por npm: no mikrotik-scripts

## Problema

A edge function `mikrotik-scripts` retorna 404 persistente. O bundler Deno falha silenciosamente ao resolver `https://esm.sh/@supabase/supabase-js@2`, impedindo o registro da funcao.

## Mudanca

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

**Linha 1** - Trocar:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
```
Por:
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'
```

Nenhuma outra mudanca no arquivo. Os handlers v7.4.5 (create_user, create_profile com 3 campos) ja estao corretos.

## Deploy

1. Aplicar a mudanca no import
2. Deletar edge function `mikrotik-scripts`
3. Redeployar `mikrotik-scripts`
4. Testar com curl GET `/mikrotik-scripts?type=sync-raw&token=...` para confirmar 200 OK e v7.4.5

