
# Correção: Adicionar `hotspotId` na Chamada do ScriptModal

## Problema Identificado

O botão "Baixar Recovery (.rsc)" não aparece porque a prop `hotspotId` não está sendo passada para o `ScriptModal` na página `Embarcacoes.tsx`.

**Análise do código atual:**

| Arquivo | Status |
|---------|--------|
| `src/components/modals/ScriptModal.tsx` | Correto - aceita `hotspotId` e renderiza o botão condicionalmente (linha 196) |
| `src/hooks/useHotspots.ts` | Correto - `useDownloadRecoveryScript` está implementado |
| `src/pages/Embarcacoes.tsx` | Problema - não passa `hotspotId` para o `ScriptModal` |

**Código atual (linhas 446-454):**
```tsx
<ScriptModal
  open={scriptModalOpen}
  onOpenChange={setScriptModalOpen}
  bootstrapScript={bootstrapScript}
  finalizeScript={finalizeScript}
  hotspotName={currentHotspotName}
  onRegenerate={handleRegenerateScript}
  isRegenerating={generateScript.isPending}
/>
```

**Observação importante:** A variável `currentHotspotId` já existe e é populada corretamente na linha 133 dentro de `handleGenerateScript`. O problema é simplesmente que ela não está sendo passada como prop.

---

## Solução

Adicionar a prop `hotspotId={currentHotspotId}` na chamada do `ScriptModal`.

**Código corrigido:**
```tsx
<ScriptModal
  open={scriptModalOpen}
  onOpenChange={setScriptModalOpen}
  bootstrapScript={bootstrapScript}
  finalizeScript={finalizeScript}
  hotspotName={currentHotspotName}
  hotspotId={currentHotspotId}  // <-- ADICIONAR ESTA LINHA
  onRegenerate={handleRegenerateScript}
  isRegenerating={generateScript.isPending}
/>
```

---

## Arquivo a Modificar

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `src/pages/Embarcacoes.tsx` | 451-452 | Adicionar `hotspotId={currentHotspotId}` |

---

## Resultado Esperado

Após a correção, o modal de script exibirá o botão "Baixar Recovery (.rsc)" no footer, abaixo da área de scroll e acima do botão "Regenerar Script".
