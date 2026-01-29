

# NAVSPOT Bootstrap Script v6.4 - Migração em Duas Etapas (Atualizado)

## Resumo das Mudanças

Implementar migração segura em duas etapas com validações de integridade no script de finalização.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar - gerar 2 scripts com validações |
| `src/components/modals/ScriptModal.tsx` | Modificar - exibir 2 seções com downloads separados |
| `src/pages/Embarcacoes.tsx` | Modificar - consumir nova resposta da API |
| `src/hooks/useHotspots.ts` | Verificar tipo de retorno do mutate |

---

## Mudanças na Edge Function

### Nova Estrutura de Resposta

```typescript
return {
  success: true,
  bootstrap_script,      // Parte 1: tudo exceto ether2
  finalize_script,       // Parte 2: apenas ether2 com validações
  hotspot_name,
  version: '6.4'
}
```

### Script de Finalização com Validações

```routeros
:log info "NAVSPOT v6.4 Parte 2: Finalizando migracao da ether2..."

# Validacoes de seguranca
:if ([:len [/interface bridge find name="bridge1"]] = 0) do={
  :log error "NAVSPOT: ERRO - bridge1 nao encontrada! Execute a Parte 1 primeiro."
  :error "Abortando: bridge1 inexistente"
}

:if ([:len [/ip address find address="192.168.88.1/24"]] = 0) do={
  :log error "NAVSPOT: ERRO - IP 192.168.88.1/24 nao encontrado! Execute a Parte 1 primeiro."
  :error "Abortando: IP inexistente"
}

:log info "NAVSPOT: Validacoes OK, prosseguindo..."

# Migrar ether2 para bridge1
:do { /interface bridge port remove [find interface=ether2] } on-error={}
/interface bridge port add bridge=bridge1 interface=ether2 comment="navspot-lan"
:log info "NAVSPOT: ether2 migrada com sucesso"

# Remover bridge antiga
:delay 2s
:do { /interface bridge remove [find name="bridge"] } on-error={}
:log info "NAVSPOT: Bridge defconf removida"

# Finalizacao
:log info "=========================================="
:log info "NAVSPOT v6.4: INSTALACAO 100% CONCLUIDA!"
:log info "Todas as portas (ether2-5) estao na bridge1"
:log info "Hotspot ativo em 192.168.88.1"
:log info "Sync rodando a cada ${syncIntervalMinutes} minuto(s)"
:log info "=========================================="
```

### Lógica de Migração Parcial (Bootstrap)

Excluir ether2 da migração automática:

```typescript
// Portas para migrar na Parte 1 (excluir ether2 e WAN)
const partialPorts = lanPorts.filter(p => p !== 'ether2')
const partialMigrationOrder = [...partialPorts].sort((a, b) => b.localeCompare(a)) // 5, 4, 3
```

Mensagem de pausa no final do bootstrap:

```routeros
# 12. PAUSA PARA TROCA DE CABO
:log warning "=========================================="
:log warning "NAVSPOT: MIGRACAO PARCIAL CONCLUIDA"
:log warning "ACAO NECESSARIA:"
:log warning "1. Desconecte o cabo da ether2"
:log warning "2. Conecte na ether3, ether4 ou ether5"
:log warning "3. Reconecte o Winbox em 192.168.88.1"
:log warning "4. Rode: /import navspot-finalize-ether2.rsc"
:log warning "=========================================="
```

---

## Mudanças no ScriptModal

### Nova Interface de Props

```typescript
interface ScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrapScript: string;      // Parte 1
  finalizeScript: string;       // Parte 2
  hotspotName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}
```

### Layout com Duas Seções

1. **Seção "Parte 1: Bootstrap"**
   - Alert com instruções de upload e execução
   - Textarea com script bootstrap
   - Botões: Copiar + Download navspot-bootstrap.rsc

2. **Separador visual + Checklist de troca de cabo**

3. **Seção "Parte 2: Finalização"**
   - Alert com instruções pós-troca
   - Textarea com script de finalização
   - Botões: Copiar + Download navspot-finalize-ether2.rsc

### Downloads Separados

```typescript
const handleDownloadBootstrap = () => {
  const blob = new Blob([bootstrapScript], { type: "text/plain" });
  downloadFile(blob, "navspot-bootstrap.rsc");
};

const handleDownloadFinalize = () => {
  const blob = new Blob([finalizeScript], { type: "text/plain" });
  downloadFile(blob, "navspot-finalize-ether2.rsc");
};
```

---

## Mudanças na Página Embarcacoes.tsx

### Estados Adicionais

