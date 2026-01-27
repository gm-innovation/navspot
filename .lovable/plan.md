
# Plano: Remover Campo "Ação" Redundante das Regras de Acesso

## Problema Identificado

O campo `acao` (Permitir/Bloquear) nas regras de acesso é **redundante e confuso** porque:

| Lista Tipo | acao Atual | Comportamento Real |
|------------|------------|-------------------|
| whitelist | permitir | Domínios que o usuário PODE acessar |
| blacklist | permitir | Domínios que devem ser BLOQUEADOS |

Como visto no banco, todas as 5 regras têm `acao=permitir`, inclusive as listas de `blacklist`. O campo não serve para nada e causa confusão na geração do script MikroTik.

## Solução

O tipo da lista (`whitelist`/`blacklist`) já define o comportamento:
- **Whitelist**: Domínios permitidos (não precisa de ação especial no MikroTik)
- **Blacklist**: Domínios bloqueados (adicionar `action=reject` no walled-garden + Layer7+Firewall)

Remover o campo `acao` do formulário e usar `lista.tipo` na lógica.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/RegrasAcesso.tsx` | Remover campo "Ação" do formulário e da tabela |
| `src/components/modals/DispositivoDetailsModal.tsx` | Remover exibição de `acao` |
| `src/hooks/useEmbarcacoesWithHotspot.ts` | Remover `acao` da criação automática de regras |
| `supabase/functions/mikrotik-script-generator/index.ts` | Usar `lista.tipo` ao invés de `regra.acao` |
| `supabase/functions/mikrotik-sync/index.ts` | Usar `lista.tipo` ao invés de `regra.acao` |

---

## Detalhes das Mudanças

### 1. Formulário (RegrasAcesso.tsx)

**Remover linhas 581-600** (campo "Ação"):
```tsx
// REMOVER este bloco inteiro
<div className="grid grid-cols-4 items-center gap-4">
  <Label htmlFor="acao" className="text-right">
    Ação
  </Label>
  <Select
    value={formData.acao}
    onValueChange={(value: "permitir" | "bloquear") => 
      setFormData(prev => ({ ...prev, acao: value }))
    }
  >
    ...
  </Select>
</div>
```

**Remover do state** (linhas 104-117):
- Remover `acao: "permitir" as "permitir" | "bloquear"` do formData

**Remover da tabela** (linhas 441-451):
- Remover coluna "Ação" que exibe o badge permitir/bloquear

### 2. Coluna da Tabela

Substituir a coluna "Ação" por exibir o tipo da lista diretamente (já existe na coluna "Lista"):
```tsx
// Remover TableHead e TableCell da coluna "Ação"
```

### 3. Script Generator (mikrotik-script-generator/index.ts)

**Antes (linhas 383-394)**:
```typescript
for (const regra of regrasGlobais) {
  if (regra.listas_acesso) {
    const dominios = regra.listas_acesso.dominios || []
    for (const dominio of dominios) {
      if (regra.acao === 'permitir') {  // ❌ ERRADO
        allowedDomains.add(dominio)
      } else {
        blockedDomains.add(dominio)
      }
    }
  }
}
```

**Depois**:
```typescript
for (const regra of regrasGlobais) {
  if (regra.listas_acesso) {
    const dominios = regra.listas_acesso.dominios || []
    for (const dominio of dominios) {
      if (regra.listas_acesso.tipo === 'blacklist') {  // ✅ CORRETO
        blockedDomains.add(dominio)
      }
      // Whitelists não precisam de ação especial no walled-garden
      // O hotspot permite acesso após login por padrão
    }
  }
}
```

**Remover a seção de allowed domains no walled-garden**:
```typescript
// REMOVER: Whitelists não devem estar no walled-garden
// for (const domain of allowedDomains) {
//   script += `add dst-host="${domain}" action=allow comment="..."\n`
// }
```

### 4. MikroTik Sync (mikrotik-sync/index.ts)

**Antes**:
```typescript
return {
  action: regra.acao,
  domains: (lista?.dominios || []) as string[],
  apps: (lista?.aplicativos || []) as string[]
}
```

**Depois**:
```typescript
return {
  action: lista?.tipo === 'blacklist' ? 'block' : 'allow',
  domains: (lista?.dominios || []) as string[],
  apps: (lista?.aplicativos || []) as string[]
}
```

### 5. Hook de Embarcações (useEmbarcacoesWithHotspot.ts)

Remover `acao: 'permitir'` da criação automática de regras (linhas 63 e 184):
```typescript
// Remover ou manter como legacy - o campo ainda existe no banco
// Mas não será mais usado na lógica
acao: 'permitir', // Manter para compatibilidade, mas ignorar
```

---

## Banco de Dados

**Opção 1 - Manter coluna (recomendado):**
- Manter a coluna `acao` no banco com default `'permitir'`
- Ignorar na lógica - usar sempre `lista.tipo`
- Sem migration necessária

**Opção 2 - Remover coluna (futuro):**
- Criar migration para remover coluna `acao`
- Só fazer depois que tudo estiver funcionando

---

## Resumo Visual

| Local | Antes | Depois |
|-------|-------|--------|
| Formulário | Campo "Ação" com dropdown | Removido |
| Tabela | Coluna "Ação" com badge | Removida |
| Script Generator | Usa `regra.acao` | Usa `lista.tipo` |
| MikroTik Sync | Usa `regra.acao` | Usa `lista.tipo` |
| Banco de dados | Mantém coluna `acao` | Mantém (mas ignora) |

---

## Fluxo Corrigido

```text
Lista "Redes Sociais" (tipo=blacklist)
  ↓
Script Generator verifica lista.tipo === 'blacklist'
  ↓
Adiciona ao walled-garden: action=reject
  ↓
Adiciona ao Layer7+Firewall: drop
  ↓
Resultado: Facebook bloqueado ✅
```

```text
Lista "Email" (tipo=whitelist)
  ↓
Script Generator verifica lista.tipo === 'whitelist'
  ↓
NÃO adiciona ao walled-garden (acesso após login é permitido por padrão)
  ↓
Resultado: Gmail acessível após login ✅
```
