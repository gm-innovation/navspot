
## O que eu constatei (por que parece que “não atualiza”)

1) **O front realmente está hardcoded em v6.9.23**  
No `ScriptModal.tsx`:
- Título do modal: `Script MikroTik v6.9.23`
- Seção “Auto-Recuperação v6.9.23”
- Nome do arquivo do recovery: `navspot-recovery-v6.9.23.rsc`

Ou seja: mesmo que o backend esteja em v6.9.24, o usuário sempre enxerga **v6.9.23** no modal e no nome do arquivo.

2) **O Recovery baixado ainda começa com “Recovery Script v6.9.23”**  
Mesmo com o endpoint respondendo `filename="navspot-recovery-v6.9.24.rsc"`, o conteúdo do script retornado hoje começa com:
- `# NAVSPOT Recovery Script v6.9.23`
- `:log info "NAVSPOT-RECOVERY v6.9.23: ..."`

Isso não é cache: é o template do script ainda com strings antigas dentro do `generateRecoveryScript()`.

3) **O erro do import (line 764 col 33) não era só o login-url**  
Ao baixar o script e olhar perto da linha ~764, aparece este trecho:

```routeros
:local oldMaster [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]
:if ([:len $oldMaster] > 0) do={
  :local ruleInfo [/ip firewall filter get $oldMaster]
  :if ([:typeof ($ruleInfo->"hotspot")] = "nothing") do={ ...
```

No RouterOS 6.x, isso costuma falhar porque:
- `[/ip firewall filter get $oldMaster]` **sem propriedade** é inválido (o `get` exige um campo)
- `($ruleInfo->"hotspot")` (acesso tipo “map”) **não é suportado** no mesmo formato em RouterOS 6.x

Isso explica perfeitamente o `expected end of command`.

E o **mesmo padrão inválido existe também no script completo (bootstrap)** dentro do `mikrotik-script-generator`, então sim: se você decidir subir o script completo, ele pode falhar do mesmo jeito até corrigirmos isso.

---

## Objetivos da correção

1) Fazer o **Recovery v6.9.24 importar sem erro** no RouterOS.
2) Fazer o **script completo (bootstrap) também importar** (corrigindo o mesmo bug no template).
3) Fazer o **front e o cabeçalho dos scripts mostrarem a versão real**, evitando confusão.
4) Adicionar um mecanismo simples de **“prova de versão”** (version logging/markers) para você ter certeza do que está rodando.

---

## Mudanças planejadas (backend functions)

### A) Corrigir o trecho que quebra o RouterOS (Recovery + Bootstrap)

Substituir o padrão inválido:

```routeros
:local existingRuleSrc [/ip firewall filter get $oldMaster]
:if ([:typeof ($existingRuleSrc->"hotspot")] = "nothing" || ($existingRuleSrc->"hotspot") != "auth") do={ ... }
```

Por um padrão compatível com RouterOS 6.x (sem `->` e sem `get` “sem campo”), usando `:do ... on-error`:

```routeros
:local oldHotspot ""
:do { :set oldHotspot [/ip firewall filter get $oldMaster hotspot] } on-error={ :set oldHotspot "" }

# Se não é "auth" (ou não existe), é regra antiga/errada
:if ($oldHotspot != "auth") do={
  :log warning "NAVSPOT: Removendo regra ALLOW-MASTER antiga (sem escopo hotspot=auth)"
  /ip firewall filter remove $oldMaster
  :do { /ip firewall filter remove [find comment="NAVSPOT-ALLOW-ACCEPT"] } on-error={}
}
```

Aplicar essa correção em **todos os lugares** onde aparece:
- No **recovery** (há pelo menos 2 ocorrências: dentro do action-processor e no bloco “AUTO-FIX remove old unscoped rules”)
- No **bootstrap/script-generator** (onde hoje existe o mesmo padrão inválido)

Arquivos:
- `supabase/functions/mikrotik-recovery-download/index.ts`
- `supabase/functions/mikrotik-script-generator/index.ts`

