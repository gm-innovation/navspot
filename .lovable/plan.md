# Plano v6.9.5: Correção de Formatação do Rate-Limit e Robustez do Sync

## ✅ IMPLEMENTADO

### Correções Aplicadas

| Problema | Antes | Depois |
|----------|-------|--------|
| Rate-limit | `3MB/3MB` | `3M/3M` |
| Dados no banco | `3mb` | `3M` (via SQL) |
| Pipe delimitadores | `[[ ... ]]` (com espaços) | `[[...]]` (sem espaços) |
| Extração RouterOS | Sem trim | Com trim de espaços |
| Versão | v6.9.4 | v6.9.5 |

### Arquivos Modificados

1. **`supabase/functions/mikrotik-sync/index.ts`**
   - Adicionada função `normalizeRateLimit()` que remove sufixo "B" (MB→M, KB→K, GB→G)
   - Aplicada em `profileActions` (linha 621-650)
   - Aplicada em `add_user_profile` (linha 727-733)
   - Pipe delimitadores sem espaços: `[[...;]]` (linha 761)

2. **`supabase/functions/mikrotik-script-generator/index.ts`**
   - Script sync com trim robusto na extração (linhas 263-274)
   - Debug log: `NAVSPOT-DEBUG: raw=[...]`
   - Versão atualizada para v6.9.5

3. **Banco de dados**
   - Perfil "Tripulação Googlemarine": `3mb/3mb` → `3M/3M`

### Validação Pós-Implementação

1. ✅ SQL executado - dados normalizados
2. ✅ Edge functions deployadas
3. Regenerar script para hotspot de teste
4. Verificar logs do MikroTik: `/log print where topics~"script"`
5. Testar criação de perfil: `/ip hotspot user profile print where name~"tripulacao"`

### Pipeline v6.9.5

```text
┌──────────────────────────────────────────────────────────────┐
│ BANCO DE DADOS (perfis_velocidade)                           │
│ velocidade_download: "3M" (normalizado)                      │
│ velocidade_upload: "3M" (normalizado)                        │
└──────────────────────┬───────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ MIKROTIK-SYNC (Backend)                                      │
│ normalizeRateLimit("3M") → "3M"                              │
│ rateLimit = "3M/3M"                                          │
│ pending_actions_pipe = "[[create_profile|...|3M/3M|...;]]"   │
└──────────────────────┬───────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ MIKROTIK (RouterOS)                                          │
│ Extração: [:pick $resp ($start + 2) $end] → trim             │
│ Parsing: "create_profile|name|3M/3M|1|0"                     │
│ Execução: /ip hotspot user profile add rate-limit=3M/3M      │
└──────────────────────────────────────────────────────────────┘
```
