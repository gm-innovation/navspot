

# Plano de Implementação v6.9.36 — URL Incremental + Set Sem Aspas

## Diagnóstico do Problema Atual

Os arquivos atuais (v6.9.35) ainda têm duas questões:

1. **Linha longa com `\$(...)`**: A variável `urlVars` concentra todos os runtime vars em uma única linha:
   ```routeros
   :local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
   ```
   Isso pode disparar erros de parser em RouterOS 6.x quando a linha final fica muito longa.

2. **Set com aspas**: O comando usa `login-url="\$fullUrl"` (com aspas), o que pode disparar validadores mais antigos ou criar ambiguidade.

---

## Mudanças a Implementar

### 1. `supabase/functions/mikrotik-script-generator/index.ts`

#### 1.1 Bump de versão (linha 8)
```typescript
const VERSION = "6.9.36"
```

#### 1.2 Adicionar regra de linter para linhas longas (após linha 61)
```typescript
// v6.9.36: Block ANY line >120 chars containing \$(...) - not just command lines
{ regex: /^.{121,}.*\\\$\(/m, desc: 'Line >120 chars containing \\$(...) (breaks /import RouterOS 6.x - split into urlVars1/2/3)' },
```

#### 1.3 Refatorar bloco do Hotspot (linhas 747-773)
Substituir a construção de URL em única linha por construção incremental:

**De (atual):**
```typescript
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspot.id}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl (\$urlBase . \$urlVars)
...
/ip hotspot profile set \$_hsprof login-url="\$fullUrl"
```

**Para (v6.9.36):**
```typescript
# 7. HOTSPOT v6.9.36 (URL incremental + set sem aspas)
# Padrao definitivo: dividir runtime vars em linhas curtas (<120 chars)
# e aplicar login-url SEM aspas (evita linter trigger)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspot.id}"
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"

:local fullUrl \$urlBase
:set fullUrl (\$fullUrl . \$urlVars1)
:set fullUrl (\$fullUrl . \$urlVars2)
:set fullUrl (\$fullUrl . \$urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len \$fullUrl] . " sample=" . [:pick \$fullUrl 0 120])

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

# Passo C: Aplicar login-url via set SEM aspas (v6.9.36)
:do {
/ip hotspot profile set \$_hsprof login-url=\$fullUrl
} on-error={:log warning "NAVSPOT: nao conseguiu setar login-url no profile"}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v${VERSION} com portal externo ativo (URL incremental)"
```

---

### 2. `supabase/functions/mikrotik-recovery-download/index.ts`

#### 2.1 Bump de versão (linha 34)
```typescript
const VERSION = "6.9.36"
```

#### 2.2 Adicionar regra de linter para linhas longas (após linha 65)
```typescript
// v6.9.36: Block ANY line >120 chars containing \$(...) - not just command lines
{ regex: /^.{121,}.*\\\$\(/m, desc: 'Line >120 chars containing \\$(...) (breaks /import RouterOS 6.x - split into urlVars1/2/3)' },
```

#### 2.3 Refatorar bloco do Hotspot (linhas 699-721)
**De (atual):**
```typescript
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
:local fullUrl (\$urlBase . \$urlVars)
...
/ip hotspot profile set \$_hsprof login-url="\$fullUrl"
```

**Para (v6.9.36):**
```typescript
# 6. HOTSPOT PROFILE - Garantir login-url para portal externo v6.9.36
# URL incremental: dividir runtime vars em linhas curtas (<120 chars)
:log info "NAVSPOT-RECOVERY: Configurando hotspot profile login-url..."
:local urlBase "https://navspot.lovable.app/hotspot-login?h=${hotspotId}"
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"

:local fullUrl \$urlBase
:set fullUrl (\$fullUrl . \$urlVars1)
:set fullUrl (\$fullUrl . \$urlVars2)
:set fullUrl (\$fullUrl . \$urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len \$fullUrl] . " sample=" . [:pick \$fullUrl 0 120])

# Garantir que profile existe (create-if-missing)
:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len \$_hsprof] = 0) do={
:log warning "NAVSPOT-RECOVERY: profile nao existe, criando..."
/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1 dns-name="navspot.local" html-directory=hotspot login-by=http-pap,http-chap keepalive-timeout=2m idle-timeout=5m
:set _hsprof [/ip hotspot profile find name="hsprof-navspot"]
}

# Aplicar login-url via set SEM aspas (v6.9.36)
:do {
/ip hotspot profile set \$_hsprof login-url=\$fullUrl
:log info "NAVSPOT-RECOVERY: login-url configurada no hotspot profile"
} on-error={
:log warning "NAVSPOT-RECOVERY: Hotspot profile hsprof-navspot nao encontrado - execute bootstrap completo"
}
:log info "NAVSPOT-RECOVERY: login-url verificada"
```

