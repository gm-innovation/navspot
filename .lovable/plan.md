

# Atualizar versão do gen7post para 7.9.18

## Problema
- `gen7post/index.ts` linha 2: `const V="7.9.17"` — desatualizado
- Template `sync-standalone` no banco: versão `7.9.18` com body limpo ✅
- Template `guardian-standalone`: versão `7.8.7` ✅
- O placeholder `{{VERSION}}` nos scripts será preenchido com `7.9.17` em vez de `7.9.18`

## Implementação
1. Atualizar `const V="7.9.17"` → `const V="7.9.18"` em `supabase/functions/gen7post/index.ts`
2. Deploy automático da edge function

Mudança de 1 linha. Sem impacto funcional além da string de versão exibida na UI e nos scripts gerados.

