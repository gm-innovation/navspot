
<contexto e diagnóstico (baseado no que já está gerado no backend)>
- O erro “linha 171, coluna 54” bate com um ponto real do bootstrap atual: dentro do `source={...}` do `navspot-action-processor` existe um comando no formato `:do {/ip ...}` (sem espaço após a chave).
- Mesmo com `source={...}` (já corrigido), o RouterOS pode validar/parsing do conteúdo do `source` durante `/import`, e construções “coladas” como `:do {/ip ...}` costumam disparar erro de parsing (coluna aponta para dentro do comando).
- Ou seja: o problema agora não é mais “aspas dentro de aspas”, e sim sintaxe do script interno (especialmente `:do`).

<objetivo>
Garantir que o `navspot-bootstrap.rsc` importe 100% no RouterOS, eliminando qualquer risco de parsing:
1) manter `source={...}` (sem `source="..."`) para `navspot-sync` e `navspot-action-processor`
2) corrigir a sintaxe interna do `action-processor` para usar `:do { /ip ... } on-error={}` (com espaços) em todas as ocorrências
3) opcionalmente endurecer a geração com validação automática (nunca mais gerar `:do {/`)

<arquivos envolvidos>
- `supabase/functions/mikrotik-script-generator/index.ts` (único arquivo a alterar)

<plano de implementação (passo a passo)>
1) Confirmar o ponto exato do erro no script gerado
   - Consultar no backend o `script_gerado` do hotspot em teste e extrair as linhas ~165–180.
   - Verificar se a linha 171 cai em um trecho como:
     - `:do {/ip hotspot user profile set ...} on-error={}`
   - Resultado esperado: confirmar que o parsing está quebrando pelo `:do {` “sem espaço” (não por aspas).

2) Corrigir TODOS os `:do` do `navspot-action-processor`
   - No template `actionProcessorSource`, substituir cada ocorrência do padrão:
     - `:do {/ip ...} on-error={}`
     por:
     - `:do { /ip ... } on-error={}`
   - Isso inclui, no mínimo:
     - remove_user
     - disable_user
     - enable_user
     - kick_session
     - update_password
     - update_profile_quota (este é o que está batendo exatamente na linha 171 do bootstrap atual)
   - Observação importante: manter também espaços antes do `}` quando fechar o bloco do `:do`, para o RouterOS não “colar” tokens.

3) (Opcional, mas recomendado) Tornar o update de quota ainda mais “à prova de RouterOS”
   - Em vez de `set [find name=$pName] ...`, usar um id intermediário, reduzindo risco de parsing/expansão:
     - `:local profId [/ip hotspot user profile find name=$pName]`
     - `:if ([:len $profId] > 0) do={ :do { /ip hotspot user profile set $profId limit-bytes-total=$quotaBytes } on-error={} }`
   - Isso não é obrigatório para resolver o import, mas reduz chances de erro em variações de RouterOS.

4) Adicionar uma “regra de ouro” automática na geração (sanity check)
   - Ainda no `mikrotik-script-generator`, antes de retornar o `bootstrapScript`, rodar verificações simples:
     - Se existir `source="` no script final => logar erro e (se aplicável) abortar/ajustar
     - Se existir `:do {/` no script final => logar erro e ajustar
   - Objetivo: impedir regressão (esse tipo de bug volta fácil).

5) Validar após a correção (teste de verdade)
   - Gerar novamente o script para um hotspot (o mesmo que você está importando).
   - Conferir no `navspot-bootstrap.rsc`:
     - não existe `source="`
     - não existe `:do {/`
     - `navspot-sync` e `navspot-action-processor` continuam em `source={...}`
   - Reimportar no RouterOS e confirmar que o erro “linha 171, coluna 54” desapareceu.

<critérios de aceite>
- `/import navspot-bootstrap.rsc` termina sem erro de parsing
- `navspot-sync` e `navspot-action-processor` são criados no RouterOS
- O trecho de quota (`update_profile_quota`) não quebra import e permanece funcional
- Não existe mais nenhum `source="..."` para scripts longos no bootstrap

<nota importante para seu fluxo>
- Depois que eu aplicar a correção, você precisa gerar/baixar o bootstrap novamente (para não ficar com um `.rsc` antigo em cache/arquivo local).