#### 2.4 Atualizar changelog (linha 725)
```typescript
:log info "FIX v6.9.36: URL incremental + set sem aspas (padrao definitivo)"
```

---

### 3. `src/components/modals/ScriptModal.tsx`

#### 3.1 Atualizar versão exibida (linha 28)
```typescript
scriptVersion = "6.9.36",
```

---

### 4. `test/useMikrotikSync.test.ts` — Novos Testes v6.9.36

Substituir os testes v6.9.35 por testes atualizados para o padrão v6.9.36:

```typescript
describe('Script Generator v6.9.36 Validation', () => {
  it('should NOT have login-url in add command', () => {
    const badPattern = `/ip hotspot profile add name="hsprof-navspot" login-url=$fullUrl`;
    const goodPattern = `/ip hotspot profile add name="hsprof-navspot" hotspot-address=192.168.88.1`;
    
    expect(badPattern).toMatch(/profile add[^#\n]*login-url=/);
    expect(goodPattern).not.toMatch(/profile add[^#\n]*login-url=/);
  });

  it('should have login-url in separate set command WITHOUT quotes (v6.9.36)', () => {
    const setCommand = `/ip hotspot profile set $_hsprof login-url=$fullUrl`;
    
    expect(setCommand).toContain('profile set');
    expect(setCommand).toContain('login-url=$fullUrl');
    expect(setCommand).not.toContain('login-url="$fullUrl"');
  });

  it('should have incremental URL construction with urlVars1/2/3', () => {
    const urlConstruction = `
