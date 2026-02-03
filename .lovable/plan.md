
## O que está quebrando agora (v6.9.30) — com linha exata

Eu consegui reproduzir a mesma resposta do backend que você baixou/importou. No **recovery v6.9.30**, a **linha 641** do `.rsc` gerado é:

```routeros
:do { /ip hotspot walled-garden remove [find dst-host="*.supabase.co"] } on-error={}
```

E o `/import` no RouterOS 6.46–6.49.x está morrendo exatamente ali com:

`expected end of command (line 641 column 33)`

Isso indica que, no seu build de RouterOS, **o parser do `/import` não está aceitando esse padrão específico com `dst-host="*.supabase.co"`** (pelo menos dentro do `remove [find ...]`, e é bem provável que o `add dst-host="*.supabase.co"` logo abaixo também quebrasse em seguida).

Importante: como o import chegou até a linha 641, ele já parseou as linhas anteriores (incluindo `*.lovable.app`), então não é “qualquer wildcard”; é esse caso específico do backend.

---

## Objetivo da correção

1. **Eliminar `*.supabase.co` e `*.supabase.in` do recovery e do bootstrap**, substituindo por **um hostname explícito do backend** (extraído do URL do backend que já existe na função).
2. Trocar a remoção por `dst-host="..."` para uma remoção **por `comment="navspot-api"`**, que é mais estável e evita filtros esquisitos no parser.
3. Aproveitar e corrigir a inconsistência do token (usar `navspot-token.txt` explicitamente), para evitar falhas lógicas/runtimes.

Isso reduz drasticamente a chance de continuar caindo em “expected end of command” em outros pontos do WG.

---

## Hotfix manual (pra você testar agora, sem esperar o generator)

No arquivo `navspot-recovery-v6.9.30.rsc` que você já tem, substitua o bloco “Backend …” por algo assim (mantendo o resto igual):

```routeros
# Backend (hostname explicito)
:do { /ip hotspot walled-garden remove [find where comment="navspot-api"] } on-error={}
# troque AQUI pelo host real do seu backend (o mesmo host que aparece no syncUrl dentro do script)
# exemplo: focqrhkozhdefohroqyi.supabase.co  (use o que estiver no seu arquivo)
 /ip hotspot walled-garden add dst-host="SEU_HOST_BACKEND_AQUI" action=allow comment="navspot-api"
```

Se isso passar no import, a gente confirma 100% que é o wildcard `*.supabase.co` causando o erro e já parte para corrigir definitivamente no generator.

---

## Mudanças definitivas no código (v6.9.31)

### A) `supabase/functions/mikrotik-recovery-download/index.ts`

1) **Derivar o hostname do backend no TypeScript**
- Hoje você já tem `syncUrl` no generator. Vamos extrair o host dele (em TS) e usar no WG:
  - `const backendHost = new URL(syncUrl).hostname`

2) **Substituir o bloco do Walled Garden do backend**
- Remover estas linhas atuais:
```routeros
:do { /ip hotspot walled-garden remove [find dst-host="*.supabase.co"] } on-error={}
 /ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-api"
:do { /ip hotspot walled-garden remove [find dst-host="*.supabase.in"] } on-error={}
 /ip hotspot walled-garden add dst-host="*.supabase.in" action=allow comment="navspot-api"
```

- Colocar no lugar (gerado pelo TS):
```routeros
# Backend (explicit host - avoids *.supabase.* wildcard parser issues)
/do { /ip hotspot walled-garden remove [find where comment="navspot-api"] } on-error={}
 /ip hotspot walled-garden add dst-host="${backendHost}" action=allow comment="navspot-api"
```

Observação: manteremos `*.lovable.app` como está, já que no seu RouterOS isso passou do parse.

3) **Token: tornar o nome consistente e explícito**
- Trocar:
```routeros
/file print file=navspot-token where name="__never__"
/file set [find name~"navspot-token"] contents="..."
```
- Por:
```routeros
/file print file=navspot-token.txt where name="__never__"
:delay 1s
/file set [find where name="navspot-token.txt"] contents="..."
```

4) **Linter (validateRouterOSScript)**
- Adicionar regra para impedir regressão:
  - bloquear `dst-host="*.supabase.co"` e `dst-host="*.supabase.in"` no script final
  - exemplo de regex:
    - `/dst-host="\\*\\.supabase\\.(co|in)"/`

5) **Bump de versão**
- `VERSION = "6.9.31"` (ou 6.9.30.1, mas prefiro 6.9.31 para ficar claro que é outro build).

---

### B) `supabase/functions/mikrotik-script-generator/index.ts` (bootstrap)

O bootstrap também contém:

```routeros
/ip hotspot walled-garden add dst-host="*.supabase.co" ...
/ip hotspot walled-garden add dst-host="*.supabase.in" ...
```

Então vamos aplicar a MESMA lógica:

1) `const backendHost = new URL(supabaseUrl).hostname`
2) Em “WALLED GARDEN”, substituir as duas linhas wildcard por uma linha explícita:
```routeros
/ip hotspot walled-garden add dst-host="${backendHost}" action=allow comment="navspot-api"
```

3) Aplicar a correção do token `.txt` explícito também no bootstrap (para acabar com a inconsistência e facilitar debug em campo).

4) Atualizar o linter do generator para bloquear `*.supabase.*` no output.

---

### C) UI — `src/components/modals/ScriptModal.tsx`

- Atualizar `scriptVersion` padrão para **6.9.31** (para não gerar/download com “versão antiga” no nome do arquivo e confundir).

---

## Como vamos testar (sem adivinhação)

1) **Gerar o recovery pelo painel** (igual você fez) e validar no texto:
   - Não pode existir `*.supabase.co` nem `*.supabase.in`.
   - Deve existir `dst-host="<HOST_EXATO_DO_BACKEND>"` com comment `navspot-api`.

2) Import no MikroTik:
```routeros
/import navspot-recovery-v6.9.31.rsc
```

3) Se ainda der erro, você me passa:
- a linha exata apontada
- o conteúdo dessa linha
e eu ajusto o próximo alvo (mas o fix acima resolve o erro atual com base no que o seu próprio `/import` reportou).

---

## Riscos/considerações (transparente)

- Trocar wildcard por host explícito é mais restritivo (bom para segurança) e mais compatível com parser.
- Se no futuro o backend mudar de domínio, o generator já acompanha automaticamente porque deriva do URL configurado no backend.
- Se o portal web precisar de outros domínios externos para assets, isso afeta “qualidade visual” do portal antes do login, mas não deve impedir a correção do import; e podemos reintroduzir domínios adicionais depois, um a um, de forma segura e testada em RouterOS 6.46–6.49.x.

---

## Entregáveis

- Recovery v6.9.31 corrigido (sem `*.supabase.*`, token `.txt` explícito)
- Bootstrap v6.9.31 corrigido (mesma regra)
- Linter atualizado para impedir regressão
- UI mostrando/baixando os arquivos com a versão correta
