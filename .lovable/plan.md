
# Correção v7.1.24: Compatibilidade RouterOS 6.x

## Problema Identificado

O erro na linha 16:
```
bad command name rndnum (line 16 column 14)
```

O comando `:rndnum` foi introduzido no **RouterOS 7.x** e não existe no RouterOS 6.x. Precisamos substituir por uma alternativa compatível.

---

## Estratégia de Correção

### Substituir `:rndnum` por timestamp mais granular

Em vez de usar números aleatórios, usaremos um timestamp mais detalhado para criar nomes de arquivo únicos. Isso é suficiente para evitar colisões durante a instalação.

**Código atual (v7.1.23) - FALHA:**
```routeros
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local rnd [:rndnum from=0 to=9999]  # <-- NÃO EXISTE NO 6.x!
:local tempFile ("ns-action-" . $tsStr . "-" . $rnd . ".src")
```

**Código corrigido (v7.1.24):**
```routeros
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local uptime [/system resource get uptime]
:local upSec [:pick $uptime ([:len $uptime] - 2) [:len $uptime]]
:local tempSuffix ($tsStr . "-" . $upSec)
:local tempFile ("ns-action-" . $tempSuffix . ".src")
```

### Alternativa mais simples

Como o timestamp de hora:minuto:segundo já é razoavelmente único para uma instalação única, podemos simplificar ainda mais:

```routeros
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local syncTempFile ("ns-sync-" . $tsStr . ".src")
:local actionTempFile ("ns-action-" . $tsStr . ".src")
:local guardianTempFile ("ns-guardian-" . $tsStr . ".src")
```

Isso é suficiente porque:
1. A instalação leva alguns minutos
2. Os arquivos temporários são removidos após uso
3. Não há cenário real de race-condition em instalações únicas

---

## Arquivos a Modificar

### `supabase/functions/mikrotik-scripts/index.ts`

**Mudanças na função `generateAllScripts()`:**

1. **Linha 32:** Bump VERSION para "7.1.24"
2. **Linhas 304-308:** Remover `:rndnum` e usar apenas timestamp

**Código antes (v7.1.23):**
```typescript
# v7.1.23: Unique temp file names with timestamp + rndnum
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
:local rnd [:rndnum from=0 to=9999]
```

**Código depois (v7.1.24):**
```typescript
# v7.1.24: Unique temp file names with timestamp (6.x compatible)
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
# RouterOS 6.x: usar apenas timestamp (sem :rndnum que e 7.x only)
```

3. **Linhas 336, 378, 477:** Atualizar referências para usar apenas `$tsStr` em vez de `$tsStr . "-" . $rnd`

### Outros arquivos (version bump)

- `supabase/functions/mikrotik-sync/index.ts` - Bump VERSION para 7.1.24
- `supabase/functions/mikrotik-script-generator/index.ts` - Bump VERSION para 7.1.24
- `src/components/modals/ScriptModal.tsx` - Bump scriptVersion para "7.1.24"
- `src/pages/Embarcacoes.tsx` - Bump currentScriptVersion para "7.1.24"

---

## Código Corrigido - generateAllScripts (trecho relevante)

```typescript
return `# =========================================
# NAVSPOT Scripts Installer v${VERSION}
# AGGRESSIVE COMPACTION + ENHANCED SAFEGUARDS
# =========================================
# _build: ${VERSION} | deployed_at=${DEPLOYED_AT}
:log info "NAVSPOT-INSTALL v${VERSION}: Iniciando instalacao..."

# URLs construidas incrementalmente (limite 160 chars)
:local apiBase "${apiBase}"
:local ep "/mikrotik-scripts"
:local tk "${syncToken}"

# v7.1.24: Unique temp file names with timestamp (RouterOS 6.x compatible)
:local ts [/system clock get time]
:local tsStr ([:pick $ts 0 2].[:pick $ts 3 5].[:pick $ts 6 8])
# Note: :rndnum removed - only exists in RouterOS 7.x

... (resto do código usando $tsStr em vez de $tsStr . "-" . $rnd)
`
```

---

## Verificação

Após deploy, executar no MikroTik:

```routeros
/import navspot-bootstrap-v7.1.24.rsc

# Verificar se não há mais erro de "bad command name"
# Os logs devem mostrar:
/log print where message~"NAVSPOT-INSTALL" last=30
# Esperado: sync baixado, action baixado, guardian baixado - todos "content valido"
```

---

## Checklist de Implementação

- [ ] Remover `:rndnum` de `generateAllScripts()` (linhas 304-308)
- [ ] Atualizar referências de arquivos temporários para usar apenas `$tsStr`
- [ ] Bump VERSION para 7.1.24 em `mikrotik-scripts/index.ts`
- [ ] Bump VERSION para 7.1.24 em `mikrotik-sync/index.ts`
- [ ] Bump VERSION para 7.1.24 em `mikrotik-script-generator/index.ts`
- [ ] Bump scriptVersion para "7.1.24" em `ScriptModal.tsx`
- [ ] Bump currentScriptVersion para "7.1.24" em `Embarcacoes.tsx`
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x
- [ ] Verificar que não há erro "bad command name"
