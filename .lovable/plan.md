
Objetivo
- Eliminar o erro de execução do `navspot-action-processor` no RouterOS 6.49.x (“expected end of command (line 32 column 39)”) e, de quebra, reduzir os falsos “Resposta inválida (sem pending_actions_pipe)” quando não há ações pendentes.

Diagnóstico (com base no seu log + erro manual)
- O `navspot-action-processor` está com flag **I (invalid)** e ao rodar manualmente:
  - `/system script run navspot-action-processor`
  - retorna: **expected end of command (line 32 column 39)**
- Pela contagem de linhas do `generateActionProcessorSource()` atual (v7.1.10), a **linha 32** é:
  - `:do { /ip hotspot profile set $hsprof login-url=$loginUrl } on-error={}`
- Isso indica que o problema não é mais “/import”, e sim o comando que configura `login-url` com uma URL que contém caracteres especiais (ex.: `&`, `?`, `=`) e placeholders `$(mac)`, `$(ip)`, `$(link-login-only)`.

Causa raiz provável (duas partes)
1) Valor de `login-url` sem aspas
- O valor vindo do backend contém `&` e outros caracteres que o parser do RouterOS frequentemente exige que estejam **entre aspas** quando passados como argumento.

2) Placeholders `$(...)` sem escape para script
- O backend hoje envia `$(mac)` etc **sem escape** dentro do pipe:
  - `configure_hotspot_profile|https://...&mac=$(mac)&ip=$(ip)...|dns`
- Em scripts RouterOS, `$` tem semântica de variável. Para garantir que o texto `$(mac)` seja armazenado como placeholder do Hotspot (e não interpretado pelo script), a forma robusta é enviar/usar `\$(mac)` (o RouterOS armazena como `$(mac)`).

