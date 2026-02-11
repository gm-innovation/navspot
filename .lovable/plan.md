

# Bump de Versao: 7.2.1 -> 7.2.2

## Objetivo

Corrigir crash do Fallback Action Processor (v7.2.1F) causado por nesting excessivo (~Level 9-10) no handler `configure_hotspot_profile`. O RouterOS 7 falha a partir de ~Level 8.

## Mudancas

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`

1. **Linha 38:** `const VERSION = "7.2.1"` -> `const VERSION = "7.2.2"`
2. **Linhas 325-337:** Handler `configure_hotspot_profile` achatado:
   - Removido wrapper `:do { } on-error={}` (economiza 1 nivel)
   - Removida verificacao dupla `[:len $lu] > 0 && [:len $dn] > 0` (economiza 1 nivel)
   - Removida busca indireta via `hs-navspot` -> profile name -> find (economiza 2 niveis)
   - Agora usa `hsprof-navspot` direto (max Level 7)

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

- **Linha 8:** `const VERSION = "7.2.1"` -> `const VERSION = "7.2.2"`

## Contagem de Niveis (Apos Fix)

```
:do {                                       # L1
  :while                                    # L2
    :if ([:len $ln] > 0)                    # L3
      :if ($p1 >= 0)                        # L4
        :if ($c = "configure_hotspot_profile")  # L5
          :if ($p2 >= 0)                    # L6
            :if ([:len $hp] > 0)            # L7  <-- SEGURO
```

## Verificacao

Apos re-importar o bootstrap v7.2.2:
- `NAVSPOT-ACTION v7.2.2F: Start` (sem crash)
- `NAVSPOT: cfg-hp applied on hsprof-navspot`
- `dns-name` e `login-url` preenchidos no profile
- Logs mostrarao `NAVSPOT-SYNC v7.2.2`
