

# Plano: Correção Definitiva v6.9.35 — Padrão "Add Curto + Set Separado" com Create-if-Missing

## Diagnóstico Final

O erro `expected end of command (line 102 column 176)` persiste porque:

1. **Bootstrap (linha 751)**: O comando `add` ainda inclui `login-url=$fullUrl` na mesma linha:
   ```routeros
   /ip hotspot profile add name="hsprof-navspot" ... login-url=$fullUrl
   ```

2. **Recovery (linha 704)**: Usa `set` separado mas:
   - Sem aspas em `login-url=$fullUrl`
   - Sem criar o profile se não existir (create-if-missing)

## Solução Definitiva

Implementar o padrão **"Add Curto + Set Separado + Create-if-Missing"**:

1. Criar profile SEM `login-url` (comando curto)
2. Buscar handle do profile via `find`
3. Se não existe, criar novamente (idempotência)
4. Aplicar `login-url` via `set` com aspas em linha separada

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 8 — Bump de versão:**
```typescript
const VERSION = "6.9.35"
```

**Linhas 39-58 — Adicionar nova regra de linter:**
```typescript
// v6.9.35: Block login-url with escaped vars in add command - must use separate set
{ regex: /profile add[^#\n]*login-url=.*\\\$\(/, desc: 'login-url with escaped vars in add command (use separate set after add)' },
// v6.9.35: Block login-url=$var in add command (any var) - must use separate set
{ regex: /profile add[^#\n]*login-url=\$/, desc: 'login-url=$var in add command (use separate set after add)' },
```

**Linhas 743-753 — Refatorar bloco do Hotspot Profile:**

Substituir o bloco atual:
```typescript
# 7. HOTSPOT v6.9.34 (safe URL construction)
...
/ip hotspot profile add name="hsprof-navspot" ... login-url=\$fullUrl
```

Por este bloco seguro (padrão duas etapas + create-if-missing):
```typescript
# 7. HOTSPOT v6.9.35 (add curto + set separado + create-if-missing)
# Padrao definitivo: criar profile SEM login-url, depois aplicar via set
# Isso evita linhas longas com runtime vars que quebram o parser do RouterOS 6.x
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspot.id}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl (\$urlBase . \$urlVars)

# Passo A: Criar profile SEM login-url (comando curto e seguro)
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
} on-error={:log info "NAVSPOT: profile hsprof-navspot possivelmente ja existe"}

# Passo B: Garantir handle do profile (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \$_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=${gateway} dns-name="${dnsName}" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Passo C: Aplicar login-url via set (linha separada, com aspas)
:do {
/ip hotspot profile set \$_hsprof login-url="\$fullUrl"
} on-error={:log warning "NAVSPOT: nao conseguiu setar login-url no profile"}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v${VERSION} com portal externo ativo (padrao add+set)"
```

---

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

**Linha 34 — Bump de versão:**
```typescript
const VERSION = "6.9.35"
```

**Linhas 46-61 — Adicionar nova regra de linter:**
```typescript
// v6.9.35: Block login-url with escaped vars in add command
{ regex: /profile add[^#\n]*login-url=.*\\\$\(/, desc: 'login-url with escaped vars in add command (use separate set)' },
// v6.9.35: Block login-url=$var in add command
{ regex: /profile add[^#\n]*login-url=\$/, desc: 'login-url=$var in add command (use separate set)' },
```

**Linhas 695-709 — Refatorar bloco do Hotspot Profile com create-if-missing:**

Substituir o bloco atual por:
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.35
# Padrao definitivo: construir URL em vars locais, criar profile se nao existir, aplicar via set com aspas
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl (\$urlBase . \$urlVars)

