
## Objetivo
Corrigir dois problemas que o seu log evidencia:

1) **Bloqueio pós-login não efetivo**: `add_firewall_block|*.fb.com` está chegando, mas (a) o roteador pode estar com **action-processor antigo** (sem handler), e/ou (b) o domínio com wildcard (`*.fb.com`) não é um bom “match” para `content=`.

2) **Loop / repetição infinita**: o `mikrotik-sync` está **re-enviando as mesmas ações a cada sync** porque hoje estamos “injetando” ações a partir de `firewallRules` com ids `auto-*`, e esses ids **não entram no auto-mark-as-executed**, então a cada batimento o mesmo pipe volta a aparecer.

---

## Diagnóstico com base no código atual (o que está acontecendo de verdade)
### A. Por que o `add_firewall_block` pode não estar rodando no seu MikroTik
- O *bootstrap* (`mikrotik-script-generator`) já foi alterado para incluir `add_firewall_block`.
- Porém, o **recovery** (`mikrotik-recovery-download`) ainda está em **v6.9.12 e NÃO contém** o handler `add_firewall_block`.
- Se o seu roteador foi instalado/recuperado via `navspot-guardian` (ou recovery manual), ele pode estar rodando um `navspot-action-processor` antigo. Isso bate com o seu log: aparecem mensagens de walled-garden, mas não aparecem logs do tipo “Firewall block added”.

### B. Por que o loop acontece
- Em `mikrotik-sync`, nós:
  - Buscamos `firewallRules` da base (regras + listas)
  - **Convertimos isso em ações “auto-” e colocamos no pipe**
- Depois, o próprio `mikrotik-sync` só marca como executado no banco **ações que NÃO começam com `auto-`**.
- Resultado: as “auto-” não são “consumidas”, então são reenviadas sempre.

### C. Mesmo quando o handler existe, `content="*.fb.com"` não bloqueia de forma confiável
- `content=` faz match literal. O `*` não funciona como wildcard dentro de `content`.
- Para funcionar melhor, precisamos **normalizar** domínios (remover `*.` e `*`) antes de criar regras de firewall.

---

## Solução (v6.9.15) – o que vamos implementar
### 1) Parar a repetição infinita (sem perder a atualização automática das regras)
**Abordagem**: cache de “estado aplicado” por hotspot via hash.

- Adicionar na tabela `hotspots`:
  - `firewall_rules_hash` (text)
  - `firewall_rules_updated_at` (timestamptz)
- No `mikrotik-sync`:
  1. Montar `firewallRules` como hoje.
  2. Normalizar e ordenar as regras/domínios para gerar um **hash determinístico** (SHA-256).
  3. Se `hotspot.firewall_rules_hash !== novoHash`:
     - Injetar ações no pipe (walled-garden + firewall)
     - Atualizar `hotspots.firewall_rules_hash = novoHash` e `firewall_rules_updated_at = now()`
  4. Se o hash for igual: **não injeta nada** → fim do loop.

**Benefício**: você mantém a auto-sincronização baseada na “fonte da verdade” (regras/listas do banco), mas só envia pipe quando há mudança real.

---

### 2) Garantir que o action-processor do roteador tenha o handler atualizado (e que o Guardian detecte versão antiga)
Atualizar **dois lugares**, para nunca mais o recovery “voltar” para versão antiga:

- `supabase/functions/mikrotik-script-generator/index.ts`
- `supabase/functions/mikrotik-recovery-download/index.ts`

E atualizar o `navspot-guardian` para checar **conteúdo**, não só “existência”:
- Ele deve ler o source do script atual:
  - `/system script get [find name="navspot-action-processor"] source`
- Se não encontrar o trecho `add_firewall_block` (ou um marker de versão), ele marca `needsRepair=1` e baixa o recovery automaticamente.

**Resultado**: se o MikroTik estiver com action-processor antigo, o próprio Guardian vai consertar.

---

### 3) Trocar o `add_firewall_block` para um bloqueio pós-login mais robusto (Address-List + “master drop” antes do fasttrack)
Implementar no action-processor:
- Garantir a regra master (1 regra) antes do fasttrack:
  - `dst-address-list=NAVSPOT-BLACKLIST action=drop comment="NAVSPOT-BLOCK-MASTER"`
- Para cada `add_firewall_block|<domínio>`:
  1. **Sanitizar** domínio: remover `*` e prefixo `*.` para obter um hostname resolvível.
  2. Resolver IP via `:resolve`.
  3. Adicionar IP no `/ip firewall address-list` (list `NAVSPOT-BLACKLIST`) com comentário.
