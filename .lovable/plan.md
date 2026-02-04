
# Correção: Sincronização de Versão em Todos os Arquivos

## Problema

A versão do sistema está inconsistente em múltiplos arquivos, causando confusão sobre qual versão está realmente em produção.

## Arquivos com Versão Desatualizada

| Arquivo | Localização | Versão Atual | Versão Correta |
|---------|-------------|--------------|----------------|
| `mikrotik-scripts/index.ts` | Linha 9 (docblock) | 7.1.2 | 7.1.4 |
| `mikrotik-script-generator/index.ts` | Linha 8 (constante) | 7.1.2 | 7.1.4 |
| `mikrotik-script-generator/index.ts` | Linha 12 (docblock) | 7.1.2 | 7.1.4 |
| `ScriptModal.tsx` | Linha 34 (default) | 7.1.0 | 7.1.4 |
| `Embarcacoes.tsx` | Linha 67 (state inicial) | 6.9.27 | 7.1.4 |
| `Embarcacoes.tsx` | Linha 141 (fallback) | 6.9.24 | 7.1.4 |
| `Embarcacoes.tsx` | Linha 157 (fallback) | 6.9.25 | 7.1.4 |

## Mudanças a Implementar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Linha 9** - Atualizar docblock:
```typescript
// De:
 * mikrotik-scripts v7.1.2

// Para:
 * mikrotik-scripts v7.1.4
```

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

**Linha 8** - Atualizar constante:
```typescript
const VERSION = "7.1.4"
```

**Linha 12** - Atualizar docblock:
```typescript
 * mikrotik-script-generator v7.1.4 - ULTRA-THIN CLIENT
```

### 3. `src/components/modals/ScriptModal.tsx`

**Linha 34** - Atualizar default:
```typescript
scriptVersion = "7.1.4",
```

### 4. `src/pages/Embarcacoes.tsx`

**Linha 67** - Atualizar estado inicial:
```typescript
const [currentScriptVersion, setCurrentScriptVersion] = useState("7.1.4");
```

**Linha 141** - Atualizar fallback:
```typescript
setCurrentScriptVersion(data.version || "7.1.4");
```

**Linha 157** - Atualizar fallback:
```typescript
setCurrentScriptVersion(data.version || "7.1.4");
```

## Resultado Esperado

Após as correções:
- O modal de script mostrará **v7.1.4** no título
- O arquivo baixado será nomeado `navspot-bootstrap-v7.1.4.rsc`
- Os logs do MikroTik mostrarão **v7.1.4** em todas as mensagens NAVSPOT
- Não haverá mais confusão entre versões

## Deploy Necessário

Após as alterações:
1. Deploy automático do frontend (Embarcacoes + ScriptModal)
2. Deploy das edge functions `mikrotik-scripts` e `mikrotik-script-generator`
