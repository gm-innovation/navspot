

# Refatoracao do mikrotik-scripts: Split Modular + Health Endpoint

## Problema

O arquivo `supabase/functions/mikrotik-scripts/index.ts` tem 500 linhas com template strings RouterOS complexas. O bundler Deno da Lovable Cloud excede o timeout de 60s, resultando em 404 persistente (funcao registrada mas nao roteavel).

## Solucao

Dividir em 4 arquivos menores + adicionar endpoint `health` para diagnostico rapido.

```text
supabase/functions/mikrotik-scripts/
  constants.ts      (~10 linhas)  - VERSION, DEPLOYED_AT, ROSConfig, corsHeaders
  sync-source.ts    (~100 linhas) - generateSyncSource()
  installer.ts      (~210 linhas) - generateAllScripts() + generateGuardianSource()
  index.ts          (~90 linhas)  - Handler HTTP + roteamento + health
```

## Detalhes tecnicos

### Arquivo 1: `constants.ts` (NOVO - ~10 linhas)

Exporta constantes compartilhadas para evitar dessincronizacao de VERSION:

```typescript
export const VERSION = "7.4.5"
export const DEPLOYED_AT = new Date().toISOString()

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export interface ROSConfig {
  delayAfterFetch: number
  delayAfterFileWrite: number
  contentRetryCount: number
  flashSyncDelay: number
}

export const ROS_CONFIGS: Record<string, ROSConfig> = {
  '6': { delayAfterFetch: 2500, delayAfterFileWrite: 1500, contentRetryCount: 3, flashSyncDelay: 700 },
  '7': { delayAfterFetch: 500, delayAfterFileWrite: 300, contentRetryCount: 1, flashSyncDelay: 200 },
}
```

### Arquivo 2: `sync-source.ts` (NOVO - ~100 linhas)

Move `generateSyncSource()` (linhas 363-458 atuais) para arquivo separado:

```typescript
import { VERSION } from './constants.ts'

export function generateSyncSource(syncUrl: string, syncToken: string): string {
  // ... conteudo atual identico, usando VERSION importada
}
```

### Arquivo 3: `installer.ts` (NOVO - ~210 linhas)

Move `generateAllScripts()` (linhas 153-352) e `generateGuardianSource()` (linhas 464-500):

```typescript
import { VERSION, DEPLOYED_AT, type ROSConfig } from './constants.ts'

export function generateAllScripts(...): string { /* conteudo atual */ }
export function generateGuardianSource(...): string { /* conteudo atual */ }
```

### Arquivo 4: `index.ts` (REESCRITO - ~90 linhas)

Fica apenas com handler HTTP, roteamento e o novo endpoint health:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'
import { VERSION, corsHeaders, ROS_CONFIGS } from './constants.ts'
import { generateSyncSource } from './sync-source.ts'
import { generateAllScripts, generateGuardianSource } from './installer.ts'

// maskToken + getROSConfig helpers (~10 linhas)
// Deno.serve handler (~70 linhas)
//   - case 'health': retorna { version, status: "ok", deployed_at }
//   - case 'sync-raw' / 'guardian-raw' / 'all': logica atual
```

**Health endpoint** (novo case no switch):

```typescript
case 'health':
  return new Response(
    JSON.stringify({ version: VERSION, status: "ok", deployed_at: DEPLOYED_AT }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
```

Permite testar roteabilidade sem precisar de token valido:
`GET /mikrotik-scripts?type=health`

### Arquivo 5: `mikrotik-script-generator/index.ts` (EDIT)

Trocar import na linha 1:
- De: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`
- Para: `import { createClient } from 'npm:@supabase/supabase-js@2'`

### Deploy

1. Criar os 3 novos arquivos (constants.ts, sync-source.ts, installer.ts)
2. Reescrever index.ts (~90 linhas)
3. Corrigir import do mikrotik-script-generator
4. Deletar edge function `mikrotik-scripts` (limpar estado fantasma)
5. Redeployar `mikrotik-scripts` e `mikrotik-script-generator`
6. Testar com curl:
   - `GET /mikrotik-scripts?type=health` -- esperar 200 + JSON com version 7.4.5
   - `GET /mikrotik-scripts?type=sync-raw&token=TOKEN` -- esperar 200 + script com `$un`, `$pw`, `$pr` literais
   - `GET /mikrotik-scripts?type=guardian-raw&token=TOKEN` -- esperar 200

### Contagem de linhas por arquivo

| Arquivo | Linhas | Conteudo |
|---------|--------|----------|
| constants.ts | ~20 | VERSION, DEPLOYED_AT, corsHeaders, ROSConfig, ROS_CONFIGS |
| sync-source.ts | ~100 | generateSyncSource() |
| installer.ts | ~210 | generateAllScripts() + generateGuardianSource() |
| index.ts | ~90 | Handler HTTP + health + roteamento |
| **Total** | ~420 | Mesmo que antes, mas nenhum arquivo ultrapassa 210 linhas |

### O que NAO muda

- Nenhuma logica de negocio dos scripts RouterOS
- Handlers v7.4.5 (create_user 3 campos, create_profile 3 campos) intactos
- Variaveis RouterOS ($un, $pw, $pr, $rest) sem chaves -- seguras em template literals
- Nenhuma tabela, RLS ou frontend
- mikrotik-sync, mikrotik-recovery-download e demais edge functions inalteradas

### Riscos e mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Imports relativos nao resolverem | Deno suporta nativamente `./arquivo.ts` em edge functions |
| Bundler ainda falhar com installer.ts (210 linhas) | Dividir em allScripts.ts + guardian.ts se necessario |
| VERSION dessincronizada | Centralizada em constants.ts -- fonte unica |

