

# Plano: Adicionar Botão "Gerar Script MikroTik" na Página de Embarcações

## Problema

A página de Embarcações foi unificada com Hotspots para o cadastro, mas a funcionalidade de gerar o script MikroTik não foi migrada. O botão de script ainda está apenas na página `/hotspots` (que não está no menu).

## Solução

Adicionar um botão "Script" no card de cada embarcação que:
1. Gera o script MikroTik usando a edge function existente
2. Abre o modal com o script para copiar/download

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/Embarcacoes.tsx` | Adicionar botão de script e modal |

---

## Mudanças Técnicas

### Importações Necessárias

```typescript
import { Code } from "lucide-react";
import { useGenerateHotspotScript } from "@/hooks/useHotspots";
import { ScriptModal } from "@/components/modals/ScriptModal";
```

### Novos Estados

```typescript
const [scriptModalOpen, setScriptModalOpen] = useState(false);
const [currentScript, setCurrentScript] = useState("");
const [currentHotspotName, setCurrentHotspotName] = useState("");
const [currentHotspotId, setCurrentHotspotId] = useState("");

const generateScript = useGenerateHotspotScript();
```

### Handler para Gerar Script

```typescript
const handleGenerateScript = async (embarcacao: EmbarcacaoWithStats) => {
  const hotspot = getHotspotForEmbarcacao(embarcacao.id);
  if (!hotspot) return;
  
  setCurrentHotspotId(hotspot.id);
  setCurrentHotspotName(embarcacao.nome);
  
  generateScript.mutate(hotspot.id, {
    onSuccess: (data) => {
      setCurrentScript(data.script || "# Script não gerado");
      setScriptModalOpen(true);
    },
  });
};

const handleRegenerateScript = () => {
  if (currentHotspotId) {
    generateScript.mutate(currentHotspotId, {
      onSuccess: (data) => {
        setCurrentScript(data.script || "# Script não gerado");
      },
    });
  }
};
```

### Botão no Card da Embarcação

Adicionar entre os botões "Editar" e "Excluir":

```tsx
{/* Ações */}
<div className="flex gap-2 pt-2">
  <Button 
    variant="outline" 
    size="sm" 
    className="flex-1"
    onClick={() => handleEdit(embarcacao)}
  >
    <Settings className="h-4 w-4 mr-2" />
    Editar
  </Button>
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleGenerateScript(embarcacao)}
    disabled={!hotspot || generateScript.isPending}
    title={hotspot ? "Gerar Script MikroTik" : "Configure a rede primeiro"}
  >
    <Code className="h-4 w-4" />
  </Button>
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleDelete(embarcacao)}
  >
    <Trash2 className="h-4 w-4 text-destructive" />
  </Button>
</div>
```

### ScriptModal

Adicionar após o AlertDialog:

```tsx
<ScriptModal
  open={scriptModalOpen}
  onOpenChange={setScriptModalOpen}
  script={currentScript}
  hotspotName={currentHotspotName}
  onRegenerate={handleRegenerateScript}
  isRegenerating={generateScript.isPending}
/>
```

---

## Fluxo Visual

```text
+------------------------------------------+
| [Ship Icon]  Nome da Embarcação          |
|              AHTS                         |
|                                          |
| Rede: 192.168.88.1/24   Sync: 5min       |
|                                          |
| ┌─────────┐ ┌────┐ ┌────┐                |
| │ Editar  │ │</>│ │ 🗑 │                 |
| └─────────┘ └────┘ └────┘                |
|               ↑                          |
|    Botão de Script MikroTik              |
+------------------------------------------+
```

---

## Comportamento

| Estado | Ação |
|--------|------|
| Hotspot configurado | Botão ativo, gera script ao clicar |
| Sem hotspot | Botão desabilitado com tooltip explicativo |
| Gerando script | Botão mostra loading |

---

## Resumo

| Mudança | Descrição |
|---------|-----------|
| Botão `</>` no card | Abre modal com script MikroTik |
| Reutiliza `ScriptModal` | Componente já existente |
| Reutiliza `useGenerateHotspotScript` | Hook já existente |

