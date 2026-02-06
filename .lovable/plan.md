

# Plano: NAVSPOT v7.1.38 - Reverter para Arquitetura Estável do v7.1.29

## Análise Comparativa: v7.1.29 vs v7.1.37

Analisei detalhadamente o script v7.1.29 (que funcionava) contra o código atual v7.1.37 e identifiquei as mudanças que quebraram o acesso de gerência.

### Diferenças Críticas no CLEANUP

| Script | Comando | Efeito |
|--------|---------|--------|
| v7.1.29 | (não existe) | ether2 permanece intocada na bridge padrão |
| v7.1.37 | `/interface bridge port remove [find interface=ether2]` | **REMOVE** ether2 de qualquer bridge! |
| v7.1.37 | `/ip address remove [find interface=ether2]` | Remove IPs existentes da ether2 |

### Diferenças Críticas pós-Validação WAN

| Script | Seção | Resultado |
|--------|-------|-----------|
| v7.1.29 | Pula direto para DNS | ether2 continua funcionando normalmente |
| v7.1.37 | Seção "1.5. IP DE GERENCIA" | Adiciona 192.168.88.254/24 na ether2 |

### O Problema Real

1. No **estado de fábrica** do MikroTik, a ether2 está na bridge padrão que tem DHCP server
2. O v7.1.37 **remove** ether2 da bridge padrão (linha 312)
3. Depois tenta adicionar IP estático (linha 326)
4. Porém, como o hotspot usa a MESMA rede (192.168.88.0/24), há conflito de roteamento
5. O notebook perde conectividade porque:
   - O DHCP padrão continua na bridge (que agora não inclui ether2)
   - O IP 192.168.88.254 está "solto" na ether2 sem DHCP para entregar IP ao notebook

---

## Solução: Reverter ao Comportamento do v7.1.29

A solução mais segura é **remover completamente** as modificações de ether2 e voltar exatamente ao comportamento do v7.1.29 que não tocava na porta de gerência.

### Mudanças a Fazer (v7.1.38)

#### 1. REMOVER do CLEANUP (linhas 311-313)

Deletar estas linhas que foram adicionadas no v7.1.37:

```text
# v7.1.37: Remover ether2 de qualquer bridge para IP direto
:do { /interface bridge port remove [find interface=ether2] } on-error={}
:do { /ip address remove [find interface=ether2] } on-error={}
```

#### 2. REMOVER seção "1.5. IP DE GERENCIA" (linhas 325-327)

Deletar estas linhas adicionadas no v7.1.37:

```text
# 1.5. CONFIGURAR IP DE GERENCIA NA ETHER2 (v7.1.37)
/ip address add address=192.168.88.254/24 interface=ether2 comment="navspot-mgmt"
:log info "NAVSPOT: IP de gerencia 192.168.88.254 configurado na ether2"
```

#### 3. Atualizar VERSION para 7.1.38

---

## Resumo das Mudanças

| Item | v7.1.29 (funcionava) | v7.1.37 (quebrado) | v7.1.38 (fix) |
|------|---------------------|-------------------|---------------|
| Modifica ether2 | NÃO | SIM (remove da bridge) | NÃO |
| IP em ether2 | Herda da bridge padrão | 192.168.88.254 (conflito) | Herda da bridge padrão |
| DHCP para notebook | Funciona | Quebrado | Funciona |
| Winbox | Funciona | Desconecta | Funciona |

---

## Arquivos a Modificar

### 1. supabase/functions/mikrotik-script-generator/index.ts

- Linha 8: VERSION = "7.1.38"
- Linhas 311-313: REMOVER (cleanup de ether2)
- Linhas 325-327: REMOVER (IP fixo na ether2)

### 2. supabase/functions/mikrotik-scripts/index.ts

- VERSION = "7.1.38"

### 3. src/pages/Embarcacoes.tsx

- defaultScriptVersion = "7.1.38"

---

## Seção Técnica: Script Resultante (v7.1.38)

O script v7.1.38 será **idêntico** ao v7.1.29 na parte de gerência, com as melhorias de detecção de versão ROS e timestamps únicos mantidas.

### Estrutura do Bootstrap v7.1.38

```text
# 0. CLEANUP
  - Remove arquivos, scripts, schedulers
  - Remove hotspot, pools, addresses com comment="navspot"
  - Remove bridge1
  - *** NÃO TOCA NA ETHER2 ***

# 1. VALIDACAO WAN
  - Verifica se ether1 existe
  - *** PULA DIRETO PARA DNS (sem seção 1.5) ***

# 2. CONFIGURAR DNS
# 3. CONFIGURAR WAN (DHCP)
# 4. IDENTIDADE
# 5. CRIAR BRIDGE1
# 6. CONFIGURAR REDE (192.168.88.0/24 na bridge1)
# 7. NAT
# 8. GERENCIA WINBOX (regras firewall para ether2)
# 9. MIGRAR PORTAS LAN (ether3, ether4, ether5 → bridge1)
# 10. HOTSPOT MINIMO
# 11. TOKEN
# 12. AGUARDAR ESTABILIZACAO
# 13. DETECTAR ROS (v7.1.36)
# 14. FETCH + IMPORT
# 15. PRIMEIRO SYNC
```

### Por que funciona

1. **ether2 continua na bridge padrão** do MikroTik
2. Bridge padrão mantém DHCP server defconf
3. Notebook conectado na porta 2 recebe IP normalmente
4. Winbox continua acessível durante todo o processo

---

## Resultado Esperado

### Logs de Instalação

```text
NAVSPOT v7.1.38: Iniciando bootstrap ULTRA-THIN...
NAVSPOT v7.1.38: Limpando instalacoes anteriores...
NAVSPOT v7.1.38: Cleanup concluido
NAVSPOT: Interface WAN (ether1) validada
NAVSPOT: DNS configurado (8.8.8.8, 1.1.1.1)
...
NAVSPOT v7.1.38: BOOTSTRAP ULTRA-THIN CONCLUIDO!
```

### Estado Final

- Notebook na porta 2: IP via DHCP da bridge padrão (continua funcionando)
- Winbox: Conectado durante toda instalação
- Hotspot: Funcionando na bridge1 (ether3-5)
- Gerência: ether2 intocada, regras de firewall permitindo Winbox/MNDP

---

## Rollback

Se precisar voltar à versão anterior:
1. VERSION = "7.1.37" nos 3 arquivos
2. Reimplantar Edge Functions
3. (não recomendado - v7.1.37 quebra gerência)

---

## Observação Importante

O problema real é que o hotspot está usando a rede 192.168.88.0/24, que é a mesma rede de fábrica do MikroTik. Isso funciona no v7.1.29/v7.1.38 porque não mexemos na configuração padrão da bridge/ether2. 

Para uma solução definitiva no futuro, recomendo:
1. Mudar a rede padrão do hotspot para 10.10.10.0/24 (frontend)
2. Adicionar validação para bloquear 192.168.88.0/24 como rede de hotspot

Mas isso é uma melhoria futura - a prioridade agora é restaurar o funcionamento.

