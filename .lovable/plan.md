

# Plano: NAVSPOT v7.1.37 - Corrigir Acesso via ether2 (Gerencia)

## Diagnostico do Problema

Analisando os logs e o codigo, identifiquei a causa raiz:

| Situacao | Estado de Fabrica | Apos NAVSPOT v7.1.36 |
|----------|-------------------|---------------------|
| ether2 | Na bridge padrao | Na bridge padrao (OK) |
| bridge padrao | IP 192.168.88.1 | **SEM IP** (PROBLEMA!) |
| bridge1 | Nao existe | IP 192.168.88.1 |
| DHCP defconf | Na bridge padrao | Na bridge padrao (mas sem IP!) |

O problema: o script cria bridge1 com o IP 192.168.88.1, mas a bridge padrao (onde ether2 ainda esta) fica sem IP. Resultado: o notebook conectado na ether2 nao consegue obter IP nem acessar o Winbox.

---

## Arquitetura Desejada

```text
+------------------+
|   MikroTik hAP   |
+------------------+
| ether1 (WAN)     | <-- Internet
| ether2 (MGMT)    | <-- IP DIRETO: 192.168.88.254/24
| ether3-5         | <-- bridge1 (Hotspot)
+------------------+
| bridge (padrao)  | <-- Manter (pode ficar vazia)
| bridge1 (navspot)| <-- IP 192.168.88.1/24 + Hotspot
+------------------+
```

### Solucao: Adicionar IP direto na ether2

Em vez de depender da bridge padrao, vamos dar um IP **diretamente** na interface ether2. Isso garante:
- Acesso Winbox sempre funciona
- Independente de bridges
- IP fixo conhecido: 192.168.88.254

---

## Mudancas Necessarias

### 1. Adicionar IP na ether2 (NOVA secao no bootstrap)

Inserir apos o cleanup e antes da criacao da bridge1:

```routeros
# 1.5. CONFIGURAR IP DE GERENCIA NA ETHER2
:do { /ip address remove [find interface=ether2 comment="navspot-mgmt"] } on-error={}
/ip address add address=192.168.88.254/24 interface=ether2 comment="navspot-mgmt"
:log info "NAVSPOT: IP de gerencia 192.168.88.254 configurado na ether2"
```

### 2. Garantir que ether2 NAO esteja em nenhuma bridge

Adicionar no cleanup:

```routeros
:do { /interface bridge port remove [find interface=ether2] } on-error={}
```

Isso remove ether2 de qualquer bridge (padrao ou outra), garantindo que o IP direto funcione.

### 3. Ajustar comentario da regra Winbox

Atualizar log para indicar o IP de gerencia.

---

## Resumo das Mudancas

| Item | v7.1.36 | v7.1.37 |
|------|---------|---------|
| ether2 na bridge padrao | Sim (problema) | Removida da bridge |
| IP direto na ether2 | Nao | 192.168.88.254/24 |
| Acesso Winbox | Falha | Funciona via 192.168.88.254 |

---

## Secao Tecnica

### Arquivo: supabase/functions/mikrotik-script-generator/index.ts

#### 1. Atualizar VERSION

Linha ~10:
```typescript
const VERSION = "7.1.37"
```

#### 2. Adicionar remocao de ether2 de bridges no CLEANUP (apos linha 308)

```routeros
:do { /interface bridge port remove [find interface=ether2] } on-error={}
```

#### 3. Adicionar configuracao de IP na ether2 (apos validacao WAN, antes de DNS)

Nova secao entre passos 1 e 2:

```routeros
# 1.5. CONFIGURAR IP DE GERENCIA NA ETHER2
:do { /ip address remove [find interface=ether2] } on-error={}
/ip address add address=192.168.88.254/24 interface=ether2 comment="navspot-mgmt"
:log info "NAVSPOT: IP de gerencia 192.168.88.254 configurado na ether2"
```

### Arquivos a Atualizar

1. supabase/functions/mikrotik-script-generator/index.ts
   - VERSION = "7.1.37"
   - Adicionar remocao de ether2 de bridges
   - Adicionar IP 192.168.88.254 na ether2

2. supabase/functions/mikrotik-scripts/index.ts
   - VERSION = "7.1.37"

3. src/pages/Embarcacoes.tsx
   - defaultScriptVersion = "7.1.37"

---

## Resultado Esperado

1. Admin conecta notebook na ether2
2. Notebook recebe/configura IP na faixa 192.168.88.x
3. Admin acessa Winbox via 192.168.88.254:8291
4. Hotspot funciona normalmente na bridge1 (192.168.88.1)
5. Ambas as redes coexistem sem conflito

### Logs Esperados

```text
NAVSPOT v7.1.37: Iniciando bootstrap ULTRA-THIN...
NAVSPOT v7.1.37: Cleanup concluido
NAVSPOT: IP de gerencia 192.168.88.254 configurado na ether2
NAVSPOT: Interface WAN (ether1) validada
...
NAVSPOT v7.1.37: INSTALACAO CONCLUIDA!
```

---

## Instrucoes de Acesso pos-Instalacao

Apos rodar o script v7.1.37, o administrador deve:

1. Conectar notebook na **porta 2** do hAP ax2
2. Configurar IP manual: 192.168.88.100 (ou usar DHCP se disponivel)
3. Acessar Winbox: **192.168.88.254:8291**

Alternativamente, usar MAC Winbox (Neighbors) que funcionara independente de IP.

