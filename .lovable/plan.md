

# Plano v7.1.48: Auto-Timeout de Lock (Correção Cirúrgica)

## Diagnóstico Completo do Deadlock

### O que causou o travamento?

Analisando o código do `generateSyncSource()` (linhas 730-823):

```text
Fluxo do script:
Linha 736: :set navspotSyncLock "1"    ← Lock adquirido
Linha 773-775: /tool fetch ...         ← Fetch com on-error reset
Linha 776-821: Processamento           ← SEM reset em caso de erro
Linha 822: :set navspotSyncLock "0"    ← Reset só aqui
```

**Problema:** Se qualquer erro ocorrer entre as linhas 776-821, o script é interrompido e **nunca chega na linha 822**.

### Linha do tempo do incidente:

```text
1. v7.1.46 é deployada com login-by="cookie,http-pap" (aspas)
2. MikroTik faz sync → baixa action-processor v7.1.46
3. Action-processor executa configure_hotspot_profile
4. Comando: /ip hotspot profile set $hp login-by="cookie,http-pap"
5. RouterOS: "input does not match any value of value-name"
6. Script interrompido na linha 813 (dentro do bloco do AP)
7. Linha 822 nunca executada → Lock permanece "1"
8. Todos syncs seguintes: "NAVSPOT-SYNC: locked" → retorna
9. Hotspot fica "Offline" (última_sincronização não atualiza)
```

---

## Solução: Auto-Timeout de Lock (Mínima Invasão)

### Princípio: Não mexer no que funciona

A lógica atual de sync está correta - apenas falta um mecanismo de recuperação de falhas. Vamos adicionar um timeout SEM alterar a estrutura existente.

### Código a modificar

**Arquivo:** `supabase/functions/mikrotik-scripts/index.ts`
**Função:** `generateSyncSource()` (linhas 732-736)

**ANTES (linhas 732-736):**
```routeros
:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ($navspotSyncLock="1") do={:log info "NAVSPOT-SYNC: locked";:return}
:set navspotSyncLock "1"
```

**DEPOIS:**
```routeros
:log info "NAVSPOT-SYNC v${VERSION}"
:global navspotSyncLock
:global navspotSyncLockTime
:if ([:len $navspotSyncLock]=0) do={:set navspotSyncLock "0"}
:if ([:len $navspotSyncLockTime]=0) do={:set navspotSyncLockTime 0}
:local ct ([/system clock get time])
:local cs (([:pick $ct 0 2]*3600)+([:pick $ct 3 5]*60)+([:pick $ct 6 8]))
:if ($navspotSyncLock="1") do={
:local la ($cs - $navspotSyncLockTime)
:if ($la < 0) do={:set la ($la + 86400)}
:if ($la > 300) do={
:log warning "NAVSPOT-SYNC: lock expirado (age=".$la."s), resetando"
:set navspotSyncLock "0"
} else={
:log info "NAVSPOT-SYNC: locked"
:return
}}
:set navspotSyncLock "1"
:set navspotSyncLockTime $cs
```

### Lógica do timeout:

```text
1. Armazena timestamp quando adquire o lock
2. Se encontrar lock ativo:
   a. Calcula idade do lock (agora - lockTime)
   b. Trata virada de meia-noite (adiciona 86400 se negativo)
   c. Se idade > 300 segundos (5 min): reseta e continua
   d. Se idade <= 300 segundos: respeita lock e retorna
```

---

## Por que 5 minutos?

- Sync normal demora < 10 segundos
- Intervalo entre syncs: 1 minuto
- 5 minutos = margem ampla para operações lentas
- Tempo suficiente para garantir que não há execução real em andamento

---

## Análise de Tamanho (Limite 3.2KB)

| Componente | Atual | Novo | Delta |
|------------|-------|------|-------|
| Header + lock check | ~180 bytes | ~450 bytes | +270 bytes |
| Resto do sync | ~2620 bytes | ~2620 bytes | 0 |
| **Total** | ~2800 bytes | ~3070 bytes | +270 bytes |

**3070 bytes < 3200 bytes** ✓ Dentro do limite seguro.

---

## O que NÃO será modificado

Para minimizar risco de regressão, estas partes permanecem intactas:

| Componente | Linhas | Status |
|------------|--------|--------|
| Coleta de telemetria (hlb, hlu) | 752-762 | Não modificar |
| Construção do JSON body | 763 | Não modificar |
| Fetch + parse de resposta | 772-790 | Não modificar |
| Escrita do arquivo de ações | 791-806 | Não modificar |
| Execução do action-processor | 807-818 | Não modificar |
| Reset do lock no final | 822 | Não modificar |

---

## Arquivos Modificados

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `mikrotik-scripts/index.ts` | Lock timeout + VERSION 7.1.48 | Baixo |
| `mikrotik-sync/index.ts` | VERSION 7.1.48-http-pap | Nenhum |
| `mikrotik-script-generator/index.ts` | VERSION 7.1.48 | Nenhum |
| `mikrotik-recovery-download/index.ts` | VERSION 7.1.48 | Nenhum |
| `src/pages/Embarcacoes.tsx` | VERSION 7.1.48 | Nenhum |

---

## Fluxo Após Deploy

```text
1. MikroTik tem lock travado desde 16:21 (3+ horas)

2. Scheduler dispara sync às 19:50
   - navspot-sync detecta: navspotSyncLock="1"
   - Calcula: lockAge = 3h+ = 10800s > 300s
   - Log: "NAVSPOT-SYNC: lock expirado (age=10800s), resetando"
   - navspotSyncLock = "0"
   - Continua execução normal

3. Sync executa:
   - Telemetria coletada (login-by, login-url)
   - Fetch para backend
   - Backend detecta usuário faltando
   - Retorna ações: create_profile + create_user

4. Action-processor (v7.1.47 com sintaxe correta):
   - /ip hotspot user profile add ...
   - /ip hotspot user add name="alexandre.silva" password="048706"
   - OK!

5. Lock resetado normalmente na linha 822
   - Log: "NAVSPOT-SYNC v7.1.48: OK"

6. Hotspot volta ONLINE
   - ultima_sincronizacao atualizada
   - Frontend mostra status verde
```

---

## Validação Pós-Deploy

### No MikroTik:

```routeros
# Verificar logs após próximo sync
/log print where message~"NAVSPOT-SYNC"
# Esperado: "lock expirado...resetando" seguido de "OK"

# Verificar se usuário foi recriado
/ip hotspot user print where name="alexandre.silva"
# Esperado: usuário com profile correto

# Verificar variáveis globais
:put $navspotSyncLock
# Esperado: "0"

:put $navspotSyncLockTime
# Esperado: timestamp do último sync bem-sucedido
```

### No Painel:

```text
Página Embarcações:
- Status: ONLINE (verde)
- Última sincronização: < 2 minutos atrás
```

---

## Prevenção de Futuros Deadlocks

O timeout de 5 minutos garante que:

1. **Erros de sintaxe** (como v7.1.46) não causam locks permanentes
2. **Falhas de rede** durante processamento são recuperadas
3. **Crashes do script** por qualquer motivo têm auto-heal
4. **Reinícios do roteador** (variável perde valor) funcionam normalmente

---

## Alternativa: Reset Manual Imediato

Se preferir não esperar o deploy, execute no MikroTik:

```routeros
:global navspotSyncLock "0"
/system script run navspot-sync
```

Isso destrava imediatamente. O deploy do v7.1.48 previne que isso aconteça novamente.