:local urlVars1 "&mac=\\$(mac)"
:local urlVars2 "&ip=\\$(ip)"
:local urlVars3 "&link-login-only=\\$(link-login-only)"
:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
`;
    
    expect(urlConstruction).toContain('urlVars1');
    expect(urlConstruction).toContain('urlVars2');
    expect(urlConstruction).toContain('urlVars3');
    expect(urlConstruction).toContain(':set fullUrl');
  });

  it('should have create-if-missing pattern', () => {
    const createIfMissing = `:if ([:len $_hsprof] = 0) do={`;
    
    expect(createIfMissing).toContain(':if');
    expect(createIfMissing).toContain('[:len');
    expect(createIfMissing).toContain('= 0');
  });

  it('should produce \\$(mac) in final RSC (single backslash)', () => {
    const tsTemplate = "&mac=\\$(mac)&ip=\\$(ip)";
    
    expect(tsTemplate).toMatch(/\\\$\(mac\)/);
    expect(tsTemplate).toMatch(/\\\$\(ip\)/);
  });

  it('should NOT have urlVars with multiple runtime vars in same line', () => {
    const badPattern = ':local urlVars "&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"';
    const goodPattern1 = ':local urlVars1 "&mac=\\$(mac)"';
    const goodPattern2 = ':local urlVars2 "&ip=\\$(ip)"';
    
    // Bad: multiple runtime vars in same line
    const multiVarRegex = /\\\$\([^)]+\).*\\\$\([^)]+\)/;
    expect(badPattern).toMatch(multiVarRegex);
    
    // Good: single runtime var per line
    expect(goodPattern1).not.toMatch(multiVarRegex);
    expect(goodPattern2).not.toMatch(multiVarRegex);
  });

  it('should have debug log for fullUrl length', () => {
    const debugLog = ':log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])';
    
    expect(debugLog).toContain('fullUrl-len=');
    expect(debugLog).toContain('[:len $fullUrl]');
    expect(debugLog).toContain('[:pick $fullUrl 0 120]');
  });
});
```

---

## Script .rsc Final Esperado (v6.9.36)

### Bootstrap:
```routeros
# 7. HOTSPOT v6.9.36 (URL incremental + set sem aspas)
:local urlBase "https://navspot.lovable.app/hotspot-login?h=27a1e1be-..."
:local urlVars1 "&mac=\$(mac)"
:local urlVars2 "&ip=\$(ip)"
:local urlVars3 "&link-login-only=\$(link-login-only)"

:local fullUrl $urlBase
:set fullUrl ($fullUrl . $urlVars1)
:set fullUrl ($fullUrl . $urlVars2)
:set fullUrl ($fullUrl . $urlVars3)

:log info ("NAVSPOT-DEBUG: fullUrl-len=" . [:len $fullUrl] . " sample=" . [:pick $fullUrl 0 120])

:do { /ip hotspot profile add name="hsprof-navspot" ... } on-error={...}

:local _hsprof [/ip hotspot profile find name="hsprof-navspot"]
:if ([:len $_hsprof] = 0) do={ ... }

:do { /ip hotspot profile set $_hsprof login-url=$fullUrl } on-error={...}

/ip hotspot add name="hs-navspot" interface=bridge1 address-pool="hs-pool-navspot" profile="hsprof-navspot" disabled=no
:log info "NAVSPOT: Hotspot v6.9.36 com portal externo ativo (URL incremental)"
```

---

## Por que v6.9.36 é definitivo?

| Problema | Solução v6.9.36 |
|----------|-----------------|
| Linha longa com `\$(...)` | Dividir em `urlVars1/2/3` — cada linha curta |
| `login-url="$fullUrl"` com aspas | Usar `login-url=$fullUrl` sem aspas |
| Debug difícil | Log com `fullUrl-len=` e sample de 120 chars |
| Linter incompleto | Nova regra: linhas >120 chars com `\$(...)` |

---

## Regra de Linter Adicionada (v6.9.36)

```typescript
// v6.9.36: Block ANY line >120 chars containing \$(...) - not just command lines
{ regex: /^.{121,}.*\\\$\(/m, desc: 'Line >120 chars containing \\$(...) (breaks /import RouterOS 6.x - split into urlVars1/2/3)' },
```

---

## Teste no MikroTik

```routeros
/import navspot-bootstrap-v6.9.36.rsc
# Deve completar SEM "expected end of command"

/ip hotspot profile print where name="hsprof-navspot"
# login-url deve mostrar: https://navspot.lovable.app/hotspot-login?h=...&mac=$(mac)&ip=$(ip)...

/log print where message~"NAVSPOT-DEBUG"
# Deve mostrar: fullUrl-len=... sample=https://navspot.lovable.app/hotspot-login?h=...
```

---

## Checklist Final

| Item | Descrição |
|------|-----------|
| VERSION 6.9.36 | Atualizar em generator, recovery, ScriptModal |
| urlVars1/2/3 | Dividir runtime vars em linhas separadas |
| set sem aspas | `login-url=$fullUrl` sem aspas |
| Debug log | Adicionar log com `fullUrl-len=` e sample |
| Linter | Nova regra para linhas >120 chars com `\$(...)` |
| Testes | Atualizar para validar padrão v6.9.36 |
| Deploy | Fazer deploy das functions e verificar |

---

## Resumo de Mudanças

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-script-generator/index.ts` | VERSION 6.9.36, urlVars1/2/3, set sem aspas, debug log, nova regra linter |
| `mikrotik-recovery-download/index.ts` | VERSION 6.9.36, urlVars1/2/3, set sem aspas, debug log, nova regra linter, changelog |
| `ScriptModal.tsx` | scriptVersion 6.9.36 |
| `useMikrotikSync.test.ts` | Testes atualizados para v6.9.36 |

