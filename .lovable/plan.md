

# Plano: Criar `navspot-script-gen` com melhorias de robustez

## Resumo

Criar a funcao `navspot-script-gen` como copia melhorada do `mikrotik-script-generator` atual, com todas as recomendacoes de seguranca, retry, validacao e logging aplicadas. Converter `mikrotik-script-generator` em proxy transparente. Atualizar 3 arquivos do frontend para apontar para o novo nome.

## Arquivos a criar/alterar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/navspot-script-gen/index.ts` | **CRIAR** (~170 linhas) |
| `supabase/functions/mikrotik-script-generator/index.ts` | **REESCREVER** como proxy (~15 linhas) |
| `supabase/config.toml` | Adicionar `[functions.navspot-script-gen]` |
| `src/hooks/useHotspots.ts` | Trocar invoke para `navspot-script-gen` |
| `src/services/mikrotikService.ts` | Trocar invoke para `navspot-script-gen` |
| `src/hooks/useModularScripts.ts` | Trocar URL para `navspot-script-gen` |

## Detalhes tecnicos

### 1. `navspot-script-gen` — Melhorias sobre o codigo atual

**Retry com backoff** para fetches criticos (template, upload, sign):
```text
async function withRetry(fn, label, maxRetries=2) {
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() }
    catch (e) {
      if (i === maxRetries) throw e
      await new Promise(r => setTimeout(r, 500 * (i+1)))
      console.warn('[retry ' + label + '] attempt ' + (i+1))
    }
  }
}
```

**Validacoes extras** antes de gerar:
- `hotspot.sync_token` presente e nao vazio
- `hotspot.rede` em formato CIDR valido (regex simples)
- Tamanho do script renderizado nao excede 64KB (seguranca do router)

**Logging estruturado**:
- `generate:start` com hotspot_id
- `template:fetch` por template
- `upload:ok` por arquivo
- `sign:ok` por arquivo
- `db:update` apos sucesso total
- Token truncado (4 chars) nos logs

**Idempotencia**: update do hotspot (scripts_version, scripts_storage_path) somente apos upload + signed URLs terem sucesso. Se falhar apos upload, limpar arquivos parciais do storage.

**Seguranca**:
- PostgREST e Storage sempre com SERVICE_ROLE_KEY
- Template IDs validados contra enum conhecido (infra, sync, guardian, etc.)
- Token de usuario nunca logado inteiro

**Signed URL path fix**: O endpoint correto para assinar URLs individuais e `POST /storage/v1/object/sign/{bucket}/{path}` com body `{ expiresIn: 900 }`.

### 2. `mikrotik-script-generator` — Proxy transparente

```text
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const newUrl = req.url.replace('mikrotik-script-generator', 'navspot-script-gen')
  const forwarded = await fetch(newUrl, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  })
  return new Response(forwarded.body, {
    status: forwarded.status,
    headers: forwarded.headers,
  })
})
```

Preserva metodo, headers (Authorization), body. Retorna response transparentemente sem 3xx redirect.

### 3. Frontend (3 arquivos)

Substituicao simples de string:
- `'mikrotik-script-generator'` -> `'navspot-script-gen'` em `useHotspots.ts` e `mikrotikService.ts`
- URL em `useModularScripts.ts` troca `mikrotik-script-generator` por `navspot-script-gen`

### 4. config.toml

Adiciona:
```text
[functions.navspot-script-gen]
verify_jwt = false
```

## Ordem de execucao

1. Criar `navspot-script-gen/index.ts`
2. Atualizar `config.toml`
3. Deploy de `navspot-script-gen`
4. Testar health check (GET ?mode=health)
5. Atualizar 3 arquivos frontend
6. Converter `mikrotik-script-generator` em proxy
7. Deploy do proxy
8. Testar fluxo completo

## Riscos e mitigacao

| Risco | Mitigacao |
|-------|----------|
| `navspot-script-gen` tambem da 404 no gateway | Nome novo sem historico de falhas; se falhar, testar com nome ainda mais curto |
| Proxy do nome antigo nao funciona (gateway corrompido) | Frontend ja aponta para novo nome; proxy e apenas fallback para routers |
| Retry causa duplicacao de uploads | Storage com upsert=true sobrescreve; idempotente |
| Latencia dos 4 fetches ao render-template | Mantido em paralelo via Promise.all |

