
# Plano v7.1.52: Correcao cirurgica do ponto (.) em nomes de arquivo

## Problema

O RouterOS interpreta `.` em `navspot-token.txt` como operador de concatenacao quando o nome nao esta entre aspas. Isso causa "expected end of command (line 10 column 49)".

## Mudanca

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

### 1) VERSION: linha 8
`"7.1.51"` -> `"7.1.52"`

### 2) CLEANUP: linhas 318-321
Substituir as 4 linhas de remoção de arquivos (que contêm `.` no nome) por variáveis locais:

**ANTES:**
```routeros
:do { /file remove [find where name=navspot-token.txt] } on-error={}
:do { /file remove [find where name=navspot-resp.txt] } on-error={}
:do { /file remove [find where name=navspot-recovery.rsc] } on-error={}
:do { /file remove [find where name=ns-install.rsc] } on-error={}
```

**DEPOIS:**
```routeros
:local fn1 "navspot-token.txt"
:local fn2 "navspot-resp.txt"
:local fn3 "navspot-recovery.rsc"
:local fn4 "ns-install.rsc"
:do { /file remove [find where name=$fn1] } on-error={}
:do { /file remove [find where name=$fn2] } on-error={}
:do { /file remove [find where name=$fn3] } on-error={}
:do { /file remove [find where name=$fn4] } on-error={}
```

### 3) VERSION bump nos outros 3 arquivos
- `mikrotik-scripts/index.ts`: `"7.1.51"` -> `"7.1.52"`
- `mikrotik-sync/index.ts`: `"7.1.51"` -> `"7.1.52"`
- `mikrotik-recovery-download/index.ts`: `"7.1.51"` -> `"7.1.52"`

## Nada mais muda

Linhas 322-340 (scripts, schedulers, hotspot, bridge, etc.) permanecem identicas -- nao contem ponto no nome, funcionam sem aspas.