# Garantir que profile existe (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \$_hsprof] = 0) do={
:log warning "NAVSPOT-RECOVERY: profile nao existe, criando..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Aplicar login-url via set (com aspas)
:do {
/ip hotspot profile set \$_hsprof login-url="\$fullUrl"
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

**Linha 713 — Atualizar changelog:**
```typescript
:log info "FIX v6.9.35: add curto + set separado + create-if-missing (padrao definitivo)"
```

---

### 3. `src/components/modals/ScriptModal.tsx`

**Linha 28 — Atualizar versão exibida:**
```typescript
scriptVersion = "6.9.35",
```

---

### 4. `test/useMikrotikSync.test.ts` — Adicionar novos testes

Adicionar testes para validar o padrão v6.9.35:

```typescript
describe('Script Generator v6.9.35 Validation', () => {
  it('should NOT have login-url in add command', () => {
    const badPattern = `/ip hotspot profile add name="hsprof-navspot" login-url=$fullUrl`;
    const goodPattern = `/ip hotspot profile add name="hsprof-navspot" hotspot-address=...`;
    
    // Bad pattern: login-url in add command
    expect(badPattern).toMatch(/profile add[^#\n]*login-url=/);
    
    // Good pattern: add without login-url
    expect(goodPattern).not.toMatch(/profile add[^#\n]*login-url=/);
  });

  it('should have login-url in separate set command with quotes', () => {
    const setCommand = `/ip hotspot profile set $_hsprof login-url="$fullUrl"`;
    
    expect(setCommand).toContain('profile set');
    expect(setCommand).toContain('login-url="$');
  });

  it('should have create-if-missing pattern', () => {
    const createIfMissing = `:if ([:len $_hsprof] = 0) do={`;
    
    expect(createIfMissing).toContain(':if');
    expect(createIfMissing).toContain('[:len');
    expect(createIfMissing).toContain('= 0');
  });

  it('should produce \\$(mac) in final RSC', () => {
    // TypeScript uses \\$(mac) to produce \$(mac) in output
    const tsTemplate = "&mac=\\$(mac)&ip=\\$(ip)";
    
    // In the final .rsc file, it should appear as \$(mac)
    expect(tsTemplate).toMatch(/\\\$\(mac\)/);
    expect(tsTemplate).toMatch(/\\\$\(ip\)/);
  });
});
```

---

### 5. `.lovable/plan.md` — Atualizar documentação

Atualizar para refletir v6.9.35 e o padrão definitivo.

---

## Script .rsc Final Esperado (v6.9.35)

### Bootstrap:
```routeros
# 7. HOTSPOT v6.9.35 (add curto + set separado + create-if-missing)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=27a1e1be-..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)

# Passo A: Criar profile SEM login-url
:do {
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="embarcacao.navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
} on-error={:log info "NAVSPOT: profile hsprof-navspot possivelmente ja existe"}

# Passo B: Garantir handle do profile (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT: profile nao encontrado apos add, criando novamente..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="embarcacao.navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Passo C: Aplicar login-url via set (com aspas)
:do {
/ip hotspot profile set $_hsprof login-url="$fullUrl"
} on-error={:log warning "NAVSPOT: nao conseguiu setar login-url no profile"}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v6.9.35 com portal externo ativo (padrao add+set)"
```

### Recovery:
```routeros
# 6. HOTSPOT PROFILE v6.9.35
:local urlBase "https://navspot.lovable.app/hotspot-login?h=..."
:local urlVars "&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)"
:local fullUrl ($urlBase . $urlVars)

# Garantir que profile existe
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={
:log warning "NAVSPOT-RECOVERY: profile nao existe, criando..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="navspot.local" ...
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Aplicar login-url via set
:do {
/ip hotspot profile set $_hsprof login-url="$fullUrl"
} on-error={:log warning "NAVSPOT-RECOVERY: profile nao encontrado"}
```

---

## Por que isso resolve definitivamente?

| Problema | Solucao v6.9.35 |
|----------|-----------------|
| Linha `add` muito longa | `add` SEM `login-url` = linha curta |
| Runtime vars no `add` | `login-url` aplicado via `set` separado |
| Escapes confundem parser | `set` com `"$fullUrl"` em linha curta |
| Profile nao existe no recovery | `create-if-missing` antes do set |

---

## Regras de Linter Atualizadas (v6.9.35)

```typescript
const forbiddenPatterns = [
  // ... regras existentes ...
  // v6.9.35: Block login-url with escaped vars in add command
  { regex: /profile add[^#\n]*login-url=.*\\\$\(/, desc: 'login-url with escaped vars in add command (use separate set)' },
  // v6.9.35: Block login-url=$var in add command (any var)
  { regex: /profile add[^#\n]*login-url=\$/, desc: 'login-url=$var in add command (use separate set)' },
]
```

---

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.35.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT"
# Deve mostrar: "Hotspot v6.9.35 com portal externo ativo (padrao add+set)"
```

---

## Checklist Final

| Item | Descricao |
|------|-----------|
| VERSION 6.9.35 | Atualizar em todos os arquivos |
| Add curto | Hotspot profile add SEM login-url |
| Set separado | login-url aplicado via set com aspas |
| Create-if-missing | Verificar/criar profile antes do set (recovery) |
| Linter | Bloquear `profile add ... login-url=$...` |
| Testes | Adicionar testes de validacao v6.9.35 |
| Escaping | Garantir `\\$(mac)` no TS -> `\$(mac)` no RSC |

---

## Resumo de Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.35, bloco hotspot em etapas (add curto + set), nova regra linter |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.35, create-if-missing, aspas em set, nova regra linter |
| `ScriptModal.tsx` | scriptVersion 6.9.35 |
| `useMikrotikSync.test.ts` | Testes de validacao v6.9.35 |
| `.lovable/plan.md` | Documentacao atualizada |

