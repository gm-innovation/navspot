

## ✅ IMPLEMENTADO - v6.9.23

### Correção Crítica: Whitelist agora usa `hotspot=auth`

O problema "Esta rede não tem acesso à internet" no Android foi causado pela regra `NAVSPOT-ALLOW-MASTER` que bloqueava **todo** o tráfego forward, incluindo o tráfego pré-login necessário para o captive portal funcionar.

### Mudanças Implementadas

1. **`supabase/functions/mikrotik-recovery-download/index.ts`**
   - Regras `NAVSPOT-ALLOW-MASTER` e `NAVSPOT-ALLOW-ACCEPT` agora incluem `hotspot=auth`
   - Auto-remoção de regras antigas sem escopo
   - Adicionado DNS TCP (porta 53) e ICMP ao Walled Garden
   - Versão atualizada para v6.9.23 em todos os logs

2. **`supabase/functions/mikrotik-script-generator/index.ts`**
   - Mesma correção do action processor com `hotspot=auth`
   - Auto-detecção e correção de regras antigas
   - Versão atualizada para v6.9.23

3. **`src/components/modals/ScriptModal.tsx`**
   - Versão atualizada para v6.9.23
   - Arquivo de Recovery baixa como `navspot-recovery-v6.9.23.rsc`

### Como a Correção Funciona

**Antes (v6.9.21):**
```routeros
/ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER"
# Bloqueia TODO o tráfego forward, incluindo pré-login
```

**Depois (v6.9.23):**
```routeros
/ip firewall filter add chain=forward action=drop hotspot=auth comment="NAVSPOT-ALLOW-MASTER"
# Só bloqueia tráfego de usuários AUTENTICADOS no hotspot
# Tráfego pré-login (redirect para portal) passa normalmente
```

### Passos para Aplicar a Correção

1. **Baixar Recovery v6.9.23** no painel (arquivo `navspot-recovery-v6.9.23.rsc`)
2. **Importar no MikroTik:**
   ```routeros
   /import navspot-recovery-v6.9.23.rsc
   ```
3. **Verificar que as regras antigas foram removidas:**
   ```routeros
   /ip firewall filter print where comment~"NAVSPOT-ALLOW"
   ```
   Esperado: regras com `hotspot=auth` ou nenhuma regra (será recriada no próximo sync)

4. **Testar no Android:**
   - Conectar ao WiFi
   - Portal deve abrir automaticamente
   - Login deve funcionar sem timeout

### Logs Esperados

No MikroTik após importar o Recovery:
```
NAVSPOT-RECOVERY v6.9.23: REPARACAO CONCLUIDA!
FIX CRITICO: Whitelist agora usa hotspot=auth (pre-login nao bloqueado)
```
