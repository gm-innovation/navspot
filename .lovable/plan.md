

# Correção do Modal de Script MikroTik - Scroll e Layout

## Problema Identificado

O modal do script MikroTik está quebrando porque:

| Problema | Causa |
|----------|-------|
| Conteúdo cortado | `max-h-[90vh]` sem `overflow-y-auto` |
| Botões invisíveis | Footer fica abaixo da área visível |
| Não permite scroll | Falta configuração de overflow no container |

O conteúdo do modal inclui:
- Header (título + descrição)
- Alert grande (aviso de desconexão com 5+ linhas)
- Textarea do script (min-h-[300px])
- Seção de verificação pós-instalação
- Footer com 3 botões

Isso ultrapassa os 90vh disponíveis em telas menores.

---

## Solução

Reorganizar o layout do modal para:

1. **Header fixo no topo** (sempre visível)
2. **Área de conteúdo scrollável** (Alert + Script + Verificação)
3. **Footer fixo na base** (botões sempre acessíveis)

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/components/modals/ScriptModal.tsx` | Modificar - adicionar scroll e reorganizar layout |

---

## Mudanças no ScriptModal.tsx

### Estrutura Atual (Problemática)

```tsx
<DialogContent className="sm:max-w-[700px] max-h-[90vh]">
  <DialogHeader>...</DialogHeader>
  <Alert>...</Alert>           // Grande
  <Textarea>...</Textarea>     // min-h-[300px]
  <div>Verificação...</div>    // Seção extra
  <DialogFooter>...</DialogFooter>  // Cortado!
</DialogContent>
```

### Estrutura Nova (Corrigida)

```tsx
<DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
  <DialogHeader>...</DialogHeader>
  
  {/* Área scrollável */}
  <div className="flex-1 overflow-y-auto space-y-4 pr-2">
    <Alert>...</Alert>
    <Textarea>...</Textarea>
    <div>Verificação...</div>
  </div>
  
  <DialogFooter>...</DialogFooter>  {/* Sempre visível */}
</DialogContent>
```

---

## Detalhes das Classes CSS

| Elemento | Classes | Propósito |
|----------|---------|-----------|
| DialogContent | `flex flex-col` | Layout flexbox vertical |
| Container scroll | `flex-1 overflow-y-auto` | Ocupa espaço restante e permite scroll |
| Container scroll | `pr-2` | Padding para scrollbar não sobrepor conteúdo |
| Container scroll | `space-y-4` | Espaçamento entre elementos internos |
| Textarea | `max-h-[250px]` | Limitar altura para caber mais conteúdo |

---

## Código Corrigido

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
    <DialogHeader>
      <DialogTitle>Script MikroTik - {hotspotName}</DialogTitle>
      <DialogDescription>
        Copie este script e execute no terminal do seu roteador MikroTik.
      </DialogDescription>
    </DialogHeader>
    
    {/* Área scrollável */}
    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
      <Alert className="bg-yellow-500/10 border-yellow-500/50">
        {/* ... conteúdo do alert ... */}
      </Alert>

      <div className="relative">
        <Textarea
          value={script}
          readOnly
          className="font-mono text-xs min-h-[200px] max-h-[250px] resize-none"
        />
      </div>

      <div className="bg-muted/50 p-4 rounded-lg text-sm">
        {/* ... verificação pós-instalação ... */}
      </div>
    </div>

    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
      {/* ... botões ... */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Ajustes Adicionais

| Elemento | Antes | Depois |
|----------|-------|--------|
| Textarea min-h | 300px | 200px |
| Textarea max-h | nenhum | 250px |
| DialogFooter | sem borda | `border-t pt-4` |
| Container interno | nenhum | `overflow-y-auto` |

---

## Resultado Esperado

```text
+----------------------------------+
| Script MikroTik - Nome           | <- Header fixo
+----------------------------------+
| ⚠️ Atenção: Você perderá...     | 
| 1. Cole o script...              |  <- Área
| 2. Feche o Winbox...             |     scrollável
|                                  |
| [Script textarea com scroll]     |
|                                  |
| Verificação pós-instalação:      |
| /log print where...              |
+----------------------------------+
| [Regenerar] [Copiar] [Download]  | <- Footer fixo
+----------------------------------+
```

