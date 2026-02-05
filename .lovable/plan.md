
## Diagnóstico (baseado no seu print + validação no backend)
O seu MikroTik está conseguindo baixar e instalar os scripts (v7.1.19), porém o **navspot-sync falha no FETCH** porque o endpoint que ele chama **não existe no backend neste momento**.

Eu confirmei isso de duas formas:
1) Pelos logs do backend: requisições **POST** para `.../functions/v1/mikrotik-sync` retornando **HTTP 404** (“Requested function was not found”).
2) Pelo teste direto do backend: chamada `GET /mikrotik-sync` retornou **404**.

Ou seja: não é problema de DNS/TLS no MikroTik agora; é **função não publicada/deployada**.

Além disso, identifiquei que **várias outras funções do backend também estão 404** (ex.: `mikrotik-config-update`, `mikrotik-recovery-download`, `hotspot-login`, `list-users`, etc.). Hoje, parecem estar ativas apenas `mikrotik-scripts` e `mikrotik-script-generator` (as que nós deployamos recentemente).

---

## Objetivo
1) **Disponibilizar (deploy) as funções do backend** necessárias para o fluxo MikroTik + painel admin.
2) Confirmar que o MikroTik passa a receber resposta 200 do `mikrotik-sync` e que o sync volta a marcar hotspot como Online.

---

## Implementação (o que vou fazer após sua aprovação)
### 1) Deploy das funções do backend que estão 404
Vou executar deploy explícito das funções (já existentes no código) para que deixem de retornar “Requested function was not found”:

- `mikrotik-sync` (crítica: sync do hotspot)
- `mikrotik-recovery-download` (guardian/recovery)
- `mikrotik-config-update` (ações do painel para aplicar mudanças no MikroTik)
- `hotspot-login`
- `hotspot-portal-config`
- `list-users`
- `create-user`
- `update-user`
- `delete-user`
- `tripulante-self-register`
- `send-alert-notification`
- `auto-resolve-alerts`

Motivo: todas aparecem configuradas no `supabase/config.toml` com `verify_jwt = false`, mas atualmente estão **não encontradas** em runtime.

### 2) Validação técnica imediata (sem depender do MikroTik)
Depois do deploy, vou validar que **não há mais 404** chamando cada função pelo backend:

- `GET /mikrotik-sync` deve retornar **200** (healthcheck JSON).
- `GET /mikrotik-recovery-download` deve retornar **400** (faltando parâmetros), mas **não 404**.
- `POST /mikrotik-config-update` sem token deve retornar **401**, mas **não 404**.
- `GET /hotspot-login`, `GET /list-users` etc. devem retornar **401/405/400** conforme esperado, mas **não 404**.

Se algum deploy falhar, vou:
- Checar o erro de build/deploy da função específica
- Ajustar o código (se necessário) e redeployar até ficar “resolvível” (sem 404)

### 3) Validação no MikroTik (roteiro que você executa)
Sem precisar reimportar (mas pode reimportar se preferir limpar o ciclo), o mais rápido é:

```routeros
/system script run navspot-sync
/log print where message~"NAVSPOT-SYNC" last=30
```

Esperado após o backend estar no ar:
- Em vez de “FETCH falhou”, deve aparecer:
  - `NAVSPOT-SYNC: Resp recebida (...)`
  - `NAVSPOT-SYNC: pending_actions_pipe (...)`
  - `NAVSPOT-SYNC v7.1.19: OK`
- E o hotspot deve voltar a ficar **Online** no frontend quando `ultima_sincronizacao` atualizar.

---

## (Opcional, se ainda houver erro após remover o 404)
Se após o deploy o fetch ainda falhar, a próxima melhoria (v7.1.20) será **diagnóstico mais preciso** no `navspot-sync`:
- Capturar e logar o **HTTP status code** quando `/tool fetch` falhar (para diferenciar 401/404/500 vs DNS/TLS real)
- Fazer um `GET` de healthcheck antes do `POST` quando houver falha, para diagnosticar conectividade vs aplicação

Eu só sigo com essa etapa opcional se, depois do deploy, o log do MikroTik ainda não mostrar “Resp recebida”.

---

## Critérios de sucesso
- `GET /mikrotik-sync` retorna 200 no backend (sem 404)
- O MikroTik consegue fazer POST no sync (sem 404) e o log mostra resposta recebida + `OK`
- O painel mostra hotspot Online e a data de última sincronização atualiza

---

## Riscos / Observações
- No momento, o erro dominante é **função inexistente (404)**, então a correção principal é o deploy.
- Depois disso, qualquer problema remanescente tende a ser:
  - token inválido (401)
  - payload inválido (400)
  - conectividade real (DNS/TLS)
  E aí o diagnóstico opcional do navspot-sync ajuda muito.

