
# Plano: Atualização Completa para v6.9.21

## Diagnóstico

A implementação anterior da v6.9.21 foi **parcialmente aplicada**:

| Arquivo | Estado |
|---------|--------|
| `mikrotik-script-generator` - Action Processor | Atualizado (linhas 490-546) |
| `mikrotik-script-generator` - Bootstrap/Guardian/Sync | Ainda v6.9.20 (107 referências) |
| `mikrotik-recovery-download` - Tudo | Ainda v6.9.20 (arquivo inteiro) |

Isso explica por que o script exibido no modal ainda mostra "v6.9.20" e o Recovery baixado não tem as correções de whitelist.

---

## Mudanças Necessárias

### 1. mikrotik-script-generator/index.ts

Atualizar todas as referências de `v6.9.20` para `v6.9.21`:

| Linha | Atual | Novo |
|-------|-------|------|
| 70 | `v6.9.21` (já OK) | - |
| 92 | `v6.9.20 single bootstrap` | `v6.9.21 single bootstrap` |
| 115-127 | Comentários v6.9.20 | Comentários v6.9.21 |
| 246 | Sync script v6.9.20 | v6.9.21 |
| 461-468 | add_firewall_block v6.9.20 | v6.9.21 |
| 555-556 | Recovery URL v6.9.20 | v6.9.21 |
| 558-559 | Guardian v6.9.20 | v6.9.21 |
| 628 | Sistema integro v6.9.20 | v6.9.21 |
| 631-632 | Bootstrap v6.9.20 | v6.9.21 |
| 642, 665 | Limpeza v6.9.20 | v6.9.21 |
| 763, 777, 784 | Guardian v6.9.20 | v6.9.21 |
| 786, 801, 816, 823 | Action/Sync v6.9.20 | v6.9.21 |
| 825 | Netwatch v6.9.20 | v6.9.21 |
| 838 | Instalação concluída v6.9.20 | v6.9.21 |

---

### 2. mikrotik-recovery-download/index.ts

#### 2.1 Atualizar versão e comentários
- Linhas 9, 15: Comentário do arquivo
- Linhas 233, 238: Logs de geração
- Linha 260: syncScriptSource v6.9.20
- Linha 320, 334: actionProcessorSource v6.9.20
- Linhas 555-623: Script de recovery

#### 2.2 Corrigir ordem das regras de firewall (linhas 503-532)

**Código atual (INCORRETO):**
```routeros
# Create ACCEPT rule for allowed list first
/ip firewall filter add chain=forward action=accept dst-address-list=NAVSPOT-ALLOWED comment="NAVSPOT-ALLOW-ACCEPT" place-before=$ftPos
# Then create DROP for everything else
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" place-before=$ftPos
```

**Código corrigido:**
```routeros
# v6.9.21: FIRST create DROP (master block)
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" place-before=$ftPos
:log info "NAVSPOT: Allow master drop rule created (v6.9.21)"
# THEN add ACCEPT BEFORE the drop (so it's processed first)
:local dropPos [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]
/ip firewall filter add chain=forward action=accept dst-address-list=NAVSPOT-ALLOWED comment="NAVSPOT-ALLOW-ACCEPT" place-before=$dropPos
:log info "NAVSPOT: Allow accept rule created BEFORE drop (v6.9.21)"
```

#### 2.3 Adicionar Walled Garden para whitelists (após linha 517)

```routeros
# v6.9.21: DUAL APPROACH - Walled Garden (robust for hostnames) + Address-List (backup)
# 1. Add to Walled Garden with action=allow
:if ([:len [/ip hotspot walled-garden find dst-host=$domain]] = 0) do={
/ip hotspot walled-garden add dst-host=$domain action=allow comment=("navspot-allow-" . $domain)
:log info ("NAVSPOT: Walled Garden allow - " . $domain)
}
# 2. Try DNS resolution for address-list (timeout=none para não expirar)
```

#### 2.4 Remover timeout=1d das address-lists (linha 523)

```routeros
# Atual:
/ip firewall address-list add ... timeout=1d ...

# Novo:
/ip firewall address-list add ... timeout=none ...
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Atualizar ~15 referências de v6.9.20 para v6.9.21 |
| `supabase/functions/mikrotik-recovery-download/index.ts` | Atualizar versão + corrigir ordem de regras + adicionar Walled Garden + remover timeout |

---

## Resultado Esperado

Após a implementação:
1. O modal de script mostrará **"Script MikroTik v6.9.21"**
2. O Recovery baixado terá as correções de whitelist
3. Sites como uol.com.br, r7.com.br funcionarão com o modo "bloquear_tudo"
4. As regras de firewall serão criadas na ordem correta (ACCEPT antes de DROP)

---

## Testes Após Implementação

1. Gerar novo script de bootstrap - verificar título v6.9.21
2. Baixar Recovery e importar no MikroTik
3. Verificar logs: `/log print where message~"v6.9.21"`
4. Testar acesso a sites whitelisted
