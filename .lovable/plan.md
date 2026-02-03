

## Objetivo
Restaurar a abertura automática do portal cativo no Android (sem ficar preso no aviso “sem acesso à internet”) e eliminar o “timeout antes do redirecionamento” no login, garantindo que:
1) o cliente consiga **carregar o portal externo** antes de autenticar; e  
2) o modo **bloquear_tudo (whitelist)** não derrube o tráfego pré-login.

---

## O que está acontecendo (diagnóstico com base no código atual)
Hoje o RouterOS pode estar ficando “sem saída” porque o nosso mecanismo de whitelist cria uma regra **global** de bloqueio no firewall:

- No script do action-processor (v6.9.21), quando chega a ação `add_firewall_allow`, ele cria:
  - `NAVSPOT-ALLOW-ACCEPT` (accept apenas para `dst-address-list=NAVSPOT-ALLOWED`)
  - `NAVSPOT-ALLOW-MASTER` (**drop sem condição nenhuma**, chain=forward)

Isso significa: **se a lista `NAVSPOT-ALLOWED` estiver vazia/incompleta (ou ainda não populada)**, o roteador passa a derrubar praticamente todo tráfego “forward” dos clientes — inclusive o tráfego necessário para o Android fazer o flow de captive portal e abrir a tela de autenticação. Resultado típico no Android: aparece “esta rede não tem acesso à internet” e o portal não abre.

Esse efeito também explica o seu cenário de “abria e depois parou”: assim que o DROP master entrou (ou voltou a ficar ativo), a rede aparenta “morta” para os clientes.

---

## Evidências no repositório
No `supabase/functions/mikrotik-recovery-download/index.ts`, dentro do action processor embutido, existe:

- criação de `NAVSPOT-ALLOW-MASTER` com:
  ```routeros
  /ip firewall filter add chain=forward action=drop comment="NAVSPOT-ALLOW-MASTER" ...
  ```
  sem qualquer filtro (hotspot auth/unauth, interface, etc).

E no script generator (`supabase/functions/mikrotik-script-generator/index.ts`) o mesmo padrão é gerado.

---

## Estratégia de correção (mudança de arquitetura mínima e segura)
### A. Corrigir o escopo do “DROP master” (whitelist) para não afetar pré-login
Em vez de derrubar **tudo** no `chain=forward`, vamos garantir que as regras de whitelist (ACCEPT/DROP) se apliquem **somente ao tráfego de clientes autenticados no hotspot**.

Opções técnicas (vamos implementar a mais compatível com RouterOS 6/7):

1) **Preferida**: mover o controle para as chains do Hotspot (ex.: `hs-auth`)  
   - Isso faz com que o bloqueio whitelist não interfira no captive portal/redirect pré-login.
2) Alternativa: manter em `chain=forward`, mas adicionar matcher do hotspot (ex.: `hotspot=auth`) e/ou limitar por interface LAN/WAN.

Na implementação, vou:
- Ajustar `NAVSPOT-ALLOW-ACCEPT` e `NAVSPOT-ALLOW-MASTER` para trabalharem **somente em tráfego auth** (hotspot), eliminando o “mata tudo” pré-login.
- Adicionar “auto-heal”: se existir regra antiga `NAVSPOT-ALLOW-MASTER` sem escopo, o script corrige (set/remove+recreate) para a versão segura.

### B. Completar o Walled Garden essencial no Recovery
O bootstrap script (script-generator) já tem DNS UDP/TCP + ICMP no walled garden. O Recovery recém-atualizado adicionou DNS UDP, DHCP e NTP, mas ainda faltam itens que podem ajudar na robustez (ex.: DNS TCP e ICMP) em cenários reais.

Vou padronizar o Recovery para ficar alinhado com o bootstrap:
- adicionar DNS TCP 53
- adicionar ICMP
- manter cache-control no download (já existe)
- padronizar “version string” para não gerar dúvida visual

### C. Tirar a dúvida de versão (consistência)
Atualmente o Recovery **contém** o log final “v6.9.22”, mas o cabeçalho e logs iniciais ainda dizem “v6.9.21”, e os logs do backend também registram “Generating recovery v6.9.21…”. Isso confunde.

Vou:
- atualizar os textos/logs do backend para refletirem a versão real
- opcionalmente colocar a versão no nome do arquivo (ex.: `navspot-recovery-v6.9.23.rsc`) para ficar impossível baixar “o errado” sem perceber
- (se fizer sentido) ajustar o modal do painel para exibir essa versão de forma clara

---

## Mudanças planejadas (arquivos)
### 1) `supabase/functions/mikrotik-recovery-download/index.ts`
- Bump de versão (ex.: v6.9.23)
- Ajustar logs “Generating recovery…” e cabeçalhos para a versão correta
- Recovery: completar walled garden IP com DNS TCP + ICMP
- Principal: **corrigir a lógica do action processor** para:
  - criar `NAVSPOT-ALLOW-*` com escopo de hotspot auth (ou chain correta)
  - auto-corrigir regras antigas existentes (evitar que um roteador “quebrado” continue quebrado após importar)

### 2) `supabase/functions/mikrotik-script-generator/index.ts`
- Atualizar o action processor embutido com a mesma correção do item acima (para novas instalações/gerações de script)
- Garantir consistência de versão/strings se exibidas ao usuário

(Se necessário para clareza visual)
### 3) `src/components/modals/ScriptModal.tsx` e/ou `src/hooks/useHotspots.ts`
- Exibir versão do recovery no UI e/ou baixar com filename contendo a versão

---

## Plano de validação (passo a passo)
### Validação rápida no MikroTik (confirmação da causa raiz)
Antes (ou enquanto) implementamos, você consegue confirmar em 30s com um teste:

1) No MikroTik, rode:
```routeros
/ip firewall filter print where comment~"NAVSPOT-ALLOW"
```
2) Se existir `NAVSPOT-ALLOW-MASTER`, **desabilite temporariamente** e teste conectar no Android:
```routeros
/ip firewall filter disable [find comment="NAVSPOT-ALLOW-MASTER"]
```

Se o portal voltar a abrir após isso, confirma 100% que o DROP master sem escopo é o vilão.

### Depois da correção (quando implementado)
1) Baixar o novo Recovery no painel (arquivo com versão no nome)
2) Importar no MikroTik:
```routeros
/import navspot-recovery-v6.9.23.rsc
```
3) Validar no MikroTik:
```routeros
/ip firewall filter print where comment~"NAVSPOT-ALLOW"
```
Esperado: as regras de whitelist não podem ser “drop-all” genéricas; devem ter escopo de hotspot auth/chain correta.

4) Validar walled garden:
```routeros
/ip hotspot walled-garden print where comment~"navspot"
/ip hotspot walled-garden ip print where comment~"navspot"
```
5) Teste end-to-end no Android:
- conectar no Wi-Fi
- portal abrir
- login concluir sem timeout e redirecionar corretamente

---

## Riscos e cuidados
- Essa mudança mexe no “modo bloqueio total (whitelist)”. Vamos manter o comportamento pós-login igual (bloquear tudo exceto permitido), mas **sem matar o tráfego pré-login**.
- Vamos restringir as alterações apenas às regras com comentários `NAVSPOT-*` para não tocar em firewall do cliente fora do escopo.

---

## Resultado esperado
- Android deixa de travar em “sem internet” sem abrir portal
- Portal abre de forma consistente
- Login deixa de “timeout antes do redirecionamento” porque o backend/portal volta a ser alcançável no pré-login
- Whitelist continua funcionando pós-login, mas sem quebrar o captive portal

