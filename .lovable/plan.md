
# v7.9.15 — Arquitetura `/import` (elimina `set source=`)

## Problema
RouterOS re-serializa o conteúdo ao executar `/system script set source=$var`, convertendo newlines em `\; \n`. O problema não está no banco nem no backend — está na abordagem de injeção via variável.

## Mudança de arquitetura

| v7.9.14 | v7.9.15 |
|---|---|
| fetch body → `set source=$var` | fetch `.rsc` completo → `/import` |
| RouterOS re-serializa → corrupção | RouterOS lê arquivo direto → OK |

## Mudanças implementadas

### `supabase/functions/gen7post/index.ts`

- **Version**: `7.9.15`
- **GET handler**: `GET /gen7post?type=sync-rsc&token=<TOKEN>` retorna template completo com variáveis substituídas
- **Novos tipos**: `sync-rsc` e `guardian-rsc` — retornam .rsc completo para `/import`
- **`replaceSourceWithImport`**: substitui bloco `/system script add ... source="..."` por fetch+import
- **Removidos**: `extractSourceBody`, `replaceSourceWithFetch`, tipos `sync-source` e `guardian-source`
- **Serve mode**: `sync-standalone`, `guardian-standalone`, `all`, `recovery` usam `replaceSourceWithImport`
- **Generate mode**: sync.rsc e guardian.rsc no Storage usam `replaceSourceWithImport`

### Fluxo GET (MikroTik `/tool fetch`)

```
GET /gen7post?type=sync-rsc&token=<TOKEN>
  → valida token
  → tpl("sync-standalone", vars)
  → retorna text/plain com source= inline
  → RouterOS /import → lê source do arquivo direto ✅
```

### Fluxo do installer gerado

```routeros
/tool fetch url=".../gen7post?type=sync-rsc&token=..." output=file dst-path="navspot-sync-dl.rsc"
:delay 2s
/import navspot-sync-dl.rsc
:do { /file remove "navspot-sync-dl.rsc" } on-error={}
```

### Nenhuma mudança no frontend
O frontend continua chamando `gen7post` via POST com `{ hotspot_id }`. Resposta JSON idêntica.
