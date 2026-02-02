# Plano v6.9.15 - Bloqueio de Sites + Correção de Loop ✅ IMPLEMENTADO

## Resumo das Mudanças Implementadas

### 1. ✅ Migração de Banco
- Adicionadas colunas `firewall_rules_hash` e `firewall_rules_updated_at` na tabela `hotspots`
- Expandido constraint `acoes_pendentes_tipo_check` para incluir todos os tipos de ações usados

### 2. ✅ mikrotik-sync v6.9.15
- **Hash-based caching**: Só injeta ações de firewall quando as regras mudam
- **Normalização de domínios**: Remove wildcards (`*.`, `*`) antes de enviar para o MikroTik
- **Loop prevention**: Compara hash atual vs novo antes de injetar ações "auto-"

### 3. ✅ mikrotik-script-generator v6.9.15
- **Address-List blocking**: Usa `NAVSPOT-BLACKLIST` com DNS resolve em vez de content match
- **Master Drop Rule**: Cria uma única regra drop antes do fasttrack
- **Guardian version check**: Verifica se action-processor contém `NAVSPOT-BLACKLIST`, força recovery se antigo

### 4. ✅ mikrotik-recovery-download v6.9.15
- Action-processor atualizado com handler `add_firewall_block` completo
- Inclui lógica de Address-List + fallback para content match

---

## Comandos de Verificação no MikroTik

Após sincronização, execute para confirmar:

```routeros
# Ver regras Walled Garden (pré-login)
/ip hotspot walled-garden print where comment~"navspot-blacklist"

# Ver regra Master (pós-login)
/ip firewall filter print where comment="NAVSPOT-BLOCK-MASTER"

# Ver Address-List com IPs bloqueados
/ip firewall address-list print where list="NAVSPOT-BLACKLIST"

# Monitorar counters durante teste
/ip firewall filter print stats where comment="NAVSPOT-BLOCK-MASTER"

# Verificar versão do action-processor
/system script print detail where name="navspot-action-processor"
# Procurar por "NAVSPOT-BLACKLIST" no source
```

---

## Fluxo de Dados v6.9.15

```
1. Admin cria blacklist com *.facebook.com
   ↓
2. mikrotik-sync calcula hash das regras
   ↓
3. Se hash mudou:
   - Normaliza: *.facebook.com → facebook.com
   - Injeta: add_blacklist_domain (walled-garden)
   - Injeta: add_firewall_block (firewall)
   - Salva novo hash
   ↓
4. MikroTik action-processor:
   a) Walled Garden: action=reject (pré-login)
   b) DNS resolve facebook.com → 157.240.1.35
   c) Address-list: NAVSPOT-BLACKLIST += 157.240.1.35
   ↓
5. Master rule bloqueia tudo em NAVSPOT-BLACKLIST (pós-login)
```

---

## Critérios de Aceitação

1. ✅ Loop corrigido via hash - só injeta quando há mudança
2. ✅ action-processor com handler `add_firewall_block`
3. ✅ Master rule `NAVSPOT-BLOCK-MASTER` antes do fasttrack
4. ✅ DNS resolve + Address-List para bloqueio robusto
5. ✅ Guardian detecta versão antiga e força recovery
6. ✅ Constraint expandido para aceitar todos os tipos de ações
