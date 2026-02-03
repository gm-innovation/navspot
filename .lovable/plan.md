
## Diagnóstico completo (Recovery v6.9.27) — erro real encontrado e outros pontos de risco

Você reportou:

```routeros
/import navspot-recovery-v6.9.27.rsc
expected end of command (line 644 column 33)
```

Eu reproduzi o **arquivo exato** que o backend está gerando hoje (v6.9.27) e conferi a **linha 644** do `.rsc`. Ela é:

```routeros
/ip hotspot walled-garden add dst-host="*.apple.com" action=allow comment="navspot-cpd-apple"
```

Isso explica por que o `/import` está parando exatamente na linha 644.

---

## 1) Causa provável do erro (linha 644)

### O que o erro significa
`expected end of command` é erro de **parser** (sintaxe/tokenização), não “falha de execução”. Ou seja: o RouterOS nem chega a “tentar adicionar”, ele **não consegue interpretar** a linha.

### Por que essa linha em específico pode quebrar
Embora `dst-host="*.dominio.com"` funcione em muitos ambientes, em alguns builds/variações do RouterOS 6.x existem casos em que o parser falha com certos padrões de wildcard (especialmente em `/import`), e aqui o caso problemático ficou “cravado” em `*.apple.com`.

> Importante: como o erro está exatamente no começo do parâmetro `dst-host` (coluna 33), isso é consistente com “token inesperado” na linha, típico de parser.

### Confirmação rápida no próprio MikroTik (diagnóstico de campo)
Para fechar 100%, basta rodar no terminal (fora do /import):

```routeros
/ip hotspot walled-garden add dst-host="*.apple.com" action=allow comment="__test__"
```

- Se der o mesmo `expected end of command`, está confirmado que esse padrão não é aceito no seu RouterOS.
- Se não der erro, então o problema pode ser “efeito cascata” de alguma linha anterior (aspas/blocos não fechados). Mas como a linha 644 do arquivo gerado é limpa e o erro aponta para `dst-host`, a hipótese principal continua sendo o wildcard.

---

## 2) Correção proposta (robusta) para Apple CPD sem wildcard

### Objetivo funcional (o que está sendo tentado implementar)
Essa parte do Recovery tenta garantir que **iOS/macOS** consigam fazer “captive portal detection” e abrir o pop-up de login.

### Correção segura
Remover a regra wildcard `*.apple.com` e trocar por hosts explícitos conhecidos (que são aceitos de forma mais consistente):

- Manter (já existe):
  - `captive.apple.com`
- Adicionar:
  - `www.apple.com`
  - opcionalmente uma regra mais restrita com `path="/library/test/success.html"` (se quisermos precisão máxima)

Exemplo de bloco (conceito):
```routeros
:do { /ip hotspot walled-garden remove [find dst-host="captive.apple.com"] } on-error={}
:do { /ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="navspot-cpd-apple" } on-error={}

:do { /ip hotspot walled-garden remove [find dst-host="www.apple.com"] } on-error={}
:do { /ip hotspot walled-garden add dst-host="www.apple.com" action=allow comment="navspot-cpd-apple" } on-error={}
```

Observação: colocar o `add` dentro de `:do { ... } on-error={}` não resolve erro de parser, mas ajuda a não abortar caso seja erro de execução (ex: pacote desabilitado). Mesmo assim, a mudança principal é **não usar** `*.apple.com`.

### Onde ajustar no código
- `supabase/functions/mikrotik-recovery-download/index.ts`
  - Remover as duas linhas que geram:
    - `remove [find dst-host="*.apple.com"]`
    - `add dst-host="*.apple.com" ...`
  - Substituir pelo(s) host(s) explícitos (ex. `www.apple.com`)
- `supabase/functions/mikrotik-script-generator/index.ts`
  - Fazer o mesmo no bootstrap (para manter consistência: bootstrap e recovery precisam concordar)

---

## 3) Workaround imediato (sem esperar código novo)
Se você precisa importar hoje:
1) Abra o arquivo `navspot-recovery-v6.9.27.rsc`
2) Remova/comente as linhas 643–644 (as duas relacionadas a `*.apple.com`)
3) Rode o `/import` novamente

Isso deve destravar o import e permitir que o resto do recovery rode.

---

## 4) “Tudo que o recovery está tentando fazer” + pontos com potencial de erro

Abaixo vai um mapa completo do Recovery atual (com o que pode dar problema **de parser** e o que pode dar problema **de runtime**):

### (A) Cabeçalho + logs
- Apenas comentários e `:log info`
- Risco: baixo

### (B) Recriação do token (`/file print` + `/file set`)
Trecho:
```routeros
/file print file=navspot-token where name="__never__"
:file set [find name~"navspot-token"] contents="..."
```
Riscos:
- **Runtime**: o `find name~"navspot-token"` pode, em cenários raros, pegar mais de 1 arquivo (se existirem variações antigas). Normalmente ok.
- Compatibilidade: método é conhecido por funcionar no RouterOS 6.x (bom).

