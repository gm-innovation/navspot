

# Atualizar VERSION para 7.2.4

## Problema

As mudancas cirurgicas do fix v7.2.3b (remocao de wrappers, hoisting do sync fallback) foram aplicadas sem incrementar a VERSION. Isso causa dois problemas:

1. **Rastreabilidade**: Os logs no RouterOS mostram "v7.2.3" tanto para a versao antiga (com crash) quanto para a nova (achatada). Impossivel distinguir qual versao esta rodando.
2. **Guardian**: O navspot-guardian compara a string de versao no source do script. Se a versao nao muda, o guardian NAO forca re-download em roteadores que ja tem v7.2.3 instalado (a versao quebrada).

## Mudancas

**2 arquivos, 1 linha cada:**

1. `supabase/functions/mikrotik-scripts/index.ts` linha 38:
   - `const VERSION = "7.2.3"` -> `const VERSION = "7.2.4"`

2. `supabase/functions/mikrotik-script-generator/index.ts` linha 8:
   - `const VERSION = "7.2.3"` -> `const VERSION = "7.2.4"`

## Resultado

- Logs mostrarao `NAVSPOT-ACTION v7.2.4F: Start`
- Guardian detectara versao desatualizada e forcara re-download automatico
- Rastreabilidade clara entre versao quebrada (7.2.3) e corrigida (7.2.4)

