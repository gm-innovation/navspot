

## Objetivo

Tornar a instalação/atualização do MikroTik resiliente a:
- reboot inesperado / queda de energia durante instalação
- truncamento/instabilidade em operações longas
- perda pontual do script `navspot-sync` (ou scheduler apontando para script ausente), que leva o hotspot a ficar “Offline” no painel por parar de atualizar `ultima_sincronizacao`

A meta é que o roteador “se cure sozinho” quando detectar que o `navspot-sync` sumiu, sem exigir intervenção manual e sem arriscar apagar um script funcional durante updates.

---

## Diagnóstico (confirmado no código)

Hoje o bootstrap gerado em `supabase/functions/mikrotik-script-generator/index.ts` faz:

1) **Limpeza destrutiva** (remove scripts/scheduler logo no começo):
- remove `navspot-sync`, `navspot-action-processor` e `navspot-sync-scheduler` (linhas ~504–506 do trecho visto)

2) **Padrão frágil de update** para scripts:
- “se existe → remove; depois add” para `navspot-action-processor` e `navspot-sync` (linhas ~595–610 do trecho visto)

Isso cria uma janela de falha clássica:
- Se ocorrer reboot/queda de energia **entre o remove e o add**, o roteador volta sem o script (scheduler pode existir, apontando para item inexistente), e o painel fica “Offline”.

Além disso, hoje não existe mecanismo de **integridade/self-healing** no RouterOS (não há `navspot-health`/guardian).

---

## Mudança proposta (v6.9.12) – visão geral

### A) “Safe update” (nunca remover antes de garantir que a versão nova foi gravada)
Trocar o padrão remove→add por **set-or-add**:
- Se o script existe → `/system script set ... source={...} policy=...`
- Se não existe → `/system script add ...`

Mesmo princípio para o scheduler:
- se existe → `set`
- se não existe → `add`

E, na limpeza inicial, **parar de remover `navspot-sync`/`navspot-action-processor`/`navspot-sync-scheduler`** (ou mover qualquer remoção para um modo de “instalação do zero” explicitamente separado), porque isso aumenta muito a chance de ficar “vazio” se algo interromper no meio do bootstrap.

Resultado: se o bootstrap falhar, pelo menos a última versão funcional tende a sobreviver.

---

### B) Auto-recuperação no RouterOS (script “guardian” + scheduler de startup)

Adicionar 1 script pequeno e um scheduler:
- `navspot-guardian` (pequeno, resistente, criado cedo no bootstrap)
- `navspot-guardian-scheduler` (start-time=startup; intervalo curto como 5m ou 10m)

Função:
1. Verificar se existem:
   - `/system script find name="navspot-sync"`
   - `/system script find name="navspot-action-processor"`
   - `/system scheduler find name="navspot-sync-scheduler"`
2. Se estiver faltando algo:
   - logar claramente: `NAVSPOT-GUARDIAN: missing navspot-sync` etc
   - tentar reparar automaticamente

Estratégia de reparo (em ordem):
- **Opção 1 (preferida):** baixar um arquivo de reparo do backend via `/tool fetch` (com `sync_token`) e executar `/import` desse arquivo.
- **Opção 2 (fallback):** se existir um arquivo local de reparo no `/file`, importar do local.

Controles para evitar loop:
- lock global (`:global navspotGuardianLock`)
- “cooldown” por timestamp (ex.: `:global navspotLastRepair`) para não tentar reparar toda hora

Importante: o arquivo de reparo deve ser **minimalista**, repondo apenas scripts/schedulers, sem refazer bridge/DHCP/NAT, para não derrubar rede de produção durante uma “auto-cura”.

---

### C) Endpoint de download do “recovery.rsc” no backend (para /tool fetch)

Criar uma nova função de backend (sem exigir login) baseada em `sync_token`:

- Nome sugerido: `mikrotik-recovery-download` (ou `mikrotik-bootstrap-download` se você quiser servir também o bootstrap completo, mas o ideal é um recovery minimalista)
- `verify_jwt = false` no `supabase/config.toml` (igual às outras)
- Aceitar:
  - `POST` com JSON `{ "sync_token": "..." }` (mais robusto que query-string)
  - e opcionalmente `GET ?sync_token=...` para facilitar testes
