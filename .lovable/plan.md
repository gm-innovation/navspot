

# Fix: Separar `} on-error={...}` em linhas próprias no template `sync-standalone`

## Problema
Linha 183 do template `sync-standalone`:
```
} on-error={ :log error \"NAVSPOT-SYNC: Falha no fetch (Rede ou Backend)\" }
```
O bloco `:do {` abre na linha 34 e se estende por ~150 linhas. O RouterOS 7 não aceita `} on-error={...}` na mesma linha quando o `do={` foi aberto em bloco multiline.

## Fix
Substituir essa linha por 3 linhas separadas:
```
} on-error={
    :log error \"NAVSPOT-SYNC: Falha no fetch (Rede ou Backend)\"
}
```

## Implementação
- SQL UPDATE na tabela `script_templates` usando a ferramenta de inserção/update
- Replace da string `} on-error={ :log error \"NAVSPOT-SYNC: Falha no fetch (Rede ou Backend)\" }` pela versão em 3 linhas
- Bump da `version` do template para refletir a correção

## Guardian
O template `guardian-standalone` também usa `} on-error={...}` em linha única, mas seus blocos `:do {` são curtos (1-3 linhas) — RouterOS aceita isso. Não precisa de fix.