Plano de correção (nova versão v7.1.11)
A) Ajuste no backend function `mikrotik-sync` (onde o pipe é montado)
1) Escapar placeholders de runtime para RouterOS ao montar `login_url`
- Implementar um helper simples no `mikrotik-sync`:
  - Transformar ocorrências de `$(...` em `\$(...` (prefixar `\` antes do `$`)
  - Ex.: `...&mac=$(mac)` → `...&mac=\$(mac)`
- Aplicar isso especificamente em `configure_hotspot_profile` (no `pipeDelimitedActions`), antes do `sanitizeForPipe(...)`.

2) `pending_actions_pipe` sempre com marcadores `[[...]]` (mesmo vazio)
- Hoje, quando não há ações, o backend retorna `pending_actions_pipe: ""`, e o `navspot-sync` loga “Resposta inválida”.
- Alterar para:
  - Se vazio: retornar `[[]]` (sem `;`)
  - Se tiver ações: retornar `[[<pipe>;]]` como já é (com `;` no final, para o parser do RouterOS).

Resultado esperado:
- O RouterOS sempre encontra `[[` e `]]`, e quando vier vazio, o `navspot-sync` vai cair no caminho “nenhuma ação pendente” (sem warnings falsos).

B) Ajuste no backend function `mikrotik-scripts` (action-processor e sync)
1) Corrigir o `configure_hotspot_profile` no `generateActionProcessorSource()`
- Alterar os comandos para usar aspas e aceitar URL com `&`:
  - `login-url="$loginUrl"`
  - `dns-name="$dnsName"`
- Manter dentro do `:do { ... } on-error={ ... }`, mas trocar `on-error={}` vazio por logs curtos (para depurar sem quebrar).
  - Ex.: `on-error={ :log warning "NAVSPOT-ACTION: falha set login-url" }`

2) Tornar `create_user` robusto para parâmetros vazios no pipe
- O backend usa `create_user|user||profile` para alguns casos (ex.: update de perfil).
- Ajustar o handler:
  - Se `uPass` vier vazio, **não** enviar `password=` no comando `/ip hotspot user set` (mantém senha atual e evita erros).
  - Se `uPass` vier vazio na criação e o usuário não existir, decidir comportamento:
    - opção segura: não criar e logar warning (ou criar sem senha se isso for aceitável no seu fluxo).
  - Essa decisão vai ser documentada no código e mantida consistente.

3) (Recomendado para “sucesso total”) Implementar handlers mínimos que já estão sendo enviados pelo backend
- O `mikrotik-sync` envia ações como:
  - `create_whitelist_domain|list|domain`
  - `create_blacklist_domain|list|domain` (ou correlatos)
- Hoje o action-processor ignora essas ações, então o portal pode falhar para clientes pré-login (walled garden não aplicado).
- Implementar pelo menos:
  - `create_whitelist_domain`: adicionar em `/ip hotspot walled-garden` com `action=allow` (idempotente via `:do { add } on-error={}`)
  - `create_blacklist_domain`: adicionar como `action=deny` no walled-garden (ou um caminho equivalente já adotado no projeto, mantendo idempotência)
  - (Opcional) `remove_whitelist_domain` / `remove_blacklist_domain` se já existirem ações de remoção.

4) Reduzir concorrência do `navspot-sync`
- Como existem scheduler + netwatch + execuções manuais, é fácil rodar 2 syncs ao mesmo tempo e gerar logs “estranhos”.
- Adicionar lock simples ao `generateSyncSource()`:
  - `:global navspotSyncLock`
  - Se `= "1"`, log e `:return`
  - Setar `= "1"` no início e sempre liberar no final (inclusive em on-error).

C) Bump de versão e consistência no UI
- Atualizar para `7.1.11` em:
  - `supabase/functions/mikrotik-scripts/index.ts` (const VERSION)
  - `supabase/functions/mikrotik-script-generator/index.ts` (const VERSION + defaults)
  - `src/components/modals/ScriptModal.tsx` (default `scriptVersion`)
  - `src/pages/Embarcacoes.tsx` (default `currentScriptVersion`)

Validação (roteiro objetivo no MikroTik 6.49.x)
1) Importar o novo bootstrap:
- `/import navspot-bootstrap-v7.1.11.rsc`

2) Confirmar que o action-processor deixou de ser “invalid”
- `/system script print where name="navspot-action-processor"`
  - Esperado: sem flag `I`
- Rodar manualmente:
  - `/system script run navspot-action-processor`
  - Esperado: sem “expected end of command”
  - Log esperado: `NAVSPOT-ACTION v7.1.11: Start` e depois `OK` ou “Nenhuma ação pendente”

3) Rodar o sync e checar logs
- `/system script run navspot-sync`
- `/log print where message~"NAVSPOT"`
  - Esperado: sem “Resposta inválida” quando não houver ações
  - Se houver `configure_hotspot_profile`, não deve mais quebrar

4) Confirmar que o profile foi configurado
- `/ip hotspot profile print detail where name="hsprof-navspot"`
  - Confirmar `login-url` com placeholders `$(mac)`/`$(ip)` (armazenados corretamente) e `dns-name`.

5) Confirmar walled-garden para o portal (se os handlers forem adicionados)
- `/ip hotspot walled-garden print where comment~"navspot"`
  - Deve conter `navspot.lovable.app` e o host do backend.

Testes no lado do backend (antes de você reimportar)
- Eu vou chamar as funções do backend para verificar:
  - `pending_actions_pipe` retorna `[[]]` quando vazio
  - `configure_hotspot_profile` no pipe contém `\$(mac)` etc (escapado para RouterOS)
  - O `mikrotik-scripts?type=action-source` incorpora as mudanças de aspas em `login-url`.

Arquivos que serão alterados
- `supabase/functions/mikrotik-sync/index.ts`
- `supabase/functions/mikrotik-scripts/index.ts`
- `supabase/functions/mikrotik-script-generator/index.ts`
- `src/components/modals/ScriptModal.tsx`
- `src/pages/Embarcacoes.tsx`

Riscos/atenções
- Precisamos manter o action-processor compacto (idealmente <4KB) e com linhas resilientes para RouterOS 6.x.
- Qualquer valor que possa conter `"` (aspas) deve ser evitado no `login_url` (ou sanitizado no backend), para não quebrar o comando com aspas.
