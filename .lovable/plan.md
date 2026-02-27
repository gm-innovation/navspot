

# Migração automática de portas AP + dry-run — v7.9.26

## Mudanças

### 1. SQL UPDATE `script_templates` (id='infra')

Inserir novo bloco **3b** entre a seção 3 (datapath WiFi) e seção 4 (IP/DHCP). O bloco:

- Itera todas as interfaces ethernet, pulando `ether1`, `ether2`, SFP, master-port e disabled
- Verifica se a porta já está em `bridge-navspot` (idempotente)
- Suporta `{{DRY_RUN}}` (`true` = só loga, `false` = aplica)
- Loga cada decisão para auditoria

Atualizar **cleanup** (seção 1): trocar `comment="navspot"` no firewall filter para 3 comments específicos (`navspot-dhcp`, `navspot-dns-udp`, `navspot-dns-tcp`).

Atualizar **seção 6** (firewall): usar comments específicos por regra.

Adicionar **limpeza de hosts** condicional (só se `dryRun=false`) antes do log final.

### 2. `gen7post/index.ts`

- Bump versão para `7.9.26`
- Adicionar `{{DRY_RUN}}` ao mapa de variáveis (default `false`)

### 3. `.lovable/plan.md`

Documentar: migração ether3+, dry-run, rollback, checklist pós-deploy.

## Template infra completo (seções modificadas)

**Seção 1 cleanup** — substituir a linha de firewall filter:
```routeros
:do { /ip firewall filter remove [find comment="navspot-dhcp"] } on-error={}
:do { /ip firewall filter remove [find comment="navspot-dns-udp"] } on-error={}
:do { /ip firewall filter remove [find comment="navspot-dns-tcp"] } on-error={}
```

**Nova seção 3b** (após WiFi datapath, antes de IP/DHCP):
```routeros
# 3b. Migrar portas fisicas (ether3+) para bridge-navspot - seguro e idempotente
:local dryRun {{DRY_RUN}}
:local ethList [/interface ethernet find]
:foreach idx in=$ethList do={
  :local ifname [/interface ethernet get $idx name]
  :if (($ifname != "ether1") && ($ifname != "ether2")) do={
    :if ([:find $ifname "sfp"] >= 0) do={
      :log info ("NAVSPOT: Pulando " . $ifname . " (SFP)")
    } else={
      :local mport [/interface ethernet get $idx master-port]
      :if ([:len $mport] > 0) do={
        :log info ("NAVSPOT: Pulando " . $ifname . " (master-port: " . $mport . ")")
      } else={
        :if ([/interface ethernet get $idx disabled] = true) do={
          :log info ("NAVSPOT: Pulando " . $ifname . " (disabled)")
        } else={
          :local bpId [/interface bridge port find interface=$ifname]
          :if ([:len $bpId] = 0) do={
            :if ($dryRun = true) do={
              :log info ("NAVSPOT-DRYRUN: " . $ifname . " sem bridge - seria adicionada")
            } else={
              :do { /interface bridge port add interface=$ifname bridge=$bridgeHS comment="navspot-managed" } on-error={}
              :log info ("NAVSPOT: " . $ifname . " adicionada a " . $bridgeHS)
            }
          } else={
            :local curBridge [/interface bridge port get $bpId bridge]
            :if ($curBridge = $bridgeHS) do={
              :log info ("NAVSPOT: " . $ifname . " ja em " . $bridgeHS)
            } else={
              :if ($dryRun = true) do={
                :log info ("NAVSPOT-DRYRUN: " . $ifname . " em " . $curBridge . " - seria movida")
              } else={
                :do { /interface bridge port remove $bpId } on-error={}
                :do { /interface bridge port add interface=$ifname bridge=$bridgeHS comment="navspot-managed" } on-error={}
                :log info ("NAVSPOT: " . $ifname . " movida de " . $curBridge . " para " . $bridgeHS)
              }
            }
          }
        }
      }
    }
  }
}
```

**Seção 6** — firewall com comments específicos:
```routeros
/ip firewall filter
add chain=input protocol=udp dst-port=67 in-interface=bridge-navspot action=accept comment="navspot-dhcp" place-before=0
add chain=input protocol=udp dst-port=53 in-interface=bridge-navspot action=accept comment="navspot-dns-udp" place-before=0
add chain=input protocol=tcp dst-port=53 in-interface=bridge-navspot action=accept comment="navspot-dns-tcp" place-before=0
```

**Antes do log final** — limpeza condicional de hosts:
```routeros
:if ($dryRun = false) do={
  :do { /interface bridge host remove [find] } on-error={}
  :log info "NAVSPOT: tabela de hosts limpa"
}
```

## gen7post vars

Adicionar ao mapa de variáveis:
```typescript
"{{DRY_RUN}}": "false"
```

