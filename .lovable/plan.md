
Contexto (para destravar de vez)
- O script está sendo atualizado sim. Eu consegui baixar diretamente do backend e ele vem com:
  - Cabeçalho: “# NAVSPOT Recovery Script v6.9.24”
  - Prova de geração: “# _build: 6.9.24 | deployed_at=2026-02-03T16:34:36.756Z”
- O erro atual “expected end of command (line 772 column 33)” bate exatamente com a linha 772 do script que o backend está servindo hoje, então não é “cache do front”: é sintaxe do próprio .rsc.

Diagnóstico do erro (por que quebra exatamente na linha 772)
- A linha 772 do recovery servido hoje é:
  :local oldMaster [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]
- No seu RouterOS, o parser do /import está falhando especificamente quando usamos “command substitution” com caminho completo dentro de colchetes (o trecho “[/ip firewall filter …]”).
- Importante: esse mesmo padrão também existe dentro do template do navspot-action-processor (tanto no recovery quanto no bootstrap), então mesmo que o recovery importasse, o action-processor poderia quebrar na hora de rodar.

Objetivos da correção
1) Fazer o /import do recovery passar (sem erro na linha 772/771/etc).
2) Remover o padrão problemático em todos os templates (recovery + script completo) para não estourar depois em runtime.
3) Melhorar a “prova de versão” para ficar impossível confundir “versão do script” com “versão que está rodando”.
4) Garantir que o script completo (bootstrap) também esteja coerente na versão exibida (front + cabeçalho + logs).

Mudança principal (fix de sintaxe RouterOS) — abordagem
- Parar de usar:
  :local X [/ip firewall filter …]
- Trocar por uma abordagem compatível que não depende de path completo dentro de []:
  a) Entrar no menu (/ip firewall filter)
  b) Usar [find …] e [get …] sem caminho completo (apenas comandos do menu atual)

Exemplo do bloco corrigido (recovery)
- Substituir o bloco AUTO-FIX por algo neste formato:

  :do {
    /ip firewall filter
    :local oldMaster [find where comment="NAVSPOT-ALLOW-MASTER"]
    :if ([:len $oldMaster] > 0) do={
      :local oldHotspot ""
      :do { :set oldHotspot [get $oldMaster hotspot] } on-error={ :set oldHotspot "" }

      :if ($oldHotspot != "auth") do={
        :log warning "NAVSPOT-RECOVERY: Removendo NAVSPOT-ALLOW-MASTER sem escopo (hotspot!=auth)"
        remove $oldMaster
        :do { remove [find where comment="NAVSPOT-ALLOW-ACCEPT"] } on-error={}
      }
    }
  } on-error={
    :log warning "NAVSPOT-RECOVERY: Falha ao verificar/remover regras antigas NAVSPOT-ALLOW (seguindo sem auto-fix)"
  }

- Observação: se “where” não for aceito na sua versão específica, vamos usar fallback para:
  [find comment="…"]
  mas mantendo a mesma estratégia (sem “[/ip firewall filter …]” dentro de []).

Arquivos que vou ajustar (backend)
1) supabase/functions/mikrotik-recovery-download/index.ts
   - Corrigir o bloco AUTO-FIX do recovery (onde está o erro do /import).
   - Corrigir também o mesmo padrão dentro do actionProcessorSource (porque ele também usa :local oldMaster [/ip firewall filter …]).
   - Melhorar “prova de versão”:
     - Trocar deployedAt dinâmico (new Date() por request) por constantes VERSION/DEPLOYED_AT no topo do arquivo, para ficar claro quando foi o deploy real.
     - (Opcional, mas recomendado) bump de versão para 6.9.25 para deixar óbvio que o arquivo mudou e evitar “baixei 6.9.24 de novo e parece igual”.

2) supabase/functions/mikrotik-script-generator/index.ts
   - Corrigir o mesmo padrão dentro do actionProcessorSource (ele tem o mesmo :local oldMaster [/ip firewall filter …]).
   - Varredura rápida e substituição de outros command substitutions “/ip firewall filter …” dentro de [] (ex.: ftPos e dropPos) para a mesma estratégia por menu-contexto, reduzindo chance de novos “expected end of command” quando o action-processor rodar.
   - Garantir versão coerente:
     - Retornar version “6.9.25” (se fizermos bump)
     - Inserir um cabeçalho no bootstrap script com “# NAVSPOT Bootstrap Script v6.9.25” + “# _build: …” para prova no próprio arquivo.

Mudanças no front (para acabar com a desconfiança de versão)
3) src/components/modals/ScriptModal.tsx
   - Já está usando scriptVersion e já extrai versão do recovery pelo header.
   - Vou adicionar também a leitura opcional do “_build/deployed_at” do texto do script e mostrar no modal algo como:
     Build: 6.9.25 | deployed_at=…
   - Isso te dá confirmação visual imediata, sem ter que abrir o arquivo no Winbox.

4) src/pages/Embarcacoes.tsx
   - Conferir que, ao regenerar script, também atualiza currentScriptVersion (hoje só atualiza no primeiro generate; no regenerate ele não seta version).
   - Isso evita “modal ficou com versão antiga” se você clicar em Regenerar.

Como vou validar antes de você testar no MikroTik
A) Validação automática (no backend)
- Baixar recovery novamente e checar:
  - O arquivo ainda tem header + _build.
  - Não existe mais nenhuma linha com padrão:
    :local X [/ip firewall filter …
  - Em especial, a linha que hoje é 772 deve virar um bloco com /ip firewall filter + [find …] (sem caminho completo dentro de []).

B) Validação de import (simulação prática)
- Conferir que o recovery tem ~800 linhas, e que o trecho próximo da antiga linha 772 agora não contém “[/ip firewall filter …]”.

Como você testa end-to-end (após eu implementar)
1) Pelo painel, baixe de novo o Recovery (vai vir com build/deployed_at novos e/ou versão 6.9.25).
2) No MikroTik:
   /import navspot-recovery-v6.9.25.rsc
3) Se importar OK:
   - /log print where message~"NAVSPOT-RECOVERY"
   - /ip hotspot profile print where name="hsprof-navspot"
4) (Opcional) Gere e importe o script completo (bootstrap) para confirmar que o action-processor também está seguro:
   /import navspot-bootstrap-v6.9.25.rsc

Workaround imediato (se você precisa destravar agora, antes do fix)
- Você pode rodar manualmente (no terminal do MikroTik) a limpeza sem importar o recovery:
  /ip firewall filter remove [find where comment="NAVSPOT-ALLOW-MASTER"]
  /ip firewall filter remove [find where comment="NAVSPOT-ALLOW-ACCEPT"]
- E manter a login-url correta:
  /ip hotspot profile set hsprof-navspot login-url="https://navspot.lovable.app/hotspot-login?h=27a1e1be-4ba7-4496-adb1-9227d3a80ad1&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"

Risco/impacto
- Mudança é localizada (apenas forma de “find/get” em firewall) e não mexe em bridge/DHCP/NAT.
- Ao remover o padrão “[/ip firewall filter …]” dentro de [], reduzimos drasticamente a chance de novos “expected end of command” em RouterOS mais sensíveis no /import.

Entregável final esperado
- Recovery importa sem erro (linha 772 deixa de existir nesse formato).
- Action-processor e bootstrap não carregam mais o padrão problemático.
- Front mostra versão e build do script, sem hardcode enganoso.
