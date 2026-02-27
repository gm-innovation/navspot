
# Templates sync + sync-standalone — modelo simplificado validado ✅

## Status: CONCLUÍDO

Templates `sync` e `sync-standalone` atualizados com modelo validado em hardware (hAP ax²).

### Estrutura aplicada
- **Early exit** via `:error` (sem `if` gigante aninhado)
- **4 handlers flat**: `create_whitelist_domain`, `create_profile`, `block_quota`, `unblock_quota`
- **Sem `:toarray`** — busca direta por `|` com `:find`/`:pick`
- **Idempotência inline**: `/comando { :if ([:len [find ...]] = 0) do={ add ... } }`
- **sync-standalone**: escaping triplo (`\$`, `\"`, `\\\"`) + `:delay 2s` + cleanup idempotente

### Handlers removidos (para estabilidade)
- `configure_hotspot_profile` — re-adicionar quando confirmado em produção
- `create_user` — re-adicionar com estrutura flat
- `force_reg` — re-adicionar com estrutura flat

### Próximos passos
- Monitorar logs para confirmar que `pending_actions_pipe` diminui
- Implementar ACK de `batch_id` no backend
- Re-adicionar handlers removidos usando estrutura flat validada
