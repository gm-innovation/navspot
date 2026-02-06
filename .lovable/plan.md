

# Plano: Sincronizar Versoes para v7.1.31

## Problema

O `mikrotik-scripts` foi atualizado para v7.1.31, mas os outros componentes permaneceram em v7.1.29:
- `mikrotik-script-generator` gera bootstrap com v7.1.29 no header
- `ScriptModal.tsx` tem fallback default v7.1.29

## Arquivos a Alterar

### 1. supabase/functions/mikrotik-script-generator/index.ts

**Linha 8:**
```typescript
// DE:
const VERSION = "7.1.29"

// PARA:
const VERSION = "7.1.31"
```

### 2. src/components/modals/ScriptModal.tsx

**Linha 34:**
```typescript
// DE:
scriptVersion = "7.1.29",

// PARA:
scriptVersion = "7.1.31",
```

## Resultado Esperado

Apos as alteracoes:
- O modal mostrara "Script MikroTik v7.1.31"
- O bootstrap baixado tera "NAVSPOT Bootstrap Script v7.1.31"
- O instalador baixara scripts de v7.1.31 do mikrotik-scripts
- Todas as versoes estarao sincronizadas

## Nota Tecnica

O bootstrap (gerado pelo script-generator) apenas configura a infraestrutura basica e chama `/tool fetch` para baixar os scripts reais do `mikrotik-scripts`. Por isso e critico que as versoes estejam alinhadas - o bootstrap v7.1.31 espera baixar scripts v7.1.31.

