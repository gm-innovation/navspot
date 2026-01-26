
# Plano: Melhorias em Dispositivos, Regras de Acesso e Perfis para Equipamentos

## Visao Geral

Este plano implementa melhorias no sistema para permitir controle granular de regras por dispositivo/equipamento, alem de facilitar a selecao de dispositivos cadastrados ao criar regras de acesso.

---

## 1. Expandir Tipos de Dispositivos para Equipamentos de Embarcacao

### Problema Atual
Os tipos de dispositivo atuais sao genericos (celular, notebook, tablet, desktop, outro) e nao contemplam equipamentos especificos de embarcacao.

### Solucao
Adicionar tipos especificos para equipamentos maritimos no hook `useDispositivosRegistrados.ts`:

```text
Novos tipos:
- camera (Camera de Seguranca)
- radar (Radar)
- gps (GPS/AIS)
- ecdis (ECDIS - Carta Eletronica)
- vdr (VDR - Caixa Preta)
- roteador (Roteador/Switch)
- passadico (Notebook Passadico)
- streaming (Equipamento de Streaming)
```

---

## 2. Melhorar Pagina de Regras de Acesso - Selecao de Dispositivos

### Problema Atual
O campo MAC Address na pagina de Regras de Acesso (linha 597-610) exige digitacao manual do MAC.

### Solucao
Substituir o campo de texto por um seletor que lista os dispositivos cadastrados:

**Arquivo:** `src/pages/RegrasAcesso.tsx`

**Mudancas:**
1. Importar hook `useDispositivosRegistrados`
2. Substituir campo de texto MAC por Select com opcoes:
   - Nenhum (sem filtro por MAC)
   - Dispositivos de tripulantes agrupados
   - Equipamentos de embarcacao agrupados
3. Manter opcao de digitar MAC manualmente para casos especiais

**Interface proposta:**
```text
+--------------------------------------------+
| Dispositivo                          [v]   |
+--------------------------------------------+
| -- Digitar MAC manualmente --              |
| --- Equipamentos de Embarcacao ---         |
|   Camera Principal (AA:BB:CC:DD:EE:01)     |
|   Radar Furuno (AA:BB:CC:DD:EE:02)         |
| --- Dispositivos de Tripulantes ---        |
|   iPhone Comandante (AA:BB:CC:DD:EE:03)    |
+--------------------------------------------+
```

---

## 3. Painel de Acoes Rapidas na Pagina de Dispositivos

### Problema Atual
Nao existe forma rapida de ativar/desativar regras especificas para um dispositivo.

### Solucao
Adicionar painel lateral ou modal com acoes rapidas ao clicar em "Ver Detalhes" de um dispositivo:

**Arquivo:** `src/pages/Dispositivos.tsx`

**Funcionalidades:**
1. Visualizar regras aplicadas ao dispositivo
2. Toggle rapido para ativar/desativar regras existentes
3. Atalho para criar nova regra especifica para o MAC
4. Historico de sessoes do dispositivo

---

## 4. Perfis de Velocidade para Equipamentos

### Problema Atual
Perfis de velocidade sao focados em tripulantes e nao contemplam necessidades de equipamentos (ex: upload prioritario para cameras).

### Solucao
Expandir tipos de usuario no hook `usePerfisVelocidade.ts`:

**Arquivo:** `src/hooks/usePerfisVelocidade.ts`

**Novos tipos:**
```text
Adicionar ao TIPOS_USUARIO:
- camera_streaming (Camera/Streaming)
- equipamento_navegacao (Equipamento de Navegacao)
- equipamento_rede (Equipamento de Rede)
```

**Campos sugeridos para perfis de equipamento:**
- Upload prioritario (para cameras que transmitem video)
- Sem limite de quota (equipamentos criticos)
- Prioridade maxima de QoS

---

## Resumo de Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/useDispositivosRegistrados.ts` | Expandir TIPOS_DISPOSITIVO com equipamentos maritimos |
| `src/hooks/usePerfisVelocidade.ts` | Adicionar tipos para equipamentos |
| `src/pages/RegrasAcesso.tsx` | Seletor de dispositivos cadastrados no lugar de input MAC |
| `src/pages/Dispositivos.tsx` | Painel de detalhes com regras e acoes rapidas |

---

## Detalhes Tecnicos

### Mudanca 1: TIPOS_DISPOSITIVO expandido
```typescript
export const TIPOS_DISPOSITIVO = [
  // Dispositivos pessoais
  { value: 'celular', label: 'Celular', categoria: 'pessoal' },
  { value: 'notebook', label: 'Notebook', categoria: 'pessoal' },
  { value: 'tablet', label: 'Tablet', categoria: 'pessoal' },
  { value: 'desktop', label: 'Desktop', categoria: 'pessoal' },
  // Equipamentos de embarcacao
  { value: 'camera', label: 'Camera de Seguranca', categoria: 'embarcacao' },
  { value: 'radar', label: 'Radar', categoria: 'embarcacao' },
  { value: 'gps', label: 'GPS/AIS', categoria: 'embarcacao' },
  { value: 'ecdis', label: 'ECDIS', categoria: 'embarcacao' },
  { value: 'vdr', label: 'VDR', categoria: 'embarcacao' },
  { value: 'roteador', label: 'Roteador/Switch', categoria: 'embarcacao' },
  { value: 'passadico', label: 'Notebook Passadico', categoria: 'embarcacao' },
  { value: 'streaming', label: 'Streaming', categoria: 'embarcacao' },
  { value: 'outro', label: 'Outro', categoria: 'outro' },
] as const;
```

### Mudanca 2: Seletor de dispositivos em RegrasAcesso
- Adicionar import do hook useDispositivosRegistrados
- Criar campo combo com grupos (Equipamentos / Tripulantes)
- Ao selecionar dispositivo, preencher automaticamente o mac_address

### Mudanca 3: Modal de detalhes em Dispositivos
- Criar novo componente DispositivoDetailsModal
- Buscar regras_acesso onde mac_address = dispositivo.mac_address
- Permitir toggle de ativo nas regras listadas
- Botao "Nova Regra para este Dispositivo"

---

## Ordem de Implementacao

1. Expandir TIPOS_DISPOSITIVO (base para outras mudancas)
2. Adicionar tipos de equipamento em perfis de velocidade
3. Implementar seletor de dispositivos em RegrasAcesso
4. Criar modal de detalhes com acoes rapidas em Dispositivos
