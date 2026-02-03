
# NAVSPOT v6.9.25 - Recovery/Bootstrap RouterOS 6.x /import Fix

## Status: ✅ IMPLEMENTADO E DEPLOYED

## Problema Resolvido
O erro `expected end of command (line 772 column 33)` ocorria porque o RouterOS 6.x não aceita o padrão `[/ip firewall filter ...]` durante `/import`. O parser falha ao encontrar "command substitution" com caminho completo dentro de colchetes.

## Solução Aplicada (v6.9.25)

### Mudança Principal: Menu-Context Approach
Substituído:
```routeros
:local oldMaster [/ip firewall filter find comment="NAVSPOT-ALLOW-MASTER"]
```

Por:
```routeros
/ip firewall filter
:local oldMaster [find comment="NAVSPOT-ALLOW-MASTER"]
```

Ao entrar no menu primeiro (`/ip firewall filter`) e depois usar `[find ...]` e `[get ...]` sem caminho completo, o RouterOS 6.x aceita a sintaxe durante `/import`.

### Arquivos Modificados
1. `supabase/functions/mikrotik-recovery-download/index.ts`
   - Bloco AUTO-FIX corrigido
   - Action-processor corrigido
   - Versão bumped para 6.9.25
   - Constantes VERSION/DEPLOYED_AT no topo

2. `supabase/functions/mikrotik-script-generator/index.ts`
   - Action-processor corrigido (add_firewall_block, add_firewall_allow)
   - Versão bumped para 6.9.25
   - Bootstrap script header com `# _build: 6.9.25 | deployed_at=...`

3. `src/components/modals/ScriptModal.tsx`
   - Adicionado item sobre v6.9.25 na lista de features
   - Versão dinâmica no título e seção auto-recuperação

4. `src/pages/Embarcacoes.tsx`
   - `currentScriptVersion` default atualizado para 6.9.25
   - `handleRegenerateScript` agora atualiza a versão

## Como Testar
1. Baixe o Recovery v6.9.25 no painel
2. No MikroTik:
   ```routeros
   /import navspot-recovery-v6.9.25.rsc
   ```
3. Se importar OK, verifique:
   ```routeros
   /log print where message~"NAVSPOT-RECOVERY"
   /ip hotspot profile print where name="hsprof-navspot"
   ```

## Verificação de Build
O script agora inclui header para prova de versão:
```
# NAVSPOT Recovery Script v6.9.25
# _build: 6.9.25 | deployed_at=2026-02-03T17:00:00.000Z
```
