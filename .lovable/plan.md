

# Migração dos templates sync + sync-standalone para modelo validado v7.9.21

## Resumo
Atualizar os templates `sync` e `sync-standalone` no banco com o código modelo validado em hardware, adicionando 4 novos handlers (configure_hotspot_profile, create_profile, create_whitelist_domain, create_user com profile) mantendo os 3 existentes (block_quota, unblock_quota, force_reg) com proteção idempotente.

## Mudanças

### 1. SQL Migration — template `sync` (source puro)
Substituir conteúdo por modelo validado com placeholders. Handlers finais (7):

```text
Handler                     Pipe do backend                              Idempotência
─────────────────────────── ──────────────────────────────────────────── ──────────────
configure_hotspot_profile   configure_hotspot_profile|login_url|dns      profile set [find name="default"]
create_profile              create_profile|nome|rate|shared|limit        find + add/set
create_whitelist_domain     create_whitelist_domain|list|domain          find + add (dedup)
create_user                 create_user|user|password|profile            find + add/set
block_quota                 block_quota|MAC                              find + add (idempotente)
unblock_quota               unblock_quota|MAC                            remove [find]
force_reg                   force_reg|USER                               set + remove active
```

Extras inclusos: extração de `batch_id`, envio de `identity` + `version` no payload, lock com global variable.

### 2. SQL Migration — template `sync-standalone` (installer .rsc)
Wrap do `sync` dentro de `/system script add ... source="..."` com:
- Escaping correto: `$` → `\$`, `"` → `\"`, `\"` interno → `\\\"`
- Headers de cleanup idempotente
- Scheduler + netwatch pós-instalação
- `:delay 2s` antes do primeiro `/system script run` (recomendação do usuário para hAP ax²)

### 3. `gen7post/index.ts` — version bump
`const V="7.9.20"` → `const V="7.9.21"`

### 4. Detalhe técnico: escaping no sync-standalone

O template `sync` usa `$var` e `"string"` sem escape (para modo serve/import direto).

O template `sync-standalone` precisa converter:
- `$` → `\$`
- `"` → `\"`
- `\"` (já escapadas no pipe parsing) → `\\\"`

O gen7post já aplica `tpl()` que faz placeholder replacement e sanitização. O escaping é responsabilidade do **template no banco**, não do gen7post.

### 5. Ordem dos campos no pipe (verificação)
Confirmado no backend (linhas 1836-1921):
- `create_user|user|password|profile` ✓
- `create_profile|name|rate|shared|limit` ✓
- `configure_hotspot_profile|login_url|dns_name` ✓
- `create_whitelist_domain|list_name|domain` ✓
- `block_quota|mac` ✓
- `unblock_quota|mac` ✓
- `force_reg|user` ✓

### 6. Arquivos modificados
- **SQL migration** — UPDATE `script_templates` SET content para `sync` e `sync-standalone`
- **`supabase/functions/gen7post/index.ts`** — version bump para 7.9.21
- Deploy automático do gen7post