```typescript
const [bootstrapScript, setBootstrapScript] = useState("");
const [finalizeScript, setFinalizeScript] = useState("");
```

### Consumir Nova Resposta

```typescript
generateScript.mutate(hotspot.id, {
  onSuccess: (data) => {
    setBootstrapScript(data.bootstrap_script || "");
    setFinalizeScript(data.finalize_script || "");
    setScriptModalOpen(true);
  },
});
```

### Atualizar Props do Modal

```tsx
<ScriptModal
  open={scriptModalOpen}
  onOpenChange={setScriptModalOpen}
  bootstrapScript={bootstrapScript}
  finalizeScript={finalizeScript}
  hotspotName={selectedEmbarcacao?.hotspot?.nome || ""}
  onRegenerate={() => generateScript.mutate(selectedHotspotId)}
  isRegenerating={generateScript.isPending}
/>
```

---

## Fluxo de Instalação Completo

```text
PARTE 1: BOOTSTRAP
──────────────────
1. Técnico conectado na ether2 via MAC/Winbox
2. Upload de navspot-bootstrap.rsc
3. Terminal: /import navspot-bootstrap.rsc
4. Script configura tudo + migra ether5, ether4, ether3
5. Script PARA e exibe mensagem de ação necessária
6. Técnico ainda conectado (ether2 não migrada)

TROCA DE CABO
─────────────
7. Técnico desconecta cabo da ether2
8. Conecta na ether3, 4 ou 5 (já na bridge1)
9. Reconecta Winbox via 192.168.88.1

PARTE 2: FINALIZAÇÃO
────────────────────
10. Upload de navspot-finalize-ether2.rsc (se ainda não fez)
11. Terminal: /import navspot-finalize-ether2.rsc
12. Validações: bridge1 existe? IP existe?
13. Se OK: Migra ether2 → bridge1
14. Remove bridge defconf
15. INSTALAÇÃO 100% CONCLUÍDA
```

---

## Validações do Finalize Script

| Validação | Erro se Falhar | Ação |
|-----------|----------------|------|
| bridge1 existe | "Execute a Parte 1 primeiro" | Aborta |
| IP 192.168.88.1/24 existe | "Execute a Parte 1 primeiro" | Aborta |

Essas validações garantem que:
- O técnico não resetou o MikroTik acidentalmente
- A Parte 1 foi executada corretamente
- A infraestrutura está pronta para receber a ether2

---

## Estrutura do Bootstrap Script v6.4 (Parte 1)

```routeros
:log info "NAVSPOT v6.4: Iniciando instalacao..."

# 0. VALIDACAO INICIAL (WAN existe)
# 1. LIMPEZA INICIAL (fabrica + navspot)
# 2. CONFIGURAR WAN (DHCP client)
# 3. IDENTIDADE
# 4. CRIAR BRIDGE1 VAZIA
# 5. CONFIGURAR REDE NA BRIDGE1 (IP, Pool, DHCP, DNS)
# 6. NAT
# 7. HOTSPOT
# 8. WALLED GARDEN
# 9. TOKEN
# 10. SYNC SCRIPT + SCHEDULER

# 11. MIGRACAO PARCIAL DE PORTAS (apenas ether3, 4, 5)
:log info "NAVSPOT: Iniciando migracao PARCIAL de portas..."
[migrar ether5 → delay 2s]
[migrar ether4 → delay 2s]
[migrar ether3 → delay 2s]

# 12. PAUSA PARA TROCA DE CABO
:log warning "=========================================="
:log warning "NAVSPOT: MIGRACAO PARCIAL CONCLUIDA"
:log warning "ACAO NECESSARIA: [instruções]"
:log warning "=========================================="

# 13. FINALIZACAO PARCIAL
:log info "NAVSPOT v6.4 Parte 1: Bootstrap parcial concluido"
```

---

## Comparação de Versões

| Aspecto | v6.2 | v6.4 |
|---------|------|------|
| Scripts gerados | 1 | 2 |
| Migração ether2 | Automática | Manual (Parte 2) |
| Conexão durante script | Cai no final | Mantida |
| Validações na Parte 2 | N/A | bridge1 + IP |
| Controle do técnico | Nenhum | Total |
| Recuperação de erro | Difícil | Fácil |

---

## Resultado Esperado

| Benefício | Descrição |
|-----------|-----------|
| Segurança total | Validações impedem execução em estado inconsistente |
| Zero perda de conexão | Ether2 só migra na Parte 2 |
| Controle total | Técnico decide quando trocar cabo |
| Recuperável | Se Parte 2 falhar, ainda conectado para corrigir |
| Profissional | Checklist claro para técnicos de campo |

