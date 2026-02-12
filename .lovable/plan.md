
# v7.7.0: Status de Implementação

## ✅ Concluído

### SQL Migration
- Template `installer` corrigido: `/mt-scripts` → `/mikrotik-script-generator` com `?mode=serve&`
- Templates `sync-standalone` e `guardian-standalone` criados no banco
- Todos templates atualizados para versão 7.7.0

### Frontend
- ScriptModal.tsx: Aba "Modular" adicionada com 3 botões de download (infra, sync, guardian)
- Hook `useModularScripts.ts` criado para fetch direto no endpoint serve
- URL de atualização corrigida: `/mt-scripts` → `/mikrotik-script-generator?mode=serve`

### Edge Function (código pronto, deploy pendente)
- VERSION bumped para 7.7.0
- Novos tipos serve: `infra`, `sync-standalone`, `guardian-standalone`
- Headers: `Cache-Control: no-store`, `X-Navspot-Version`
- Health endpoint simplificado
- Auth fix: `getClaims` → `getUser` (método válido no SDK)
- Import: `npm:` → `esm.sh` (CDN estável)

## ⚠️ Bloqueado: Edge Function 404 Persistente

O bundler Deno está falhando silenciosamente ao registrar `mikrotik-script-generator`.
Causa provável: template string de ~250 linhas de RouterOS na função `generateBootstrapScript`.

### Próximo passo para resolver
Mover o conteúdo do `generateBootstrapScript` para um template no banco (como `bootstrap-infra`)
e fazer a função apenas buscar e substituir placeholders, eliminando o template string inline.
Isso reduzirá o arquivo de ~740 linhas para ~300 linhas e evitará o timeout do bundler.
