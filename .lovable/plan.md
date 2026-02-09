
# Hotfix v7.1.52: Limpeza de arquivos temporarios + fix de sintaxe do sync

## Resumo

Tres correcoes cirurgicas para resolver o acumulo de arquivos e o erro "line 10 column 49":

## Mudancas

### 1. `mikrotik-script-generator/index.ts` - Cleanup (linhas 318-325)

Substituir a remocao fixa de `ns-install.rsc` por um loop com regex, adicionar `navspot-actions.txt`, e resetar globals de lock.

**ANTES:**
```text
:local fn1 "navspot-token.txt"
:local fn2 "navspot-resp.txt"
:local fn3 "navspot-recovery.rsc"
:local fn4 "ns-install.rsc"
:do { /file remove [find where name=$fn1] } on-error={}
:do { /file remove [find where name=$fn2] } on-error={}
:do { /file remove [find where name=$fn3] } on-error={}
:do { /file remove [find where name=$fn4] } on-error={}
```

**DEPOIS:**
```text
:local fn1 "navspot-token.txt"
:local fn2 "navspot-resp.txt"
:local fn3 "navspot-recovery.rsc"
:local fn5 "navspot-actions.txt"
:do { /file remove [find where name=$fn1] } on-error={}
:do { /file remove [find where name=$fn2] } on-error={}
:do { /file remove [find where name=$fn3] } on-error={}
:do { /file remove [find where name=$fn5] } on-error={}
:foreach f in=[/file find where name~"^ns-install"] do={
:do { /file remove $f } on-error={}
}
:global navspotSyncLock; :set navspotSyncLock "0"
:global navspotSyncLockTime; :set navspotSyncLockTime 0
```

### 2. `mikrotik-scripts/index.ts` - Sync lock warning (linha 741)

Adicionar parenteses na concatenacao do `:log warning`.

**ANTES:**
```text
:log warning "NAVSPOT-SYNC: lock expirado (age=".$la."s), resetando"
```

**DEPOIS:**
```text
:log warning ("NAVSPOT-SYNC: lock expirado (age=" . $la . "s), resetando")
```

### 3. Deploy

Redeployar `mikrotik-script-generator` e `mikrotik-scripts`. VERSION permanece 7.1.52.
