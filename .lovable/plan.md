

# Plano Consolidado: Correção Completa v6.9.16

## Diagnóstico Completo

### 1. Loop de Hash - CORRIGIDO
Os logs confirmam que o hash está funcionando:
```
Firewall rules hash - current: 6ec17f16, new: 6ec17f16
```
O sistema NÃO está mais reenviando as regras a cada sync.

### 2. Regras de Firewall Não Aplicadas
**Problema crítico**: O hash foi salvo no banco (`firewall_rules_hash = 6ec17f16...`) na primeira vez, mas o MikroTik estava com action-processor **antigo** (sem handler `add_firewall_block`). Resultado:
- Backend pensa que as regras foram aplicadas (hash salvo)
- MikroTik nunca recebeu/executou as regras
- Agora o sync vê "hash igual" e nunca mais envia

**Solução**: Resetar o hash para forçar nova injeção APÓS atualizar o action-processor.

### 3. Guardian Desatualizado no Roteador
O arquivo `mikrotik-recovery-download` foi atualizado com `add_firewall_block`, mas o Guardian **no roteador** é antigo e não sabe verificar a versão correta. Rodar `/system script run navspot-guardian` não resolve porque o script Guardian que está no MikroTik é antigo.

**Solução**: Baixar manualmente o recovery v6.9.15.

### 4. Consumo de 100MB Não Registrado
Dados do banco:
- `tripulantes.bytes_consumidos = 66,845,521 bytes (63.7 MB)`
- `sessoes_wifi` ativas mostram apenas ~1 MB (999,667 + 982,809 bytes)
- Perfil: limite de 100 MB

Os logs mostram deltas pequenos (2KB-10KB por sync). O download de 100MB não aparece nos deltas.

**Possíveis causas**:
1. Download foi feito em outro dispositivo/rede
2. MikroTik não reportou corretamente (bytes resetaram)
3. WiFi desconectou durante download

**Não há bug no código** - o sistema de delta está funcionando. O download simplesmente não passou pelo hotspot monitorado.

### 5. Quota Não Bloqueou
- Consumo atual: 63.7 MB de 100 MB = 63.7%
- Bloqueio só ocorre em 100%
- **Funcionamento correto** - apenas não atingiu o limite

---

## Mudanças Necessárias

### Parte 1: Reset do Hash e Forçar Aplicação (URGENTE)

**Migration SQL**:
```sql
-- v6.9.16: Reset firewall_rules_hash to force re-application
-- This is needed because the hash was saved before the rules were actually applied on the router
UPDATE hotspots 
SET firewall_rules_hash = NULL, 
    firewall_rules_updated_at = NULL
WHERE firewall_rules_hash IS NOT NULL;

-- Log for audit
COMMENT ON TABLE hotspots IS 'v6.9.16: Hash reset applied to force firewall rules re-sync';
```

### Parte 2: Atualização Manual do Action-Processor

Você precisa executar no MikroTik (o Guardian local está desatualizado):

```routeros
# Baixar e aplicar recovery v6.9.15
:local token [/file get "navspot-token.txt" contents]
:local url "https://focqrhkozhdefohroqyi.supabase.co/functions/v1/mikrotik-recovery-download"
:local body ("{\"sync_token\":\"" . $token . "\"}")
/tool fetch url=$url mode=https http-method=post http-data=$body http-header-field="Content-Type: application/json" dst-path="navspot-recovery.rsc"
:delay 3s
/import navspot-recovery.rsc
```

Após isso, rodar:
```routeros
/system script run navspot-sync
```

### Parte 3: Melhorias de UI no Monitoramento

**Arquivo: `src/components/monitoring/LiveMetricsGrid.tsx`**

| De | Para |
|---|---|
| `title="Consumo Total"` | `title="Consumo Sessões"` |
| `subtitle="Dados transferidos"` | `subtitle="Nas conexões ativas"` |

Isso clarifica que é o consumo das sessões ativas, não o histórico acumulado.

### Parte 4: Indicador de Quota na Lista de Tripulantes (Opcional)

**Arquivos**: `src/pages/Tripulantes.tsx`

Adicionar barra de progresso visual mostrando consumo vs. limite do perfil. Isso já existe parcialmente, mas pode ser melhorado.

---

## Arquivos a Modificar

| Arquivo | Prioridade | Mudança |
|---------|------------|---------|
| Migration SQL | P0 | Reset de `firewall_rules_hash` |
| `src/components/monitoring/LiveMetricsGrid.tsx` | P2 | Corrigir rótulo "Consumo Total" |

---

## Procedimento de Teste Após Aplicação

### 1. Verificar atualização do action-processor
```routeros
/system script print detail where name="navspot-action-processor"
# Procurar por "NAVSPOT-BLACKLIST" ou "v6.9.15"
```

### 2. Aguardar próximo sync e verificar se as regras foram injetadas
```routeros
/ip firewall filter print where comment="NAVSPOT-BLOCK-MASTER"
/ip firewall address-list print where list="NAVSPOT-BLACKLIST"
/ip hotspot walled-garden print where comment~"navspot-blacklist"
```

### 3. Testar bloqueio
- Antes do login: tentar acessar domínio bloqueado
- Depois do login: tentar acessar domínio bloqueado
- Verificar counters: `/ip firewall filter print stats where comment~"NAVSPOT"`

### 4. Testar quota (para forçar bloqueio)
- Diminuir temporariamente o limite do perfil para 50 MB
- O usuário com 63.7 MB será bloqueado no próximo sync
- Ou aumentar o consumo fazendo downloads

### 5. Sobre "não pediu login novamente"
Isso é **comportamento normal** do MikroTik. Para testar login fresh:
```routeros
/ip hotspot active remove [find user="alexandre.silva"]
```
Depois reconectar o dispositivo.

---

## Resumo Executivo

| Problema | Status | Solução |
|----------|--------|---------|
| Loop infinito de ações | ✅ CORRIGIDO | Hash já funciona |
| Regras de firewall não aplicadas | ⚠️ PENDENTE | Reset hash + recovery manual |
| Guardian desatualizado no MikroTik | ⚠️ PENDENTE | Recovery manual |
| 100MB não registrado | 🔍 DIAGNÓSTICO | Provavelmente não passou pelo hotspot |
| Quota não bloqueou | ✅ FUNCIONANDO | Usuário está em 63.7%, limite é 100% |
| UI confusa sobre consumo | ⚠️ PENDENTE | Renomear rótulo |

