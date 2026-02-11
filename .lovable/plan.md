

# Templates RouterOS no Banco + Edge Function Leve (mt-scripts)

## Visao Geral

Mover os 3 templates RouterOS (sync, guardian, installer) para a tabela `script_templates` no banco de dados, reescrever `mt-scripts/index.ts` com ~80 linhas (sem template strings), e atualizar todas as 4 referencias de `mikrotik-scripts` para `mt-scripts`.

## Ordem de Execucao

### Passo 1: Migration SQL - Criar tabela + Inserir templates

Criar tabela `script_templates` e popular com os 3 templates usando Dollar Quoting (`$ts$...$ts$`) para evitar problemas de escape.

```sql
CREATE TABLE public.script_templates (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '7.4.5',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.script_templates ENABLE ROW LEVEL SECURITY;

-- RLS: bloqueia acesso publico (edge functions usam service_role que bypassa RLS)
CREATE POLICY "service_role_only" ON public.script_templates
  FOR ALL USING (false);

-- INSERT dos 3 templates com Dollar Quoting
INSERT INTO public.script_templates (id, content, version) VALUES
('sync', $ts$:log info "NAVSPOT-SYNC v{{VERSION}}"
:global navspotSyncLock
... (conteudo identico ao generateSyncSource atual, trocando ${VERSION} por {{VERSION}}, ${syncToken} por {{SYNC_TOKEN}}, ${syncUrl} por {{SYNC_URL}})
:log info "NAVSPOT-SYNC v{{VERSION}}: OK"$ts$, '7.4.5'),

('guardian', $ts$:log info "NAVSPOT-GUARDIAN v{{VERSION}}"
... (conteudo identico ao generateGuardianSource, com placeholders)
$ts$, '7.4.5'),

('installer', $ts$# =========================================
# NAVSPOT Scripts Installer v{{VERSION}}
... (conteudo identico ao generateAllScripts, com placeholders)
$ts$, '7.4.5');
```

**Placeholders usados nos templates:**

| Placeholder | Substituido por | Usado em |
|-------------|----------------|----------|
| `{{VERSION}}` | `7.4.5` | sync, guardian, installer |
| `{{SYNC_TOKEN}}` | token do hotspot | sync, guardian, installer |
| `{{SYNC_URL}}` | URL do mikrotik-sync | sync |
| `{{RECOVERY_URL}}` | URL do recovery | guardian |
| `{{API_BASE}}` | URL base das functions | installer |
| `{{DEPLOYED_AT}}` | timestamp ISO | installer |
| `{{ROS_VERSION}}` | versao do RouterOS | installer |
| `{{SYNC_INTERVAL}}` | minutos entre syncs | installer |
| `{{FETCH_DELAY}}` | delay em ms | installer |
| `{{WRITE_DELAY}}` | delay em ms | installer |
| `{{MAX_RETRIES}}` | numero de retries | installer |

### Passo 2: Reescrever `mt-scripts/index.ts` (~80 linhas)

O handler HTTP busca o template do banco e faz `.replace()` dos placeholders:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSION = "7.4.5"
const DEPLOYED_AT = new Date().toISOString()
const corsHeaders = { ... }
const ROS_CONFIGS = { ... }

Deno.serve(async (req) => {
  // CORS, health endpoint (igual ao atual)
  // Validar token, buscar hotspot (igual ao atual)
  
  // Mapear type para template id
  const templateId = scriptType === 'sync-raw' ? 'sync'
    : scriptType === 'guardian-raw' ? 'guardian' : 'installer'
  
  // Buscar template do banco
  const { data: tpl, error: tplError } = await supabase
    .from('script_templates')
    .select('content')
    .eq('id', templateId)
    .single()
  
  if (tplError || !tpl) {
    return new Response('# Error: Template not found', { status: 500 })
  }
  
  // Substituir placeholders (com fallback para "" se undefined)
  const script = tpl.content
    .replace(/\{\{VERSION\}\}/g, VERSION)
    .replace(/\{\{SYNC_TOKEN\}\}/g, syncToken || '')
    .replace(/\{\{SYNC_URL\}\}/g, syncUrl || '')
    .replace(/\{\{RECOVERY_URL\}\}/g, recoveryUrl || '')
    .replace(/\{\{API_BASE\}\}/g, apiBase || '')
    .replace(/\{\{DEPLOYED_AT\}\}/g, DEPLOYED_AT)
    .replace(/\{\{ROS_VERSION\}\}/g, effRos || '')
    .replace(/\{\{SYNC_INTERVAL\}\}/g, String(syncMin))
    .replace(/\{\{FETCH_DELAY\}\}/g, String(rosConfig.delayAfterFetch))
    .replace(/\{\{WRITE_DELAY\}\}/g, String(rosConfig.delayAfterFileWrite))
    .replace(/\{\{MAX_RETRIES\}\}/g, String(rosConfig.contentRetryCount))
  
  return new Response(script, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Length': String(new TextEncoder().encode(script).length),
    }
  })
})
```

Zero template strings RouterOS no TypeScript. Bundler nao tera problemas.

### Passo 3: Deploy e teste de bancada

1. Deletar edge function `mt-scripts` (limpar estado)
2. Redeployar `mt-scripts`
3. Testar com curl:
   - `GET /mt-scripts?type=health` --> 200 + version 7.4.5
   - `GET /mt-scripts?type=sync-raw&token=TOKEN_REAL` --> 200 + script com `$un`, `$pw` literais

### Passo 4: Atualizar referencias no frontend e backend

**4 locais precisam trocar `mikrotik-scripts` para `mt-scripts`:**

1. **`src/components/modals/ScriptModal.tsx`** (linhas 213 e 220):
   - Trocar `mikrotik-scripts?type=all&token=` por `mt-scripts?type=all&token=`

2. **`supabase/functions/mikrotik-script-generator/index.ts`** (linha 281):
   - Trocar `${supabaseUrl}/functions/v1/mikrotik-scripts` por `${supabaseUrl}/functions/v1/mt-scripts`

3. **`supabase/functions/mikrotik-recovery-download/index.ts`** (linha 167):
   - Trocar `${supabaseUrl}/functions/v1/mikrotik-scripts` por `${supabaseUrl}/functions/v1/mt-scripts`

4. Redeployar `mikrotik-script-generator` e `mikrotik-recovery-download` apos as mudancas.

### Passo 5: Limpeza

- Remover pasta `supabase/functions/mikrotik-scripts/` (se ainda existir)
- Remover entrada `[functions.mikrotik-scripts]` do config.toml (auto-gerenciado)

## Protecoes contra undefined/null

Cada `.replace()` usa `|| ''` como fallback:
```typescript
.replace(/\{\{SYNC_TOKEN\}\}/g, syncToken || '')
```

Isso garante que nenhum placeholder vire a string `"undefined"` no script final.

## O que NAO muda

- Logica de negocio dos scripts RouterOS (identica)
- Handlers v7.4.5 (create_user 3 campos, create_profile 3 campos)
- Variaveis RouterOS ($un, $pw, $pr, $rest) - ficam como texto puro no banco
- mikrotik-sync, mikrotik-recovery-download (so muda a URL referenciada)
- mikrotik-script-generator (so muda a URL referenciada)
- Nenhuma tabela existente, RLS ou frontend afetado (exceto ScriptModal)

## Vantagem futura

Atualizar templates RouterOS passa a ser um simples `UPDATE script_templates SET content = ... WHERE id = 'sync'` -- sem precisar redeployar a edge function.