Melhoria opcional futura:
- tentar setar por `name="navspot-token.txt"` se o nome for determinístico no seu RouterOS.

### (C) Recriar/atualizar scripts (`/system script set/add ... source={...}`)
- O RouterOS faz parsing do bloco `source={...}` durante `/import` (já vimos isso no passado com os problemas de `[:len [/...]]`).
Riscos:
- **Parser**: qualquer quebra de chaves `{}` ou aspas no source mata o import.
- **Runtime**: mesmo que importe, o script pode falhar ao rodar dependendo do build.

Pontos específicos:
- `navspot-sync` usa `/tool fetch ... as-value` e acessa campos com `->"status"` e `->"data"`.
  - Risco **runtime** dependendo da versão do fetch/as-value no RouterOS.
- `navspot-action-processor` faz parsing/trim do pipe.
  - Vi uso de `[:pick $line $i]` (2 parâmetros) em comparação com `" "` — isso é mais risco de **lógica** (não parser), podendo afetar o trim.

### (D) Scheduler
Trecho:
```routeros
/system scheduler set/add ... on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}" start-time=startup start-date=jan/01/1970
```
Riscos:
- **Runtime**: `start-time=startup` é historicamente sensível a relógio; vocês já mitigaram com `start-date`.
- **Parser**: risco moderado se aspas forem quebradas (parece correto no script atual).

### (E) Netwatch
Trecho:
```routeros
/tool netwatch add ... up-script=":delay 5s; :do { /system script run navspot-sync } on-error={}" comment="navspot-netwatch"
```
Riscos:
- **Parser**: aspas internas (aqui não há aspas internas, só `{}` dentro da string). Em geral ok.
- **Runtime**: netwatch pode não existir em builds muito específicos (menos comum).

### (F) Walled Garden (hostnames)
Objetivo: permitir portal + backend + CDNs + CPD.

Riscos:
- **Parser**: wildcard em `dst-host` pode quebrar em certos builds via `/import`.
- **Erro confirmado**: `dst-host="*.apple.com"` está quebrando o seu import na linha 644.

### (G) Walled Garden IP (protocolos essenciais)
Trechos:
```routeros
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
...
/ip hotspot walled-garden ip add protocol=icmp action=accept comment="navspot-icmp"
```
Riscos:
- Em muitas referências de RouterOS, `action=accept` aqui é válido (há exemplos públicos com `action=accept`), então **não é o principal suspeito de parser**.
- Mesmo assim, depois que resolvermos o Apple, se aparecer novo erro mais adiante, essa seção vira candidata para ajuste fino (por exemplo, testar `action=allow` dependendo do build).

### (H) Hotspot profile login-url
Trecho:
```routeros
/ip hotspot profile set $hsprof login-url="$correctLoginUrl"
```
Riscos:
- **Runtime**: se o profile `hsprof-navspot` não existir, loga warning e segue (ok).
- **Parser**: URL longa com `\$(mac)` etc — normalmente ok, mas qualquer aspas quebrada aqui causaria erro.

---

## 5) Melhorias de “diagnóstico automático” que vou implementar junto (para evitar reincidência)

1) **Linter do script (validateRouterOSScript)**
   - Adicionar verificação específica para bloquear a emissão de `dst-host="*.apple.com"` (ou substituir automaticamente por fallback seguro).
2) (Opcional) Bloquear outras assinaturas conhecidas que já causaram parser-error em 6.x durante `/import`.

Isso garante que o backend não vai mais gerar um `.rsc` “que baixa”, mas quebra no `/import`.

---

## 6) Plano de implementação (mudanças de código)

### Passo 1 — Ajuste Recovery
Arquivo: `supabase/functions/mikrotik-recovery-download/index.ts`
- Remover `*.apple.com` (remove/add)
- Adicionar `www.apple.com` (remove/add)
- Manter `captive.apple.com`

### Passo 2 — Ajuste Bootstrap (consistência)
Arquivo: `supabase/functions/mikrotik-script-generator/index.ts`
- Mesmo ajuste do bloco Apple CPD

### Passo 3 — Linter aprimorado
- Em ambos (recovery + script-generator), expandir `validateRouterOSScript()` para:
  - detectar `dst-host="*.apple.com"` e falhar com mensagem clara (ou auto-fallback)

### Passo 4 — Testes
1) Baixar `navspot-recovery-v6.9.27.rsc` novamente após atualização
2) No MikroTik:
   ```routeros
   /import navspot-recovery-v6.9.27.rsc
   ```
3) Conferir:
   ```routeros
   /ip hotspot walled-garden print where comment~"navspot-cpd-apple"
   /log print where message~"NAVSPOT-RECOVERY"
   ```
4) (Opcional) Teste real iPhone/macOS para abrir captive portal automaticamente.

---

## 7) O que eu preciso de você (mínimo) para fechar 100%
- Qual é o **RouterOS version** do equipamento que está importando? (ex: 6.45.x, 6.49.x, 7.x)
  - Isso ajuda a decidir se vale adicionar `path="/library/test/success.html"` (mais preciso) ou só `www.apple.com` (mais simples).
