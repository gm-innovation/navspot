
# Status: RESOLVIDO ✅

## Descoberta Final

O erro 404 do `mt-scripts` **nunca foi real**. O problema era no tool de teste (curl_edge_functions) que encodava query parameters no path da URL (`?` → `%3F`), fazendo o gateway não encontrar a função.

Quando testado corretamente com `query_params` separados, **tanto `mt-scripts` quanto `navspot-rsc`** responderam 200 com o código completo.

## Estado Atual

- **`mt-scripts`**: Operacional ✅ (v7.4.5, templates no banco, import esm.sh)
- **`mikrotik-recovery-download`**: Operacional ✅ (import esm.sh, referencia mt-scripts)
- **Tabela `script_templates`**: Criada ✅ (3 templates: sync, guardian, installer)
- **Frontend `ScriptModal.tsx`**: Atualizado ✅ (aponta para mt-scripts)
- **`navspot-rsc`**: Removido (não necessário)

## Arquitetura Final

```
MikroTik → mt-scripts (edge function leve, ~80 linhas)
                ↓
         script_templates (tabela PostgreSQL)
                ↓
         .replace({{VAR}}) → script .rsc
```

Templates atualizáveis via SQL sem redeploy.
