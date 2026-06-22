
# Endpoint público assinado para expor schema do banco (TriDev)

O snippet original usa TanStack Router (`createFileRoute`/`server.handlers`), que **não existe** neste projeto (Vite + React puro, sem servidor). A forma correta de expor um endpoint HTTP no NAVSPOT é via **Edge Function** do Lovable Cloud. Vou portar a lógica para Deno, mantendo o mesmo contrato de assinatura.

## O que será criado

### 1. Secret `TRIDEV_WEBHOOK_SECRET`
Solicitar via `add_secret` (valor fornecido pelo usuário/TriDev). Usado como chave HMAC.

### 2. Edge Function `supabase/functions/expose-context/index.ts`

**Endpoint:** `GET https://<project>.functions.supabase.co/expose-context?ts=<unix_seconds>`
**Header obrigatório:** `x-signature: <hex hmac-sha256>`

**Contrato de assinatura (idêntico ao snippet):**
- `message = ts + "/expose-context"`
- `signature = HMAC_SHA256(TRIDEV_WEBHOOK_SECRET, message)` em hex
- Rejeita `ts` com diferença > 300s do relógio do servidor (anti-replay)
- Comparação em tempo constante (`safeEqualHex`)

**Resposta (JSON):**
```json
{
  "database_schema": {
    "tables": [
      { "name": "tripulantes", "columns": [{ "name": "...", "type": "...", "nullable": true }] },
      ...
    ]
  }
}
```

Schema obtido via `information_schema.columns` filtrando `table_schema='public'`, usando `service_role` (cliente Supabase já tem `SUPABASE_SERVICE_ROLE_KEY` nas envs da função).

**Config:**
- `verify_jwt = false` em `supabase/config.toml` (acesso é validado pelo HMAC, não por JWT do Supabase)
- CORS habilitado (`OPTIONS` retorna 200)

### 3. Sem mudanças no frontend
Este endpoint é consumido por sistema externo (TriDev), não pelo app React.

## Fora de escopo (do snippet original)
- `edge_functions`, `file_tree`, `recent_changes`: o runtime da Edge Function **não tem acesso** ao código-fonte nem ao git do projeto Lovable. Esses campos não podem ser populados em runtime — você confirmou que só precisa do schema do banco, então ficam de fora.

## Passos
1. Solicitar secret `TRIDEV_WEBHOOK_SECRET` via `add_secret`.
2. Criar `supabase/functions/expose-context/index.ts` (HMAC + query do information_schema).
3. Adicionar bloco `[functions.expose-context]` com `verify_jwt = false` em `supabase/config.toml`.
4. Informar URL final do endpoint e exemplo de chamada `curl` para o TriDev.