- (Opcional) manter o método antigo `content=` como fallback, mas o plano base é **Address-List** para melhor comportamento em HTTPS/apps.

**Observação realista**: IPs de CDN podem mudar. Mesmo assim, isso costuma ser mais efetivo do que `content=` para mobile/HTTPS. Numa v6.9.16 podemos evoluir para atualização periódica de IPs e/ou L7 consolidado.

---

### 4) (Recomendado) Corrigir o banco para aceitar os tipos de ações usados pelo app
Hoje existe um check constraint que só aceita:
`disable_user, enable_user, kick_session, update_password, update_profile, create_user, delete_user`

Isso está causando os erros `23514 ... acoes_pendentes_tipo_check` e faz com que várias features fiquem “meio quebradas”.

Vamos:
- Atualizar o constraint `acoes_pendentes_tipo_check` para incluir os tipos já usados no frontend e no sync (ex.: `remove_user`, `update_user_profile`, `add_user_profile`, `remove_user_profile`, `add_walled_garden`, `remove_walled_garden`, `add_firewall_filter`, `add_firewall_block`, `block_device`, `unblock_device`, etc.)
- Manter compatibilidade incluindo também os nomes antigos (`delete_user` e `update_profile`) se necessário.

---

## Arquivos que serão alterados
### Backend / Funções
- `supabase/functions/mikrotik-sync/index.ts`
  - Implementar hash por hotspot para parar repetição
  - Normalização de domínios antes de gerar ações
- `supabase/functions/mikrotik-script-generator/index.ts`
  - Atualizar action-processor: master rule + address-list + sanitização
  - Atualizar guardian para checar versão/marker e auto-reparar quando antigo
- `supabase/functions/mikrotik-recovery-download/index.ts`
  - Atualizar action-processor e sync script para bater com a versão nova

### Banco (migração)
- Adicionar colunas em `hotspots`: `firewall_rules_hash`, `firewall_rules_updated_at`
- Atualizar constraint `acoes_pendentes_tipo_check`

---

## Como você valida agora (comandos no RouterOS) – incluiremos no checklist de teste
### 1) Conferir se o action-processor tem o handler novo
- Ver conteúdo atual:
  - `/system script print detail where name="navspot-action-processor"`
- Procurar por `add_firewall_block` no source.

### 2) Verificar master rule e address list
- Master rule:
  - `/ip firewall filter print where comment="NAVSPOT-BLOCK-MASTER"`
- Address list:
  - `/ip firewall address-list print where list="NAVSPOT-BLACKLIST"`

### 3) Verificar walled-garden
- `/ip hotspot walled-garden print where comment~"navspot-blacklist"`

### 4) Teste funcional (antes e depois do login)
- Antes do login: tentar abrir domínio bloqueado → bloqueio via walled-garden
- Depois do login: tentar abrir novamente → bloqueio via firewall (master + address-list)
- Acompanhar counters:
  - `/ip firewall filter print stats where comment="NAVSPOT-BLOCK-MASTER"`

---

## Critérios de aceitação
1. O log do MikroTik deixa de mostrar “pending_actions_pipe extraído (2198 chars)” em todo sync; só aparece quando houver mudança nas regras.
2. Após instalar/recovery, o `navspot-action-processor` contém o handler `add_firewall_block`.
3. O MikroTik cria **1** regra master `NAVSPOT-BLOCK-MASTER` antes do fasttrack.
4. Ao receber `add_firewall_block|*.fb.com`, o script:
   - normaliza para `fb.com`
   - resolve IP
   - adiciona IP na `NAVSPOT-BLACKLIST`
5. Facebook/Netflix continuam bloqueados **após login** (dentro das limitações normais de CDN, mas com melhora visível).

---

## Risco / Mitigação
- **CDN/IP variável**: Address-list pode precisar de re-resolve periódico.
  - Mitigação: v6.9.16 pode incluir rotina de “refresh” de IPs (scheduler) ou estratégia L7 consolidada.
- **Hash marca como aplicado sem confirmação**: não temos ACK do roteador.
  - Mitigação: guardaremos `firewall_rules_updated_at` e adicionaremos logs no sync para auditar quando foi “entregue”.

---

## Próxima entrega após v6.9.15 (opcional)
- “refresh” automático de IPs bloqueados
- abordagem híbrida L7 consolidada (um único protocolo + uma única regra), com otimização de performance (já existe base conceitual no projeto)