### B) Atualizar as strings de versão dentro dos scripts (conteúdo)
Atualizar no template do recovery:
- `# NAVSPOT Recovery Script v6.9.23` -> `v6.9.24`
- `NAVSPOT-RECOVERY v6.9.23:` -> `v6.9.24`
- Mensagens e marcadores principais para bater com o “v6.9.24” que já está no filename do download

Atualizar no template do bootstrap:
- `:log info "NAVSPOT v6.9.23: Iniciando instalacao..."` -> `v6.9.24`
- Guardian/action-processor logs que ainda citam `v6.9.23`
- Mantemos comentários históricos “v6.9.23: …” quando forem notas de changelog, mas o “banner” e logs principais passam a refletir a versão atual.

### C) Version logging (prova do deploy)
Adicionar constantes no topo dos 2 endpoints:
- `const VERSION = "6.9.24";`
- `const DEPLOYED_AT = "...";`

E:
- Logar sempre: `[mikrotik-recovery-download 6.9.24] ...`
- No script retornado, incluir uma linha de header adicional (comentário) com o deployed_at, por exemplo:
  `# _build: 6.9.24 | deployed_at=2026-...`

Isso dá para você checar facilmente no próprio arquivo baixado.

---

## Mudanças planejadas (frontend)

### D) Remover hardcode “v6.9.23” do modal e arquivos
Atualizar `src/components/modals/ScriptModal.tsx` para:
- Receber `scriptVersion?: string` (do script completo)
- Usar essa versão no:
  - Título do modal
  - Seção “Auto-Recuperação”
  - Texto de verificação (“NAVSPOT vX: INSTALACAO CONCLUIDA!”)
  - Nome do arquivo de download do bootstrap (ex: `navspot-bootstrap-v6.9.24.rsc`)

### E) Passar a versão real do script completo para o modal
Atualizar `src/pages/Embarcacoes.tsx` para:
- Armazenar `currentScriptVersion` vindo de `data.version` retornado pelo `mikrotik-script-generator`
- Passar isso para o `ScriptModal`

### F) Nome do arquivo do Recovery
Como o `invoke()` retorna só o texto, sem headers, vamos:
- Parsear a versão a partir da primeira linha do script (ex: regex em `# NAVSPOT Recovery Script v6.9.24`)
- Gerar filename correto: `navspot-recovery-v6.9.24.rsc` (em vez de v6.9.23 hardcoded)

Arquivos:
- `src/components/modals/ScriptModal.tsx`
- `src/pages/Embarcacoes.tsx`

(O hook `useDownloadRecoveryScript` pode ficar como está, retornando string.)

---

## Como eu vou validar (antes de você testar no MikroTik)

1) Baixar o recovery via chamada direta (internamente) e confirmar:
- Primeira linha contém `v6.9.24`
- Existe `# _build: 6.9.24 | deployed_at=...`
- Não existe mais nenhum trecho `get $oldMaster` sem propriedade
- Não existe `->"hotspot"` em lugar nenhum

2) Conferir que o script tem ~800 linhas e que o bloco próximo da antiga linha 764 foi reescrito para o formato RouterOS 6.x compatível.

3) Validar também o script completo (bootstrap) gerado:
- “banner” do script em v6.9.24
- ausência do padrão inválido

---

## Como você testa depois (end-to-end)

1) Pelo painel, baixar novamente:
- Recovery v6.9.24
- Script completo (bootstrap) se quiser comparar

2) No MikroTik:
```routeros
/import navspot-recovery-v6.9.24.rsc
```

3) Se importar ok, validar:
```routeros
/ip hotspot profile print where name="hsprof-navspot"
/ip firewall filter print where comment~"NAVSPOT-ALLOW"
```

---

## Resultado esperado

- O **/import** do recovery deixa de falhar com “expected end of command”.
- O arquivo baixado e os logs do MikroTik passam a mostrar **v6.9.24** de forma consistente.
- O modal do painel deixa de exibir **v6.9.23** fixo e passa a mostrar a versão real.
- O script completo (bootstrap) também fica seguro para importar (sem o mesmo bug).
