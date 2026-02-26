

# v7.9.15 — Arquitetura `/import` (elimina `set source=`)

## Problema
RouterOS re-serializa o conteúdo ao executar `/system script set source=$var`, convertendo newlines em `\; \n`. O problema não está no banco nem no backend — está na abordagem de injeção via variável.

## Mudança de arquitetura

| v7.9.14 | v7.9.15 |
|---|---|
| fetch body → `set source=$var` | fetch `.rsc` completo → `/import` |
| RouterOS re-serializa → corrupção | RouterOS lê arquivo direto → OK |

## Mudanças

### 1. `supabase/functions/gen7post/index.ts` — rewrite completo

- **Version bump**: `7.9.14` → `7.9.15`
- **Aceitar GET**: MikroTik `/tool fetch` usa GET com query params `?type=sync-rsc&token=<TOKEN>`
- **Novos tipos `sync-rsc` e `guardian-rsc`**: retornam o template completo (com `source=` inline) do banco, apenas com variáveis substituídas. Sem `extractSourceBody`, sem manipulação de source
- **Nova função `replaceSourceWithImport`**: substitui `replaceSourceWithFetch`. Em vez de criar script vazio + fetch body + `set source=`, agora:
  - Remove o bloco inteiro do `/system script add` com `source="..."`  
  - Insere bloco que faz `/tool fetch url=".../gen7post?type=<rsc-type>&token=<token>" output=file dst-path="<name>-dl.rsc"` + `/import <name>-dl.rsc` + cleanup
- **Remover `extractSourceBody`** e **`replaceSourceWithFetch`** — código morto
- **Remover tipos `sync-source` e `guardian-source`** — substituídos por `sync-rsc` e `guardian-rsc`
- **Serve mode**: tipos `sync-standalone`, `guardian-standalone`, `all`, `recovery` agora usam `replaceSourceWithImport` em vez de `replaceSourceWithFetch`
- **Generate mode**: mesma mudança — sync.rsc e guardian.rsc no Storage usam `replaceSourceWithImport`
- Manter: `health`, `serve` POST (backward compat), `generate` POST, helpers `rest`, `tpl`, `vars`

### 2. `.lovable/plan.md` — atualizar com a nova arquitetura

## Detalhes técnicos

### `replaceSourceWithImport` — lógica

```text
Input: template com bloco:
  /system script add name="navspot-sync" ... source="
  <multiline source content>
  "

Output: substitui esse bloco por:
  :log info "NAVSPOT-SYNC-INSTALL: Baixando sync.rsc..."
  :do {
      /tool fetch url="<SCRIPTS_URL>?type=sync-rsc&token=<TOKEN>" output=file dst-path="navspot-sync-dl.rsc"
      :delay 2s
      /import navspot-sync-dl.rsc
      :do { /file remove "navspot-sync-dl.rsc" } on-error={}
      :log info "NAVSPOT-SYNC-INSTALL: sync.rsc importado com sucesso"
  } on-error={
      :log error "NAVSPOT-SYNC-INSTALL: Falha ao baixar/importar sync.rsc"
  }
```

A regex encontra o bloco `/system script add name="navspot-<name>"` até a linha que contém apenas `"` (fim do source). Substitui tudo pelo fetch+import.

### GET handler — fluxo

```text
GET /gen7post?type=sync-rsc&token=<TOKEN>
  → valida token via rest("hotspots", {sync_token: eq.TOKEN})
  → monta vars
  → tpl("sync-standalone", vars) 
  → retorna o template completo como text/plain (com source= inline)
  → RouterOS faz /import → lê source do arquivo direto
```

### Nenhuma mudança no frontend

O frontend continua chamando `gen7post` via POST com `{ hotspot_id }`. A resposta JSON com signed URLs permanece idêntica. Os arquivos no Storage é que mudam internamente (sync.rsc agora tem fetch+import em vez de fetch body+set source=).