- Buscar o hotspot pelo `sync_token` e montar um `.rsc` que:
  - garante `navspot-action-processor` e `navspot-sync` via set-or-add
  - garante `navspot-sync-scheduler` via set-or-add
  - não mexe em bridge, DHCP, NAT, walled garden etc

Resposta:
- `Content-Type: text/plain; charset=utf-8`
- `Cache-Control: no-store`
- logs com prefixo `[mikrotik-recovery-download]` e token mascarado (exibir só prefixo/sufixo)

---

### D) Melhorar diagnóstico do endpoint de sync (evitar 500 “enganoso”)

No `supabase/functions/mikrotik-sync/index.ts`:
- Se `req.method === 'GET'` → retornar 200 `"ok"` (healthcheck simples)
- Se `POST` mas `req.json()` falhar → retornar 400 `"invalid json"`
- Manter `OPTIONS` CORS

Isso evita que o técnico conclua “backend caiu” quando na verdade foi apenas um teste GET/POST sem body válido.

---

### E) Ajuste de UX no ScriptModal (reduzir o caminho “frágil”)

Em `src/components/modals/ScriptModal.tsx`:
- Desencorajar o botão **“Copiar Script”** (muito grande) com aviso visível: “Não recomendado (pode truncar no terminal)”
- Priorizar sempre:
  - Download `.rsc`
  - Import via `/import navspot-bootstrap.rsc`
- Opcional: adicionar uma seção “Recuperação pós-reboot” explicando rapidamente que existe auto-reparo e como validar (`/system script print`, `/system scheduler print`, `/log print where message~"NAVSPOT"`)

---

## Sequência de implementação (ordem para reduzir risco)

1) **Atualizar `mikrotik-script-generator`** para set-or-add + remover “remove scripts” do bloco de limpeza
   - (isso sozinho já reduz muito o risco de ficar “sem sync” por reboot no meio)

2) **Criar `mikrotik-recovery-download`** (função backend pública por token)

3) **Adicionar `navspot-guardian` + scheduler** ao bootstrap gerado
   - garantir que o guardian é criado antes dos scripts grandes
   - guardian chama recovery-download se detectar falta

4) **Ajustar `mikrotik-sync`** para healthcheck GET + 400 em JSON inválido

5) **Atualizar `ScriptModal`** para reduzir incentivo ao copy/paste do bloco gigante

---

## Testes de aceitação (cenários reais)

1) Instalação normal:
- Gerar script no painel, baixar `.rsc`, importar
- Confirmar:
  - `/system script print where name~"navspot"`
  - `/system scheduler print where name~"navspot"`
  - painel: `ultima_sincronizacao` atualizando e status “Online”

2) Simular falha clássica:
- Remover manualmente apenas `navspot-sync`:
  - `/system script remove [find name="navspot-sync"]`
- Reiniciar roteador
- Esperado:
  - guardian detecta falta
  - baixa/importe recovery
  - `navspot-sync` volta a existir
  - painel volta a “Online” dentro do intervalo

3) Teste de diagnóstico:
- Fazer GET no endpoint do sync
- Esperado: 200 “ok” (sem 500)

---

## Observações importantes (trade-offs)

- O recovery via `/import` precisa ser minimalista para não causar indisponibilidade; por isso o endpoint de “recovery.rsc” deve recriar apenas scripts/schedulers.
- Mesmo que o RouterOS tenha bugs/edge cases de persistência, o guardian reduz o MTTR: mesmo se perder script, ele volta sozinho.
- O “safe update” (set-or-add) elimina o maior risco arquitetural atual: apagar um script funcional antes de garantir o novo.

---

## Arquivos envolvidos (para referência)

Backend:
- `supabase/functions/mikrotik-script-generator/index.ts` (alterar)
- `supabase/functions/mikrotik-sync/index.ts` (alterar)
- `supabase/functions/mikrotik-recovery-download/index.ts` (novo)
- `supabase/config.toml` (registrar nova função)

Frontend:
- `src/components/modals/ScriptModal.tsx` (alterar)

