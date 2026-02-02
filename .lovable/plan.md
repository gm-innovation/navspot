

# Plano: Restaurar Visualização e Botão Copiar no ScriptModal

## O que será alterado

O `ScriptModal` será modificado para mostrar a visualização do script e o botão de copiar de forma direta, sem estar escondido em uma seção colapsível.

---

## Mudanças no arquivo

**Arquivo:** `src/components/modals/ScriptModal.tsx`

### Layout proposto

1. **Manter** as instruções de instalação (método recomendado)
2. **Manter** os botões de Download e Copiar lado a lado (ambos visíveis)
3. **Manter** a visualização do script (Textarea) sempre visível
4. **Remover** a seção colapsível "Opções Avançadas"
5. **Manter** a seção de auto-recuperação e verificação pós-instalação

### Estrutura final

```
┌─────────────────────────────────────────────┐
│ Script MikroTik v6.9.12 - {hotspotName}     │
├─────────────────────────────────────────────┤
│ ℹ️ Método Recomendado: Download + Import    │
│    1. Conecte-se ao MikroTik via ether2...  │
│    2. Clique em "Download Script"...        │
│    /import navspot-bootstrap.rsc            │
├─────────────────────────────────────────────┤
│ [📋 Copiar Script]  [⬇️ Download (.rsc)]    │  ← Ambos visíveis
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ # NAVSPOT Bootstrap v6.9.12...          │ │  ← Textarea visível
│ │ :log info "NAVSPOT: Iniciando..."       │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ 🛡️ Auto-Recuperação v6.9.12                 │
│    • navspot-guardian: Verifica...          │
├─────────────────────────────────────────────┤
│ Verificação pós-instalação:                 │
│    /log print where message~"NAVSPOT"       │
├─────────────────────────────────────────────┤
│ [🔄 Regenerar Script]                       │
└─────────────────────────────────────────────┘
```

---

## Código a ser alterado

Remover o `Collapsible` e trazer o `Textarea` + botão "Copiar" para fora:

- **Linhas 152-203:** Substituir toda a seção `<Collapsible>` por:
  - Textarea do script (sempre visível, com altura maior ~300px)
  - Dois botões lado a lado: "Copiar Script" e "Download Script (.rsc)"

---

## Resultado esperado

- Script visível diretamente ao abrir o modal
- Botão "Copiar" em destaque ao lado de "Download"
- Mantém as instruções e informações de auto-recuperação
- Remove o padrão "escondido" que dificultava o acesso

