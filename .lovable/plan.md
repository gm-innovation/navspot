
# Plano: Adicionar Configuração de Perfil, Quota e Regras de Acesso para Equipamentos de Embarcação

## Contexto

O modal atual de "Novo Equipamento de Embarcação" permite apenas cadastrar MAC, nome, tipo e embarcação. Os equipamentos de embarcação (câmeras, radar, GPS, etc.) precisam das mesmas configurações que tripulantes:

- **Perfil de Velocidade** - define limites de download/upload
- **Pacote de Dados** - limite de consumo (quota)
- **Regras de Acesso** - whitelists/blacklists aplicadas

## Análise do Schema Atual

A tabela `dispositivos_registrados` não possui campo `perfil_id`. As opções são:

| Opção | Prós | Contras |
|-------|------|---------|
| Adicionar `perfil_id` na tabela | Simples, reutiliza infraestrutura existente | Requer migration |
| Criar regras de acesso via `mac_address` | Já funciona para regras | Perfil ainda precisa de referência |

**Solução escolhida**: Adicionar coluna `perfil_id` à tabela `dispositivos_registrados` para vincular equipamentos a perfis de velocidade.

---

## Mudanças no Banco de Dados

### Nova Migration

```sql
-- Adicionar perfil_id à tabela dispositivos_registrados
ALTER TABLE dispositivos_registrados 
ADD COLUMN perfil_id uuid REFERENCES perfis_velocidade(id) ON DELETE SET NULL;

-- Comentário para documentação
COMMENT ON COLUMN dispositivos_registrados.perfil_id IS 'Perfil de velocidade aplicado ao dispositivo';
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Dispositivos.tsx` | Expandir formulário com seleção de perfil e regras |
| `src/hooks/useDispositivosRegistrados.ts` | Incluir perfil no select/insert |
| `src/components/modals/DispositivoDetailsModal.tsx` | Exibir perfil vinculado |

---

## Nova UI do Modal de Equipamento

```
┌─────────────────────────────────────────────────────────────┐
│  Novo Equipamento de Embarcação                       [X]  │
│  Cadastre dispositivos de rede como radar, GPS, etc.       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ═══ Identificação ═══                                      │
│                                                             │
│  MAC Address *        [AA:BB:CC:DD:EE:FF           ]       │
│  Nome                 [Radar Principal              ]       │
│  Tipo                 [Radar                      ▼]       │
│  Embarcação *         [Sonda NS-01                ▼]       │
│                                                             │
│  ═══ Configuração de Acesso ═══                            │
│                                                             │
│  ○ Usar Perfil Pré-configurado                             │
│  ○ Configuração Personalizada                              │
│                                                             │
│  Perfil               [Câmera/Streaming           ▼]       │
│                       ↳ 50M/50M • Upload prioritário        │
│                                                             │
│  ═══ Regras de Acesso (opcional) ═══                       │
│                                                             │
│  ☐ Criar regras de acesso para este equipamento            │
│                                                             │
│  [Selecione listas...]                                     │
│  ┌───────────────────────────────────────┐                 │
│  │ ✓ Navegação Essencial  [whitelist]   │                 │
│  │ ✓ APIs Externas        [whitelist]   │                 │
│  └───────────────────────────────────────┘                 │
│                                                             │
│  ─────────────────────────────────────────────────         │
│  [Autorizado] ●────○                                       │
│  O dispositivo poderá se conectar à rede                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                        [Cancelar]  [Cadastrar]             │
└─────────────────────────────────────────────────────────────┘
```

---

## Detalhes Técnicos

### 1. Atualizar Hook de Dispositivos

```typescript
// useDispositivosRegistrados.ts - Atualizar interface
export interface DispositivoWithTripulante extends DispositivoRegistrado {
  tripulante?: { ... } | null;
  embarcacao?: { ... } | null;
  perfil?: {  // NOVO
    id: string;
    nome: string;
    velocidade_download: string;
    velocidade_upload: string;
    limite_dados_mb: number | null;
  } | null;
}

// Atualizar query para incluir perfil
.select(`
  *,
  tripulante:tripulantes(id, nome, cargo),
  embarcacao:embarcacoes(id, nome),
  perfil:perfis_velocidade(id, nome, velocidade_download, velocidade_upload, limite_dados_mb)
`)
```

### 2. Expandir Formulário (Dispositivos.tsx)

```typescript
// Estado expandido
const [newDevice, setNewDevice] = useState({
  mac_address: "",
  nome: "",
  tipo: "outro",
  embarcacao_id: "",
  autorizado: true,
  // NOVOS CAMPOS
  modo_config: "perfil" as "perfil" | "personalizado",
  perfil_id: "",
  velocidade_download: "5M",
  velocidade_upload: "2M",
  criar_regras: false,
  lista_ids: [] as string[],
});
```

### 3. Criar Regras Automaticamente

Quando `criar_regras` está ativo e há listas selecionadas, após criar o dispositivo:

```typescript
// Após criar dispositivo com sucesso
if (newDevice.criar_regras && newDevice.lista_ids.length > 0) {
  const regras = newDevice.lista_ids.map((lista_id, index) => ({
    empresa_id: empresaId,
    lista_id,
    mac_address: formattedMac,
    prioridade: 100 + index,
    ativo: true,
  }));
  
  await supabase.from('regras_acesso').insert(regras);
}
```

### 4. Modal de Detalhes - Exibir Perfil

No `DispositivoDetailsModal.tsx`, adicionar seção mostrando o perfil vinculado:

```tsx
{dispositivo.perfil && (
  <div className="space-y-1">
    <p className="text-sm text-muted-foreground">Perfil de Velocidade</p>
    <div className="flex items-center gap-2">
      <Badge variant="outline">
        {dispositivo.perfil.nome}
      </Badge>
      <span className="text-sm text-muted-foreground">
        {dispositivo.perfil.velocidade_download}/{dispositivo.perfil.velocidade_upload}
      </span>
    </div>
  </div>
)}
```

---

## Fluxo Completo

```text
1. Admin abre modal "Novo Equipamento"
2. Preenche MAC, nome, tipo, embarcação
3. Seleciona perfil "Câmera/Streaming" (50M/50M, upload prioritário)
4. Marca "Criar regras de acesso"
5. Seleciona listas: "APIs Externas", "Navegação Essencial"
6. Clica "Cadastrar"
7. Sistema:
   a. Cria dispositivo com perfil_id
   b. Cria 2 regras de acesso (uma por lista) com mac_address
8. Toast: "Dispositivo cadastrado com 2 regras de acesso"
```

---

## Resumo das Mudanças

| Componente | Mudança |
|------------|---------|
| **Banco de dados** | Nova coluna `perfil_id` em `dispositivos_registrados` |
| **Formulário** | Seções de perfil + regras de acesso |
| **Hook** | Select inclui dados do perfil vinculado |
| **Modal detalhes** | Exibe perfil e permite edição |
| **Criação** | Opcionalmente cria regras junto com dispositivo |

---

## Benefícios

- Equipamentos têm mesmos controles que tripulantes
- Câmeras de segurança podem ter upload prioritário
- GPS/ECDIS podem ter acesso restrito apenas a APIs necessárias
- Configuração centralizada em um único modal
