

# Fix v7.3.0: Achatar Nesting - Processar Acoes no Nivel 0

## O Problema

O sync script v7.3.0 crasheia porque o nesting atinge L11 nos handlers inline:

```text
L0: :do { } on-error={}         (main block)
L1:   :if ($ok) do={}
L2:     :if (markers) do={}
L3:       :if ([:len $a]>0) do={}
L4:         :while (find ";") do={}
L5:           :if ([:len $ln]>0) do={}
L6:             :if ($p1>=0) do={}
L7:               :if ($c="create_profile") do={}
L8:                 :do {} on-error={}
L9:                   :if ($p2>=0) do={}
L10:                    :if ([:len $ex]>0) do={}
L11:                      :if ([:len $rt]>0) do={}  <-- CRASH
```

## A Solucao: Hoisting da variavel $a

Declarar `$a` no Nivel 0 (fora do `:do {} on-error={}`). Preencher `$a` dentro do bloco de fetch. Processar acoes FORA do bloco principal, no Nivel 0.

### Novo fluxo:

```text
:local a ""           # L0 - declarada fora
:do {
  # fetch, parse response, extrair $a
  :set a [:pick $raw ...]   # $a preenchida dentro
} on-error={...}
# Agora de volta ao L0 - processar acoes aqui
:if ([:len $a]>0) do={      # L1
  :while ... do={            # L2
    :if ([:len $ln]>0) do={  # L3
      :if ($p1>=0) do={      # L4 (extrair $c e $rv)
        :if ($c="configure_hotspot_profile") do={  # L5 (handler)
          :local p2 ...      # L5-L6 max
        }
        :if ($c="create_profile") do={  # L5
          :do { ... } on-error={}       # L5 (single-line :do)
        }
      }
    }
  }
}
```

### Nesting maximo apos fix:

| Handler | Antes | Depois |
|---------|-------|--------|
| configure_hotspot_profile | L9 | L6 |
| create_profile | L11 | L7 |
| create_user | L11 | L7 |
| remove_user | L9 | L5 |
| disable/enable_user | L8 | L5 |

Todos abaixo de L8. Os handlers simples ficam em L5-L6.

## Detalhes tecnicos

### Arquivo: `supabase/functions/mikrotik-scripts/index.ts`

Funcao `generateSyncSource()` (linhas 363-567):

1. **Mover declaracao de `$a` para fora do `:do` (antes da linha 372)**:
   - Adicionar `:local a ""` no inicio do script (apos lock check, antes do `:do {`)
   
2. **Dentro do `:do {} on-error={}` (linhas 372-564)**:
   - Manter toda a logica de coleta, fetch e parse
   - Ao extrair `$a` do marcador `[[ ]]`, apenas atribuir valor (`:set a ...`)
   - Logar "actions len=X"
   - NAO processar acoes aqui - apenas fechar o bloco

3. **Apos o `:do {} on-error={}`, no Nivel 0**:
   - Mover todo o bloco de processamento (linhas 451-553) para FORA
   - O `:while` fica em L2 (dentro de `:if ([:len $a]>0) do={}`)
   - Handlers ficam em L5 max na entrada

4. **Simplificar `create_profile` e `create_user`**:
   - Envolver cada handler em `:do {} on-error={}` de uma linha para protecao
   - Manter logica interna mas com menos niveis (max L7)

### Estrutura final do generateSyncSource():

```typescript
function generateSyncSource(syncUrl, syncToken) {
  return `
:log info "NAVSPOT-SYNC v${VERSION}"
# ... lock check (mesmo) ...
:local a ""
:local lby "cookie,http-pap,http-chap"
:do {
  # ... coleta telemetria (mesmo) ...
  # ... fetch (mesmo) ...
  # ... parse resposta, extrair $a do [[ ]] ...
  :if ([:len $a]>0) do={:log info ("NAVSPOT-SYNC: actions len=" . [:len $a])}
} on-error={:log error "NAVSPOT-SYNC: CRASH in main block";:set navspotSyncLock "0"}
# === PROCESSAR ACOES NO NIVEL 0 ===
:if ([:len $a]>0) do={
:local pos 0
:local cnt 0
:while ([:find $a ";" $pos] >= 0) do={
:local ep [:find $a ";" $pos]
:local ln [:pick $a $pos $ep]
:set pos ($ep + 1)
:if ([:len $ln] > 0) do={
:local p1 [:find $ln "|"]
:if ($p1 >= 0) do={
:local c [:pick $ln 0 $p1]
:local rv [:pick $ln ($p1+1) [:len $ln]]
# Handlers independentes (flat :if, nunca else-if)
:if ($c="configure_hotspot_profile") do={...}  # L5
:if ($c="create_profile") do={:do {...} on-error={}}  # L5
:if ($c="create_user") do={:do {...} on-error={}}  # L5
# ... outros handlers ...
}}}
:log info ("NAVSPOT-SYNC: processed " . $cnt . " actions")
:set a ""
}
:set navspotSyncLock "0"
:log info "NAVSPOT-SYNC v${VERSION}: OK"
`
}
```

Nenhuma outra mudanca necessaria. Apenas mover o processamento para fora do `:do {} on-error={}`.

