

# Fix WifiWave2 datapath nomeado + CSV format — v7.9.23

## Bugs confirmados no banco

### Bug 1: Wi-Fi INACTIVE (template `infra`)
**Atual** (linhas do template):
```routeros
:do { /interface bridge port add interface=$w bridge=$bridgeHS comment="navspot-managed" } on-error={}
:do { /interface wifi datapath set [find name=$w] bridge=$bridgeHS } on-error={}
:do { /interface wifi set [find name=$w] datapath.bridge=$bridgeHS } on-error={}
```
No WifiWave2, adicionar wifi como bridge port manual cria flag INACTIVE. Precisa de **datapath object nomeado**.

**Correção**: Substituir seção 3 do infra por:
```routeros
# 3. DATAPATH NOMEADO para WifiWave2 (hAP ax2)
/interface wifi datapath
:if ([:len [find name="dp-navspot"]] = 0) do={
    add name="dp-navspot" bridge=$bridgeHS
} else={
    set [find name="dp-navspot"] bridge=$bridgeHS
}

# Remover bridge ports manuais de wifi (causa INACTIVE)
:do { /interface bridge port remove [find interface=wifi1] } on-error={}
:do { /interface bridge port remove [find interface=wifi2] } on-error={}

# Atribuir datapath nomeado e habilitar
:foreach w in={"wifi1";"wifi2"} do={
    :if ([:len [/interface wifi find name=$w]] > 0) do={
        :do { /interface wifi set $w datapath=dp-navspot } on-error={}
        :do { /interface wifi enable $w } on-error={}
    }
}
```

### Bug 2: registered_users_csv formato errado (template `sync`)
**Atual** (linha 29 do sync):
```routeros
:set regUsersCSV ($regUsersCSV . $u . "," . $p . ";")
```
Produz: `default-trial,;alexandre.silva,tripulacao-googlemarine;`

Backend faz `.split(',')` (linha 378 do mikrotik-sync) esperando: `default-trial,alexandre.silva,`

**Correção**: Enviar apenas usernames separados por vírgula:
```routeros
:set regUsersCSV ($regUsersCSV . $u . ",")
```

### Bug 2b: mesmo bug no `sync-standalone` (linha 40)
```routeros
# Atual (com escaping):
:set regUsersCSV (\$regUsersCSV . \$u . \",\" . \$p . \";\")
# Corrigido:
:set regUsersCSV (\$regUsersCSV . \$u . \",\")
```

## Mudanças

1. **SQL UPDATE `infra`** — substituir seção 3 (bridge port + datapath set/fallback) por datapath nomeado `dp-navspot`
2. **SQL UPDATE `sync`** — linha 29: remover `. "," . $p . ";"` → `. ","` 
3. **SQL UPDATE `sync-standalone`** — linha 40: mesma correção com escaping
4. **`gen7post`** — bump version para `7.9.23`
5. **`.lovable/plan.md`** — atualizar

